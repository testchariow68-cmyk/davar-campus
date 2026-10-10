/* ============================================================
   Routeur + démarrage
   ============================================================ */
function currentRoute() {
  const h = (location.hash || '#/').slice(1);
  const [path, qs] = h.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs || '') };
}
function go(p) { location.hash = '#' + p; }

function render() {
  document.getElementById('seo-landing')?.remove();   /* vu des crawlers sans JS ; l'app prend le relais */
  const app = document.getElementById('app');
  document.getElementById('cpUserPop')?.remove();
  const r = currentRoute();
  if (!S.session) {
    if (r.parts[0] === 'verifier') { app.innerHTML = vVerifyCert(r.parts[1] || ''); document.title = 'Vérification — Davar Académie'; return; }
    if (r.parts[0] === 'inscription') { app.innerHTML = vSignup(); window.scrollTo(0, 0); return; }
    app.innerHTML = vLogin(); bindLogin(); document.title = 'Connexion — Davar Académie Campus';
    if (typeof fpAutoArm === 'function') { fpAutoArm(); fpAutoPrompt(); }
    return;
  }
  if (r.parts[0] === 'verifier') { app.innerHTML = vVerifyCert(r.parts[1] || ''); return; }
  const u = getUser(S.session.userId);
  if (typeof applyUiScale === 'function') applyUiScale(u);
  /* Le menu de navigation garde sa position : cliquer sur un bouton éloigné ne ramène plus au début */
  const navEl = document.querySelector('.sidebar');
  const navScroll = navEl ? navEl.scrollLeft : 0;
  if (typeof EXPORT_READY !== 'undefined' && !(r.parts[0] === 'admin' && r.parts[1] === 'exports')) { try { EXPORT_READY = null; } catch (e) { } }
  if (r.parts[0] === 'admin') {
    if (!isStaff(u)) { go('/'); return; }
    app.innerHTML = adminShell(r, u);
    bindAdmin(r);
    const nav2 = document.querySelector('.sidebar');
    if (nav2) {
      nav2.scrollLeft = navScroll;
      const act = nav2.querySelector('.sb-item.active');
      if (act && act.scrollIntoView) act.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
    if (typeof fabRestore === 'function') fabRestore();
  } else {
    if (typeof CP !== 'undefined' && CP.navHist[CP.navHist.length - 1] !== r.path) CP.navHist.push(r.path);
    app.innerHTML = studentShell(r, u);
    bindStudent(r);
    if (typeof fabRestore === 'function') fabRestore();
  }
  if (r.parts[0] !== 'admin') window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
/* Esc (Échap) quitte la vue testée — ordinateur, et le bouton « Quitter » couvre mobile/tablette/TV */
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.session && S.session.viewAsReal && typeof quitViewAs === 'function') quitViewAs();
});
window.addEventListener('DOMContentLoaded', () => {
  if (typeof applyPalette === 'function') applyPalette();
  if (typeof runLifecycleEngine === 'function') runLifecycleEngine(false);   /* purge de contrôle périodique */
  if (!location.hash) location.hash = S.session ? (isStaff(getUser(S.session.userId)) ? '#/admin' : '#/') : '#/login';
  if (typeof rwCheckReminders === 'function') rwCheckReminders();
  if (typeof purgeExpiredAccounts === 'function') purgeExpiredAccounts();
  render();
});

/* ============================================================
   SYNCHRONISATION EN DIRECT — sans rechargement de page
   - uniquement les zones qui ont changé (pas toute la page)
   - changements groupés (un seul rafraîchissement par cycle)
   - zéro traitement si rien n'a changé (comparaison de révision)
   ============================================================ */
const SYNC = { rev: S.rev || 0, timer: null, areas: new Set() };
const syncChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('davar-sync') : null;
if (syncChannel) syncChannel.onmessage = e => receiveSync(e.data && e.data.rev);
window.addEventListener('storage', e => {
  if (e.key === DB_KEY && e.newValue) {
    try { receiveSync(JSON.parse(e.newValue).rev); } catch (err) { }
  }
});
setInterval(() => {
  try { const raw = localStorage.getItem(DB_KEY); if (raw) { const rev = JSON.parse(raw).rev || 0; if (rev > SYNC.rev) receiveSync(rev); } } catch (err) { }
}, 8000);
function receiveSync(rev) {
  if (!rev || rev <= SYNC.rev) return;            /* rien de nouveau → aucun appel */
  SYNC.rev = rev;
  const fresh = loadState();
  const areas = new Set(fresh._areas && fresh._areas.length ? fresh._areas : ['all']);
  S = fresh;                                       /* état rechargé depuis le cache local */
  areas.forEach(a => SYNC.areas.add(a));
  if (SYNC.timer) return;                          /* groupement : un seul rafraîchissement */
  SYNC.timer = setTimeout(applySync, 250);
}
function applySync() {
  SYNC.timer = null;
  const areas = SYNC.areas; SYNC.areas = new Set();
  if (!areas.size) return;
  const u = S.session && getUser(S.session.userId);
  if (!u) return;
  const r = currentRoute();
  if (areas.has('all')) { render(); return; }
  /* 1) cloche de notifications : mise à jour ciblée */
  if (areas.has('notifs') || areas.has('rewards')) {
    const box = document.getElementById('cpBellBox') || document.getElementById('adBellBox');
    if (box) box.innerHTML = bellHTML(u.id);
    if (r.parts[0] === 'notifications' || (r.parts[0] === 'admin' && r.parts[1] === '')) refreshPage(r, u);
  }
  /* 2) bandeau d'annonces / ticker */
  if (areas.has('ticker')) {
    const tk = document.querySelector('.ticker');
    if (tk) { const w2 = document.createElement('div'); w2.innerHTML = cpTickerHTML(u); if (w2.firstChild) tk.replaceWith(w2.firstChild); }
  }
  /* 3) contenu pédagogique (formations enrichies, ressources, progression) */
  if (areas.has('trainings') || areas.has('progress') || areas.has('chat')) refreshPage(r, u);
}
function refreshPage(r, u) {
  const box = document.getElementById('cpPage') || document.getElementById('adPage');
  if (!box) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return; /* on ne coupe jamais une saisie en cours */
  const y = window.scrollY;
  box.innerHTML = r.parts[0] === 'admin' ? adminPage(r, u) : studentPage(r, u);
  window.scrollTo(0, y);                          /* la position de lecture est conservée */
  if (typeof bindStudent === 'function' && r.parts[0] !== 'admin') bindStudent(r);
  if (typeof bindAdmin === 'function' && r.parts[0] === 'admin') bindAdmin(r);
}
