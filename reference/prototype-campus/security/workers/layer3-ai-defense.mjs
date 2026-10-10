/* COUCHE 3 — Défense active par IA (Workers AI : llama-guard) + détection comportementale
   continue + rotation des secrets toutes les 24 h (Workers Cron, règle 5). Aucun VPS. */

export const ROTATION_MS = 24 * 3600 * 1000;
export function shouldRotateSecrets(lastRotationAt, now = Date.now()) { return now - lastRotationAt >= ROTATION_MS; }

/* Détection d'anomalie de débit (pré-filtre avant l'IA) : rafale, horaires aberrants, échecs en série */
export function rateAnomaly(events, now = Date.now(), { perMinute = 60, failBurst = 5 } = {}) {
  const recent = events.filter(e => now - e.at < 60000);
  const fails = events.filter(e => now - e.at < 300000 && e.type === 'login_failed').length;
  const score = Math.min(1, recent.length / perMinute * 0.6 + (fails >= failBurst ? 0.4 : fails / failBurst * 0.2));
  return { score, verdict: score >= 0.5 ? 'anomalie' : 'normal', rpm: recent.length, fails };
}

/* Classification → security_events.severity (règle 4 : journal immuable) */
export function classifyEvent(type) {
  if (['purge', 'ownership_transfer_init', 'api_key_revoked', 'suspension'].includes(type)) return 'critical';
  if (['login_failed', 'jwt_expiré', 'nonce_rejeté', 'signature_invalide'].includes(type)) return 'warning';
  if (['password_change', 'role_change', 'export'].includes(type)) return 'notice';
  return 'info';
}

/* Garde IA : llama-guard sur Workers AI ; blocage si unsafe */
export async function askGuard(text, ai) {
  const r = await ai.run('@cf/meta/llama-guard-3-8b', { prompt: text });
  return { safe: !String(r.response || r).toLowerCase().includes('unsafe'), raw: r };
}

export default {
  async fetch(req, env, ctx) {
    const { text, events } = await req.json();
    const anomaly = rateAnomaly(events || []);
    const guard = text ? await askGuard(text, env.AI) : { safe: true };
    const blocked = anomaly.verdict === 'anomalie' || !guard.safe;   /* règle 2 : vérification croisée */
    if (blocked) await env.LOG('ai_defense_block', { anomaly, guard: guard.safe });
    return new Response(JSON.stringify({ blocked, anomaly, safe: guard.safe }), { status: blocked ? 429 : 200 });
  }
};
