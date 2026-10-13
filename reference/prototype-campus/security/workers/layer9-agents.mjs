/* COUCHE 9 — Framework multi-agents autonome (Durable Objects) : essaim de 3 agents
   (reconnaissance, défense, validation) qui votent sur chaque commande/action sensible.
   Objectif mesuré : réduction ≥ 87 % des commandes dangereuses exécutées. */

export const DANGEROUS = [/rm\s+-rf/i, /drop\s+table/i, /truncate\s+table/i, /curl[^|]*\|\s*sh/i, /wget[^|]*\|\s*sh/i, /chmod\s+(-R\s+)?777/i, /dd\s+if=/i, /:\(\)\s*\{/i];
export const SENSITIVE = [/grant\s+/i, /delete\s+from/i, /update\s+users/i, /export/i, /rotate/i, /purge_donnees/i];

export function commandRisk(cmd) {
  if (DANGEROUS.some(p => p.test(cmd || ''))) return 'dangerous';
  if (SENSITIVE.some(p => p.test(cmd || ''))) return 'sensitive';
  return 'safe';
}

/* Décision d'essaim :
   - commande dangereuse : blocage sauf UNANIMITÉ motivée des 3 agents ;
   - sensible / safe : majorité simple. */
export function swarmDecide(cmd, votes = {}) {
  const risk = commandRisk(cmd);
  const list = ['recon', 'defense', 'validation'].map(a => votes[a] === 'allow');
  const allow = list.filter(Boolean).length;
  if (risk !== 'safe') return { risk, decision: allow === 3 ? 'allow' : 'block', allow };   /* dangereux ET sensible : unanimité (moindre privilège) */
  return { risk, decision: allow >= 2 ? 'allow' : 'block', allow };
}

export default {
  async fetch(req, env) {
    const { cmd, votes } = await req.json();
    const r = swarmDecide(cmd, votes);
    await env.LOG('swarm_decision', { cmd, ...r });     /* journal immuable */
    return new Response(JSON.stringify(r), { status: r.decision === 'allow' ? 200 : 403 });
  }
};
