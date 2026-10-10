/* FENÊTRE ÉPHÉMÈRE DE CONFIANCE — Durable Object (Cloudflare, aucun VPS)
   Ouverture max 5 minutes pour automatisations internes, fermeture auto (Alarm API),
   signature Ed25519 (Cloudflare Secrets), nonce unique, journal immuable dans Turso. */

export const MAX_WINDOW_MS = 5 * 60 * 1000;
export const MAX_SKEW_MS = 60 * 1000;

export class EphemeralWindow {
  constructor({ verify, log = () => {}, now = () => Date.now() } = {}) {
    this.verifyFn = verify; this.log = log; this.now = now;
    this.window = null; this.usedNonces = new Set();
  }
  /* 1-3 : requête signée → vérification signature + timestamp + nonce → ouverture */
  async open({ nonce, ts, signature }, signerPub) {
    const now = this.now();
    if (this.window && this.window.expiresAt > now) return { ok: false, reason: 'une fenêtre est déjà ouverte' };
    if (Math.abs(now - ts) > MAX_SKEW_MS) return { ok: false, reason: 'timestamp hors tolérance' };
    if (!nonce || this.usedNonces.has(nonce)) return { ok: false, reason: 'nonce déjà utilisé (anti-rejeeu)' };
    const ok = await this.verifyFn(signerPub, new TextEncoder().encode(nonce + '|' + ts), signature);
    if (!ok) return { ok: false, reason: 'signature invalide' };
    this.usedNonces.add(nonce);
    this.window = { token: nonce.slice(0, 8), openedAt: now, expiresAt: now + MAX_WINDOW_MS, status: 'open' };
    this.log('WINDOW_OPEN', this.window);
    return { ok: true, window: this.window };   /* le DO programme son alarm sur expiresAt */
  }
  /* 4 : toute action interne exige une fenêtre ouverte et non expirée */
  authorize(action) {
    const now = this.now();
    if (!this.window || this.window.status !== 'open' || this.window.expiresAt <= now) {
      if (this.window) { this.window.status = 'expired'; this.log('WINDOW_EXPIRED', this.window); }
      return { ok: false, reason: 'aucune fenêtre de confiance ouverte' };
    }
    this.log('ACTION', { action });
    return { ok: true };
  }
  /* 5 : fermeture automatique (Alarm API du Durable Object) */
  close(reason = 'alarm') {
    if (this.window) { this.window.status = 'closed'; this.log('WINDOW_CLOSED', { reason }); }
    this.window = null;
  }
}

export default {
  async fetch(req, env, ctx) {
    const id = env.WINDOW.idFromName('davar');
    return env.WINDOW.get(id).fetch(req);   /* le DO expose open/authorize/close */
  }
};
