/* COUCHE 7 — Détection de bots sans CAPTCHA : signature comportementale (micro-mouvements)
   côté client (<0,5 ms) + Cloudflare Turnstile en complément. Aucun VPS. */

/* Analyse multi-factorielle d'un échantillon de mouvements [{t, x, y, p(ression)}] */
export function scoreTelemetry(samples = []) {
  if (samples.length < 8) return { score: 1, verdict: 'bot', reason: 'échantillon insuffisant' };
  const dt = samples.slice(1).map((s, i) => s.t - samples[i].t);
  const mean = dt.reduce((a, b) => a + b, 0) / dt.length;
  const variance = dt.reduce((a, b) => a + (b - mean) ** 2, 0) / dt.length;
  const jitter = samples.slice(1).map((s, i) => Math.hypot(s.x - samples[i].x, s.y - samples[i].y));
  const micro = jitter.filter(d => d > 0 && d < 2).length / jitter.length;   /* micro-tremblements neuromusculaires */
  const regularity = mean > 0 ? Math.sqrt(variance) / mean : 1;              /* un humain est irrégulier */
  let score = 0;
  if (regularity < 0.05) score += 0.5;        /* cadence trop parfaite → automate */
  if (micro < 0.1) score += 0.3;              /* aucun micro-mouvement → simulation */
  const straight = samples.slice(2).filter((s, i) => {
    const a = samples[i], b = samples[i + 1];
    return Math.abs((b.x - a.x) * (s.y - a.y) - (b.y - a.y) * (s.x - a.x)) < 1e-9;
  }).length / samples.length;
  if (straight > 0.9) score += 0.2;           /* trajectoire parfaitement droite */
  score = Math.min(1, score);
  return { score, verdict: score >= 0.5 ? 'bot' : 'human', regularity, micro };
}

export async function verifyTurnstile(token, secret, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret, response: token })
  });
  const j = await r.json();
  return { ok: !!j.success, codes: j['error-codes'] || [] };
}

export default {
  async fetch(req, env) {
    const { telemetry, turnstile } = await req.json();
    const t = scoreTelemetry(telemetry);
    const ts = turnstile ? await verifyTurnstile(turnstile, env.TURNSTILE_SECRET) : { ok: false };
    const trusted = t.verdict === 'human' || ts.ok;     /* règle 2 : vérification croisée */
    return new Response(JSON.stringify({ trusted, telemetry: t, turnstile: ts.ok }), { status: trusted ? 200 : 403 });
  }
};
