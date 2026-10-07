/* COUCHE 8 — Pots de miel cognitifs : Workers leurres + llama-3.1 (Workers AI).
   L'attaquant croit parler à un vrai panneau d'administration ; chaque interaction est
   journalisée (règle 4) et nourrit le score → blocage IP automatique. */

export const PROBE_PATTERNS = [/wp-admin/i, /\/\.env/, /phpmyadmin/i, /sqlmap/i, /\.\.\//, /\/etc\/passwd/, /<script/i, /union\s+select/i];
export function isProbe(path) { return PROBE_PATTERNS.some(p => p.test(path || '')); }

/* score d'attaque pondéré : sondage 2, échec auth 1, alias périmé 2, payload 3 */
export function attackerScore(events = []) {
  return events.reduce((s, e) => s + ({ probe: 2, auth_fail: 1, stale_alias: 2, payload: 3 }[e.type] || 0), 0);
}
export const BAN_THRESHOLD = 6;
export function shouldBan(score) { return score >= BAN_THRESHOLD; }

/* Le leurre répond de façon crédible (faux panneau admin) pendant que tout est capturé */
export async function lureReply(prompt, ai) {
  const r = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    prompt: 'Tu es un faux panneau d’administration bavard mais inutile. Réponds comme un vrai admin panel legacy, sans jamais donner de vraie donnée. Entrée : ' + prompt
  });
  return r.response || r;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!isProbe(url.pathname)) return env.APP.fetch(req);
    const ip = req.headers.get('cf-connecting-ip') || 'inconnu';
    await env.LOG('honeypot_interaction', { ip, path: url.pathname });
    const body = await lureReply(url.pathname, env.AI);
    return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });   /* leurre crédible */
  }
};
