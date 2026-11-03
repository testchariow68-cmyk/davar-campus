/* COUCHE 4 — Signature comportementale propriétaire : apprentissage du comportement unique
   (rythme de frappe, dynamique du pointeur, micro-mouvements — facteurs locaux pris en compte
   via calibration par utilisateur). Le vecteur est chiffré (couche 2) avant stockage Turso. */

export function buildProfile(samples = []) {
  if (samples.length < 10) return null;
  const dt = samples.slice(1).map((s, i) => s.t - samples[i].t);
  const pr = samples.map(s => s.p ?? 0.5);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
  const jit = samples.slice(1).map((s, i) => Math.hypot(s.x - samples[i].x, s.y - samples[i].y));
  return [
    round(mean(dt) / 100), round(sd(dt) / 100),          /* cadence : moyenne + irrégularité */
    round(mean(pr) * 100), round(sd(pr) * 100),          /* pression */
    round(jit.filter(d => d > 0 && d < 2).length / jit.length * 100)  /* taux de micro-mouvements */
  ];
}
const round = x => Math.round(x * 100) / 100;

/* Similarité = 1 − distance moyenne normalisée par échelle propre à chaque facteur */
const SCALES = [1, 0.5, 50, 10, 100];
export function similarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  const d = a.reduce((s, v, i) => s + Math.abs(v - b[i]) / (SCALES[i] || 1), 0) / a.length;
  return Math.max(0, Math.round((1 - d) * 100) / 100);
}

/* Mise à jour du score de confiance (0-100) : dérive progressive, jamais de saut brutal */
export function trustUpdate(prevScore, sim, { floor = 0, cap = 100 } = {}) {
  const delta = sim > 0.92 ? +4 : sim > 0.8 ? +1 : sim > 0.6 ? -6 : -25;
  return Math.max(floor, Math.min(cap, prevScore + delta));
}

export default {
  async fetch(req, env) {
    const { userId, samples } = await req.json();
    const vec = buildProfile(samples);
    if (!vec) return new Response(JSON.stringify({ error: 'échantillon insuffisant' }), { status: 400 });
    const row = await env.DB.get('behavioral_profiles', userId);       /* vecteur chiffré en base */
    const prev = row ? row.profile_vector : null;
    const sim = prev ? similarity(prev, vec) : 1;
    const score = trustUpdate(row ? row.trust_score : 80, sim);
    await env.DB.put('behavioral_profiles', { user_id: userId, profile_vector: vec, trust_score: score });
    return new Response(JSON.stringify({ sim, score }), { status: score >= 40 ? 200 : 403 });
  }
};
