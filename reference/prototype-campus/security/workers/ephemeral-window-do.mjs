/* PHASE 5 — Fenêtre éphémère de confiance déployée en Durable Object.
   État persistant (state.storage), fermeture auto par Alarm API, journal immuable (règle 4). */

import { EphemeralWindow } from './ephemeral-window.mjs';
import { auditAppend } from './audit-chain.mjs';

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });

export class EphemeralWindowDO {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.events = env.SECURITY_EVENTS || (env.SECURITY_EVENTS = []);
    const now = env.NOW || (() => Date.now());
    this.win = new EphemeralWindow({
      verify: env.VERIFY, now,
      log: (t, d) => { auditAppend(this.events, t, d, now()); }
    });
  }
  async fetch(req) {
    const { op, body = {} } = await req.json();
    if (op === 'open') {
      const r = await this.win.open(body, body.pub);
      if (r.ok) { await this.state.storage.put('window', this.win.window); await this.state.storage.setAlarm(this.win.window.expiresAt); }
      return json(r, r.ok ? 200 : 403);
    }
    if (op === 'authorize') { const r = this.win.authorize(body.action); return json(r, r.ok ? 200 : 403); }
    if (op === 'close') { this.win.close('manuelle'); await this.state.storage.put('window', null); return json({ ok: true }); }
    return json({ error: 'opération inconnue' }, 404);
  }
  async alarm() { this.win.close('alarm'); await this.state.storage.put('window', null); }
}

export default {
  async fetch(req, env) {
    const id = env.WINDOW_DO.idFromName('davar');
    return env.WINDOW_DO.get(id).fetch(req);
  }
};
