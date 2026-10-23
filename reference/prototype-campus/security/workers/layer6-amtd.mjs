/* COUCHE 6 — Cible mobile autonome (AMTD) : les routes API mutent dynamiquement.
   Un scanner qui découvre une route ne trouve qu'un alias éphémère ; l'ancienne adresse
   part au pot de miel (couche 8). Mutation planifiée + mutation sur attaque (Durable Object). */

export function hashStr(s) { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h; }
export const aliasOf = (route, epoch) => 'r' + hashStr(route + '#' + epoch).toString(36);

export class RouteMutator {
  constructor({ routes = ['/api/paiement', '/api/connexion', '/api/admin'], intervalMs = 3600000, now = () => Date.now() } = {}) {
    this.routes = routes; this.intervalMs = intervalMs; this.now = now;
    this.epoch = 1; this.epochStart = now(); this.log = []; this.lastReason = 'init';
  }
  aliases() { const e = this.epoch; return Object.fromEntries(this.routes.map(r => [aliasOf(r, e), r])); }
  /* résolution : alias courant (et epoch précédent pendant 60 s de grâce) */
  resolve(alias) {
    const hit = this.routes.find(r => aliasOf(r, this.epoch) === alias);
    if (hit) return { route: hit, stale: false };
    const old = this.routes.find(r => aliasOf(r, this.epoch - 1) === alias);
    /* grâce de 60 s seulement pour une rotation planifiée ; coupure immédiate sur attaque */
    if (old && this.lastReason !== 'attaque détectée' && this.now() - this.epochStart < 60000) return { route: old, stale: true };
    return null;   /* → couche 8 : pot de miel */
  }
  mutate(reason) { this.epoch++; this.epochStart = this.now(); this.lastReason = reason; this.log.push({ at: this.epochStart, reason, epoch: this.epoch }); return this.aliases(); }
  tick() { if (this.now() - this.epochStart >= this.intervalMs) this.mutate('planifiée'); }
}

export default {
  async fetch(req, env, ctx) {
    const id = env.AMTD.idFromName('routes');
    return env.AMTD.get(id).fetch(req);   /* le DO garde l'epoch + journal de mutation */
  }
};
