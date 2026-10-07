/* ===== Pont sécurité : couches 7 (bots) et 9 (essaim) branchées sur le prototype =====
   Les modules réels (security/workers/*.mjs) sont chargés par le <script type="module">
   de index.html et exposés dans window.SEC. En leur absence (tests), les passerelles
   laissent passer — les tests injectent window.SEC eux-mêmes. */
window.SEC_TELEMETRY = { samples: [], on: false };
function secStartTelemetry() {
  if (window.SEC_TELEMETRY.on) return; window.SEC_TELEMETRY.on = true;
  const push = (x, y, p) => { if (window.SEC_TELEMETRY.samples.length < 300) window.SEC_TELEMETRY.samples.push({ t: Date.now(), x, y, p }); };
  document.addEventListener('pointermove', e => push(e.clientX, e.clientY, 0.5), { passive: true });
  document.addEventListener('pointerdown', e => push(e.clientX, e.clientY, 0.9), { passive: true });
  document.addEventListener('keydown', () => push(-1, -1, 0.4), { passive: true });
}
if (typeof document !== 'undefined') secStartTelemetry();

/* Couche 7 : la connexion est refusée si la télémétrie ressemble à un automate */
function secLoginGate() {
  const L7 = window.SEC && window.SEC.L7;
  if (!L7) return { ok: true };
  const r = L7.scoreTelemetry(window.SEC_TELEMETRY.samples);
  window.SEC_TELEMETRY.samples = [];
  if (r.verdict === 'bot') return { ok: false, reason: 'Vérification de comportement échouée — utilisez votre appareil normalement puis réessayez.' };
  return { ok: true, score: r.score };
}

/* Couche 9 : l'essaim vote avant toute purge immédiate (action destructive) */
function secSwarmPurge(stu) {
  const L9 = window.SEC && window.SEC.L9;
  if (!L9) return { decision: 'allow', allow: 3, risk: 'safe' };
  const inQuarantine = S.purgePending.some(p => p.userId === stu.id);
  const noException = stu.hold !== true && !S.submissions.some(x => x.userId === stu.id && x.status === 'pending');
  const adminOk = !!(S.session && getUser(S.session.userId) && getUser(S.session.userId).role === 'admin');
  const votes = { recon: inQuarantine ? 'allow' : 'block', defense: noException ? 'allow' : 'block', validation: adminOk ? 'allow' : 'block' };
  const r = L9.swarmDecide('purge_donnees_personnelles ' + stu.id, votes);
  if (typeof recordAudit === 'function') recordAudit('swarm_decision', { userId: stu.id, votes, decision: r.decision });
  return r;
}
