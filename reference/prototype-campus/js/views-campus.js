/* ============================================================
   DAVAR ACADÉMIE — Nouvelle expérience étudiant (V4)
   Coquille mature : rail latéral, menu plein écran structuré,
   cockpit « que faire maintenant ? », ressources, certificats.
   ============================================================ */
const CP = { menu: false, audio: { id: null, playing: false, pos: 0 }, audioList: false, certIdx: 0, navHist: [], drill: { tid: null, ci: null }, xv: null, rv: null };

function cpGreet() { const h = new Date().getHours(); if (h < 5) return 'Bonne nuit'; if (h < 12) return 'Bonjour'; if (h < 18) return 'Bon après-midi'; return 'Bonsoir'; }
function myTids(u) { return myTrainings(u.id).map(t => t.id); }
function activeTid(u) { const ids = myTids(u); return (S.activeTraining[u.id] && ids.includes(S.activeTraining[u.id])) ? S.activeTraining[u.id] : ids[0] || null; }
function setActiveTid(u, tid) { const uid = typeof u === 'string' ? u : u.id; S.activeTraining[uid] = tid; UI.taOpen = false; save(); render(); toast('Formation active mise à jour ✓', 'ok', 'cap'); }
function taToggle() { UI.taOpen = !UI.taOpen; UI.bellOpen = false; UI.userMenu = false; render(); }
function bookOf(id) { return S.resources.find(r => r.id === id && r.type === 'book'); }
function audioOf(id) { return S.resources.find(r => r.id === id && r.type === 'audio'); }
function myBooks(u) { return S.resources.filter(r => r.type === 'book' && (r.assignedTo.includes(u.id) || !r.assignedTo.length)); }
function myAudios(u) { return S.resources.filter(r => r.type === 'audio' && (r.assignedTo.includes(u.id) || !r.assignedTo.length)); }

function cpBack() {
  if (window.history.length > 1) { window.history.back(); return; }
  location.hash = '#/';
}
function setUiScale(v) {
  const u = S.session && getUser(S.session.userId); if (!u) return;
  u.uiScale = v; save(); applyUiScale(u); render();
  toast('Taille d’affichage : ' + Math.round(v * 100) + ' %', 'ok', 'sliders');
}
function applyUiScale(u) { document.documentElement.style.zoom = u && u.uiScale && u.uiScale !== 1 ? u.uiScale : ''; }
/* Accueil flottant : 1 tap = page précédente · double tap = accueil */
let HOME_T = null;
/* Bouton Home déplaçable : on le glisse où l’on veut, la position est mémorisée */
let FAB_DRAG = null, FAB_SUPPRESS = false, FAB_LAST = null;
function fabPlace(x, y, persist) {
  const el = document.querySelector('.fab-home'); if (!el) return;
  const w = window.innerWidth, h = window.innerHeight, m = 8, sz = el.offsetWidth || 44;
  x = Math.max(m, Math.min(w - sz - m, x)); y = Math.max(m, Math.min(h - sz - m, y));
  el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
  FAB_LAST = { x, y };
  if (persist) { try { localStorage.setItem('davar_fab_pos', JSON.stringify({ x: Math.round(x), y: Math.round(y) })); } catch (e) {} }
}
function fabRestore() {
  try { const v = JSON.parse(localStorage.getItem('davar_fab_pos') || 'null'); if (v && v.x != null) fabPlace(v.x, v.y, false); } catch (e) {}
}
function fabDown(e) {
  const r = e.currentTarget.getBoundingClientRect();
  FAB_DRAG = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
}
function fabMove(e) {
  if (!FAB_DRAG) return;
  const dx = e.clientX - FAB_DRAG.sx, dy = e.clientY - FAB_DRAG.sy;
  if (!FAB_DRAG.moved && Math.hypot(dx, dy) > 7) {
    FAB_DRAG.moved = true;
    const el = document.querySelector('.fab-home'); if (el) el.classList.add('dragging');
  }
  if (FAB_DRAG.moved) { if (e.cancelable && e.preventDefault) e.preventDefault(); fabPlace(FAB_DRAG.ox + dx, FAB_DRAG.oy + dy, false); }
}
function fabUp() {
  if (!FAB_DRAG) return;
  const el = document.querySelector('.fab-home'); if (el) el.classList.remove('dragging');
  if (FAB_DRAG.moved && el) {
    if (FAB_LAST) fabPlace(FAB_LAST.x, FAB_LAST.y, true);
    FAB_SUPPRESS = true; setTimeout(() => { FAB_SUPPRESS = false; }, 80);
  }
  FAB_DRAG = null;
}
document.addEventListener('pointermove', fabMove, { passive: false });
document.addEventListener('pointerup', fabUp);
document.addEventListener('pointercancel', fabUp);
window.addEventListener('resize', fabRestore);
function fabHomeTap(e) {
  if (e) e.preventDefault();
  if (FAB_SUPPRESS) return;
  const me = S.session ? getUser(S.session.userId) : null;
  const home = me && isStaff(me) ? '#/admin' : '#/';
  /* Profil en cours de modification : 1 tape = confirmation (comme « Annuler ») · 2 tapes = sortie forcée, rien n’est enregistré */
  if (HOME_T) { clearTimeout(HOME_T); HOME_T = null; if (pfEditingDirty()) pfReset(); location.hash = home; return; }
  if (pfEditingDirty()) {
    HOME_T = setTimeout(() => { HOME_T = null;
      confirmModal('Quitter le profil ?', 'Vous avez des modifications non enregistrées. Elles seront perdues.', 'Quitter sans enregistrer', true)
        .then(v => { if (v) { pfReset(); location.hash = home; } }); }, 280);
    return;
  }
  HOME_T = setTimeout(() => { HOME_T = null; cpBack(); fabHint(); }, 280);
}
function fabHint() {
  const old = document.getElementById('fabHint'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'fabHint'; d.className = 'fab-hint';
  d.innerHTML = 'Glissez le bouton pour le placer où vous voulez';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

function openCpMenu() { CP.menu = true; render(); }
function closeCpMenu() { CP.menu = false; render(); }

function cpCrumbs(r) {
  const p = r.parts;
  const home = { label: 'Accueil', hash: '#/' };
  const forms = { label: 'Mes formations', hash: '#/formations' };
  if (p.length === 0) return [home];
  if (p[0] === 'formation' && p[1]) {
    const tr = typeof getTraining === 'function' ? getTraining(p[1]) : null;
    const tLink = { label: tr ? tr.title : 'Formation', hash: '#/formation/' + p[1] };
    if (p[2] === 'module') return [home, forms, tLink, { label: 'Chapitre en cours' }];
    if (p[2] === 'exercice') return [home, forms, tLink, { label: 'Exercice' }];
    if (p[2] === 'evaluation') return [home, forms, tLink, { label: 'Évaluation' }];
    return [home, forms, tLink];
  }
  if (p[0] === 'livre') return [home, { label: 'Mes livres', hash: '#/livres' }, { label: 'Lecture' }];
  const map = {
    formations: forms, exercices: { label: 'Mes exercices', hash: '#/exercices' }, quiz: { label: 'Mes évaluations', hash: '#/quiz' },
    livres: { label: 'Mes livres', hash: '#/livres' }, audios: { label: 'Mes audios', hash: '#/audios' },
    certificats: { label: 'Mes certificats', hash: '#/certificats' }, recompenses: { label: 'Mes récompenses', hash: '#/recompenses' },
    avis: { label: 'Mes avis', hash: '#/avis' }, questions: { label: 'Mes questions', hash: '#/questions' },
    notifications: { label: 'Notifications', hash: '#/notifications' }, profil: { label: 'Mon profil', hash: '#/profil' },
    parametres: { label: 'Paramètres', hash: '#/parametres' }, catalogue: { label: 'Découvrir des formations', hash: '#/catalogue' }
  };
  return map[p[0]] ? [home, map[p[0]]] : [home];
}

/* ---------------- Coquille ---------------- */
function studentPage(r, u) {
  const p = r.parts;
  let page;
  if (p.length === 0) page = vHome(u);
  else if (p[0] === 'formations') page = vFormations(u);
  else if (p[0] === 'exercices') page = vExercises(u);
  else if (p[0] === 'quiz') page = vQuizzes(u);
  else if (p[0] === 'livres') page = vBooks(u);
  else if (p[0] === 'livre') page = vReader(u, p[1]);
  else if (p[0] === 'audios') page = vAudios(u);
  else if (p[0] === 'certificats') page = vCerts(u);
  else if (p[0] === 'recompenses') page = vRewards(u);
  else if (p[0] === 'avis') page = vAvis(u);
  else if (p[0] === 'questions') page = vQuestions(u);
  else if (p[0] === 'notifications') page = vNotifs(u);
  else if (p[0] === 'profil') page = vProfileNew(u);
  else if (p[0] === 'parametres') page = vSettings(u);
  else if (p[0] === 'catalogue') page = vDiscover(u);
  else if (p[0] === 'formation' && p[1]) {
    if (p[2] === 'module' && p[3]) page = vModule(u, p[1], p[3]);
    else if (p[2] === 'exercice' && p[3]) page = vExercise(u, p[1], p[3]);
    else if (p[2] === 'evaluation' && p[3]) page = vEvaluation(u, p[1], p[3]);
    else page = vTraining(u, p[1]);
  }
  else if (p[0] === 'checkout' && p[1]) page = vCheckout(u, p[1]);
  else page = vNotFound();
  return page;
}
function studentShell(r, u) {
  if (isSuspended(u)) return `
    <div class="gate"><div class="gcard" style="max-width:420px;text-align:center">
      <img class="lg-logo" src="assets/campus-logo.png" alt="Davar Académie">
      <h2 style="color:#fff;margin-top:18px">Compte suspendu</h2>
      <p style="color:rgba(255,255,255,.75);font-size:14px;margin:10px 0 18px">Votre accès est temporairement suspendu. Contactez le support pour régulariser votre situation.</p>
      <button class="btn" style="width:100%" onclick="openSupport(true)">${icon('headset',15)} Contacter le support</button>
    </div></div>
    ${SUP.open ? supportPanelHTML(u) : ''}`;

  const page = studentPage(r, u);
  const onModule = r.parts[0] === 'formation' && r.parts[2] === 'module';
  const themeIco = currentTheme() === 'dark' ? icon('sun', 18) : icon('moon', 18);
  if (typeof checkReviewRequests === 'function') checkReviewRequests(u);

  return `
  <div class="cp-app">
    <aside class="rail" aria-label="Navigation principale">
      <a class="rail-brand" href="#/" title="Accueil">${brandHTML('#/')}</a>
      <a class="rail-ico rail-home ${r.path === '' ? 'on' : ''}" href="#/" title="Accueil">${icon('home', 18)}<span>Accueil</span></a>
      <button class="rail-ico" onclick="openCpMenu()" title="Menu">${icon('menu', 18)}<span>Menu</span></button>
      <div class="rail-sp"></div>
      <button class="rail-ico" onclick="toggleTheme()" title="Changer le thème">${themeIco}<span>Thème</span></button>
      <a class="rail-ico rail-ava ${r.path.startsWith('profil') ? 'on' : ''}" href="#/profil" title="Mon profil">${avatarHTML(u)}</a>
    </aside>

    <div class="cp-main">
      ${typeof viewAsBannerHTML === 'function' ? viewAsBannerHTML() : ''}
      <header class="cp-top">
        <div class="row" style="gap:8px;min-width:0">
          <div class="cp-crumb">${cpCrumbs(r).map((c, i, arr) => (i < arr.length - 1 && c.hash) ? `<a href="${c.hash}">${esc(c.label)}</a><span class="sep">›</span>` : `<span class="cur">${esc(c.label)}</span>`).join('')}</div>
        </div>
        <div class="row" style="gap:6px">
          <button class="icon-btn d-lg-none" onclick="openCpMenu()" title="Menu">${icon('menu', 17)}</button>
          <div id="cpBellBox" style="position:relative">${bellHTML(u.id)}</div>
          <button class="icon-btn d-lg-none" onclick="toggleTheme()" title="Thème">${themeIco}</button>
          <button class="cp-ava-btn" onclick="cpUserMenu(this)" title="Mon compte">${avatarHTML(u, 'sm')}</button>
        </div>
      </header>

      <main class="cp-content" id="cpPage">${page}</main>

      ${cpTicker(u)}
    </div>

    ${CP.menu ? cpMenuHTML(u, r) : ''}
    ${rwRevealHTML(u)}
    <a class="fab-home" href="javascript:void(0)" onpointerdown="fabDown(event)" onclick="fabHomeTap(event)" title="Glissez pour déplacer · 1 tap : retour · 2 taps : accueil">${icon('home', 17)}</a>
    ${onModule ? `<button class="fab-sup" onclick="openSupport()" title="Aide">${icon('headset', 20)}</button>` : ''}
    ${SUP.pop && typeof supPopHTML === 'function' ? supPopHTML(u) : ''}
    ${SUP.open ? supportPanelHTML(u) : ''}
    ${CHAT.open ? chatPanelHTML(u) : ''}
  </div>`;
}

function cpUserMenu(btn) {
  const u = S.session && S.users.find(x => x.id === S.session.userId);
  if (!u) return;
  let m = document.getElementById('cpUserPop');
  if (m) { m.remove(); return; }
  m = document.createElement('div'); m.id = 'cpUserPop'; m.className = 'u-menu show';
  m.innerHTML = `
    <div class="u-head">${avatarHTML(u)}<div><b>${esc(u.name)}</b><div class="xs muted">${esc(u.email)}</div></div></div>
    <button class="u-it" onclick="location.hash='#/profil'">${icon('user',15)} Mon profil</button>
    <button class="u-it" onclick="location.hash='#/parametres'">${icon('settings',15)} Paramètres</button>
    <div class="divider"></div>
    <button class="u-it" style="color:var(--danger)" onclick="logout()">${icon('logout',15)} Se déconnecter</button>`;
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  m.style.top = (r.bottom + 8) + 'px'; m.style.right = (window.innerWidth - r.right) + 'px';
  setTimeout(() => document.addEventListener('click', function cl(e) { if (!m.contains(e.target) && e.target !== btn) { m.remove(); document.removeEventListener('click', cl); } }), 10);
}

/* ---------------- Menu plein écran ---------------- */
function cpMenuHTML(u, r) {
  const tid = activeTid(u);
  const pr = tid ? trainingProgress(u.id, getTraining(tid)).pct : 0;
  const it = (href, ico, label, desc) => {
    const active = ('#/' + href) === '#/' + r.path || (href === '' && r.path === '');
    return `<a class="mn-it ${active ? 'on' : ''}" href="#/${href}" onclick="closeCpMenu()">
      <span class="mn-ico">${icon(ico, 17)}</span><span class="mn-tx"><b>${label}</b><small>${desc}</small></span></a>`;
  };
  const sec = (title, rows) => `<div class="mn-sec"><div class="mn-title">${title}</div>${rows}</div>`;
  return `
  <div class="cp-menu" role="dialog" aria-label="Menu du campus" onclick="if(event.target===this)closeCpMenu()">
    <div class="mn-panel">
    <div class="mn-head">
      <div class="row">${avatarHTML(u, 'lg')}<div><b>${esc(u.name)}</b><div class="xs muted">${tid ? esc(getTraining(tid).title) + ' · ' + pr + ' %' : 'Aucune formation active'}</div></div></div>
      <button class="icon-btn" onclick="closeCpMenu()" title="Fermer">${icon('x', 18)}</button>
    </div>
    <div class="mn-body">
      ${sec('Général', it('', 'home', 'Accueil', 'Votre cockpit du jour'))}
      ${sec('Mon parcours',
        it('formations', 'cap', 'Mes formations', 'Vos formations achetées') +
        it('exercices', 'edit', 'Mes exercices', 'Travaux corrigés par votre coach') +
        it('quiz', 'clipboard', 'Mes évaluations', 'Historique, tentatives et prochaine évaluation'))}
      ${sec('Mes ressources',
        it('livres', 'book', 'Mes livres', 'Lecture dans la plateforme') +
        it('audios', 'headset', 'Mes audios', 'Écoute avec reprise automatique'))}
      ${sec('Mon campus',
        it('certificats', 'award', 'Mes certificats', 'Vos validations officielles') +
        it('recompenses', 'rw_seal', 'Mes récompenses', 'Les étapes qui racontent votre parcours') +
        it('questions', 'message', 'Mes questions', 'Vos conversations, réponses comprises'))}
      ${sec('Mon compte',
        it('profil', 'user', 'Mon profil', 'Nom, photo, informations') +
        it('parametres', 'settings', 'Paramètres', 'Thème, notifications, support'))}
    </div>
    <div class="mn-foot">
      <button class="btn" onclick="toggleTheme();openCpMenu()">${currentTheme() === 'dark' ? icon('sun', 15) : icon('moon', 15)} Thème ${currentTheme() === 'dark' ? 'clair' : 'sombre'}</button>
      <button class="btn btn-danger-ghost" onclick="logout()">${icon('logout', 15)} Se déconnecter</button>
    </div>
    </div>
  </div>`;
}

/* ---------------- Ticker bas : annonces + réseaux ---------------- */
/* Vrais logos des plateformes, avec leurs couleurs officielles */
function socialLogo(platform) {
  const p = (platform || '').toLowerCase();
  const L = {
    facebook: '<rect width="24" height="24" rx="6" fill="#1877F2"/><path d="M13.4 21v-6.9h2.3l.4-2.7h-2.7V9.6c0-.8.4-1.5 1.6-1.5h1.3V5.8s-1.1-.2-2.2-.2c-2.3 0-3.8 1.4-3.8 3.9v2H8v2.7h2.3V21z" fill="#fff"/>',
    instagram: '<defs><linearGradient id="igG" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".3" stop-color="#FA7E1E"/><stop offset=".55" stop-color="#D62976"/><stop offset=".8" stop-color="#962FBF"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect width="24" height="24" rx="6.5" fill="url(#igG)"/><rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4.2" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="16.4" cy="7.6" r="1" fill="#fff"/>',
    tiktok: '<rect width="24" height="24" rx="6" fill="#010101"/><path d="M14.6 5.4c.4 2.1 1.9 3.5 4 3.7v2.5c-1.5 0-2.9-.5-4-1.3v5.3a4.8 4.8 0 11-4.8-4.8c.3 0 .6 0 .9.1v2.6a2.2 2.2 0 101.4 2.1V5.4z" fill="#25F4EE" transform="translate(-.6 -.4)"/><path d="M14.6 5.4c.4 2.1 1.9 3.5 4 3.7v2.5c-1.5 0-2.9-.5-4-1.3v5.3a4.8 4.8 0 11-4.8-4.8c.3 0 .6 0 .9.1v2.6a2.2 2.2 0 101.4 2.1V5.4z" fill="#FE2C55" transform="translate(.6 .4)"/><path d="M14.6 5.4c.4 2.1 1.9 3.5 4 3.7v2.5c-1.5 0-2.9-.5-4-1.3v5.3a4.8 4.8 0 11-4.8-4.8c.3 0 .6 0 .9.1v2.6a2.2 2.2 0 101.4 2.1V5.4z" fill="#fff"/>',
    youtube: '<rect width="24" height="24" rx="6" fill="#FF0000"/><path d="M9.7 8.3l5.8 3.7-5.8 3.7z" fill="#fff"/>',
    linkedin: '<rect width="24" height="24" rx="5" fill="#0A66C2"/><path d="M8.3 10.2H6V18h2.3zM7.1 9.1a1.35 1.35 0 100-2.7 1.35 1.35 0 000 2.7zM18 13.4c0-2.4-1.3-3.5-3-3.5-1.4 0-2 .8-2.4 1.3v-1h-2.3V18h2.3v-4.2c0-1.1.5-1.8 1.5-1.8s1.5.7 1.5 1.8V18H18z" fill="#fff"/>',
    x: '<rect width="24" height="24" rx="6" fill="#000"/><path d="M17.8 6h-2.7l-3 4.1L9.2 6H6l4.6 6.2L6 18h2.7l3.2-4.4 3.2 4.4h3.2l-4.8-6.5z" fill="#fff"/>',
    whatsapp: '<rect width="24" height="24" rx="12" fill="#25D366"/><path d="M12 5.6a6.4 6.4 0 00-5.5 9.6l-.9 3.2 3.3-.9A6.4 6.4 0 1012 5.6z" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M9.6 8.9c-.3.1-.8.5-.8 1.2 0 1.9 2.4 4.6 4.9 5.3.9.2 1.5-.2 1.7-.7l.3-.9c.1-.3 0-.5-.3-.6l-1.6-.8c-.6-.2-.8.5-1.2.5-.7-.3-1.7-1.2-2-1.9 0-.4.6-.6.4-1.2l-.7-1.6c-.1-.3-.4-.4-.7-.3z" fill="#fff"/>',
    telegram: '<rect width="24" height="24" rx="12" fill="#26A5E4"/><path d="M18.6 6.8L6 11.6c-.7.3-.7.9-.1 1.1l3.1 1 1.2 3.7c.2.5.7.6 1.1.2l1.7-1.6 3.2 2.4c.5.3 1 .1 1.1-.6l2-9.4c.2-.8-.3-1.2-.7-1z" fill="#fff"/>'
  };
  return `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">${L[p] || `<rect width="24" height="24" rx="6" fill="#6F6A80"/><circle cx="12" cy="12" r="5" fill="#fff"/>`}</svg>`;
}
function cpTicker(u) {
  const a = S.settings.announcement;
  const annOk = a && a.text && (a.audience === 'all' || a.audience === 'students');
  const subs = S.socialSubs[u.id] || {};
  const plats = S.settings.socials.filter(s => !subs[s.id]);
  if (!annOk && !plats.length) return '';
  const items = [
    ...(annOk ? [`<span class="tk-it tk-ann">${icon('bell', 13)} ${esc(a.text)}</span>`] : []),
    ...plats.map(s => `<span class="tk-it"><span class="tk-ico">${socialLogo(s.platform)}</span> Rejoignez Davar Académie sur <b>&nbsp;${esc(s.platform)}</b> <button onclick="subSocial('${s.id}')">S’abonner</button></span>`)
  ];
  const row = items.join('<span class="tk-dot"></span>');
  return `<div class="ticker"><div class="ticker-track">${row}${row}</div></div>`;
}

/* ---------------- Cockpit (Accueil) ---------------- */
function vHome(u) {
  const tid = activeTid(u);
  const t = tid ? getTraining(tid) : null;
  const mine = myTrainings(u.id);
  const pr = t ? trainingProgress(u.id, t) : null;
  const nx = t ? nextStep(u.id, t) : null;
  const books = myBooks(u).map(b => ({ b, page: (S.readPos[u.id] || {})[b.id] || 0 })).sort((a, b) => b.page - a.page);
  const lastBook = books[0] || null;
  const notifs = S.notifs.filter(n => n.userId === u.id).slice(0, 3);

  return `
  <div class="cp-hero">
    <div class="cp-hello">
      <div class="eyebrow">${fmtDate(new Date().toISOString().slice(0, 10))} · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
      <h1>${cpGreet()}, ${esc(u.name.split(' ')[0])} 👋</h1>
      <p>${t ? `Vous en êtes à <b>${pr.pct} %</b> de « ${esc(t.title)} ». ${nx ? 'Votre prochaine étape est prête.' : 'Parcours terminé — demandez votre certificat !'}` : 'Bienvenue sur votre campus. Choisissez une formation pour commencer.'}</p>
      ${t ? `<a class="btn btn-primary" href="${nx ? stepHref(t, nx) : '#/formation/' + t.id}">${icon('play', 15)} ${nx ? (nx.kind === 'assessment' ? 'Passer l’évaluation' : nx.kind === 'exercise' ? 'Faire l’exercice' : 'Continuer ma formation') : 'Voir ma formation'}</a>` : `<a class="btn btn-primary" href="#/catalogue">${icon('search', 15)} Découvrir les formations</a>`}
    </div>
    ${mine.length > 1 ? `
    <div class="cp-active">
      <div class="eyebrow">Formation active</div>
      <div class="tasel">
        <button class="tasel-btn" onclick="taToggle()" aria-haspopup="listbox">${icon('cap', 15)}<span class="wrap">${esc(t ? t.title : 'Choisir une formation')}</span>${icon('chevD', 14)}</button>
        ${UI.taOpen ? `<div class="tasel-menu" role="listbox">${mine.map(x => { const px = trainingProgress(u.id, x); return `<button class="tasel-it ${x.id === tid ? 'on' : ''}" role="option" onclick="setActiveTid('${u.id}','${x.id}')">${x.id === tid ? icon('check', 14) : icon('cap', 14)}<span class="wrap">${esc(x.title)}</span><span class="pct">${px ? px.pct : 0} %</span></button>`; }).join('')}</div>` : ''}
      </div>
      <div class="mt8">${pbarHTML(pr ? pr.pct : 0)}</div>
      <div class="row between mt8"><span class="xs muted">${pr ? pr.pct : 0} % accompli</span><a class="xs link" href="#/formations">Toutes mes formations →</a></div>
    </div>` : (t ? `
    <div class="cp-active">
      <div class="eyebrow">Formation active</div>
      <b style="font-size:14.5px">${esc(t.title)}</b>
      <div class="mt8">${pbarHTML(pr.pct)}</div>
      <div class="xs muted mt8">${pr.pct} % accompli</div>
    </div>` : '')}
  </div>

  ${nx && t ? `
  <div class="cp-next">
    <div class="row">
      <span class="s-ico" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--violet);color:#fff">${icon(nx.kind === 'assessment' ? 'clipboard' : nx.kind === 'exercise' ? 'edit' : 'play', 19)}</span>
      <div class="wrap"><div class="eyebrow">Prochaine action</div><b style="font-size:14.5px">${esc(nx.title)}</b>
      <div class="xs muted">${nx.kind === 'assessment' ? 'Quiz bloquant — un score minimum est requis pour continuer.' : nx.kind === 'exercise' ? 'Envoyez votre travail, votre coach le corrigera.' : 'Reprenez là où vous vous êtes arrêté(e).'}</div></div>
      <a class="btn btn-primary" href="${stepHref(t, nx)}">Commencer ${icon('arrowR', 14)}</a>
    </div>
  </div>` : ''}

  <div class="cp-grid2">
    <div>
      ${lastBook ? `
      <section class="cp-sec">
        <div class="cp-sec-h"><span class="eyebrow">Reprendre ma lecture</span><a class="xs link" href="#/livre/${lastBook.b.id}">Ouvrir le lecteur →</a></div>
        <div class="rd-strip">
          <span class="bk-thumb">${lastBook.b.cover ? `<img src="${lastBook.b.cover}" alt="">` : `<span class="bk-gen">${esc(lastBook.b.title)}</span>`}</span>
          <div class="wrap"><b style="font-size:14.5px">${esc(lastBook.b.title)}</b>
          <div class="xs muted">Vous vous êtes arrêté(e) à la page ${lastBook.page}.</div></div>
          <a class="btn" href="#/livre/${lastBook.b.id}">${icon('book', 15)} Continuer</a>
        </div>
      </section>` : ''}

      ${notifs.length ? `
      <section class="cp-sec">
        <div class="cp-sec-h"><span class="eyebrow">À retenir</span><a class="xs link" href="#/notifications">Tout voir →</a></div>
        ${notifs.map(n => `<div class="nt-line"><b>${esc(n.title)}</b><span class="xs muted">${esc(n.body)}</span></div>`).join('')}
      </section>` : ''}

      ${t ? `<section class="cp-sec">${journeyHTML(u, t)}</section>` : ''}
    </div>
    <div>
      <section class="cp-sec">
        <div class="cp-sec-h"><span class="eyebrow">En un coup d’œil</span></div>
        <div class="cp-stats">
          <div><b>${mine.length}</b><span>Formation${mine.length > 1 ? 's' : ''}</span></div>
          <div><b>${S.certs.filter(c => c.userId === u.id && c.status === 'validé').length}</b><span>Certificat(s)</span></div>
          <div><b>${myBooks(u).length + myAudios(u).length}</b><span>Ressource(s)</span></div>
        </div>
        <a class="btn" style="width:100%;margin-top:14px" href="#/certificats">${icon('award', 15)} Mes certificats</a>
      </section>
    </div>
  </div>`;
}

function journeyHTML(u, t) {
  const chs = t.chapters || [];
  const allSteps = stepsOf(t);
  return `<div class="eyebrow mb8">Votre parcours</div>
  <div class="journey">${chs.map((ch, i) => {
    const st = allSteps.filter(s => s.chapter === i && s.kind !== 'exercise');
    const done = st.length && st.every(s => stepDone(u.id, t, s));
    const cur = !done && st.some(s => stepUnlocked(u.id, t, s));
    return `<div class="j-step ${done ? 'done' : cur ? 'cur' : 'lock'}">
      <span class="j-dot">${done ? icon('check', 12) : cur ? i + 1 : icon('lock', 11)}</span>
      <span class="j-lb">${esc(ch.title)}</span></div>`;
  }).join('')}</div>
  <div class="xs faint mt8">Les étapes verrouillées se débloquent automatiquement en validant les précédentes.</div>`;
}

/* ---------------- Formations ---------------- */
function chapterDone(u, t, ci) {
  const ch = t.chapters[ci]; if (!ch) return false;
  const mods = ch.modules.every(m => (S.progress[u] || {})[m.id]?.viewed);
  const ev = !ch.assessment || stepDone(u, t, { kind: 'assessment', id: ch.assessment.id, ref: ch.assessment });
  return mods && ev;
}
function chapterUnlocked(u, t, ci) { return ci === 0 || chapterDone(u, t, ci - 1); }
function drillOpen(tid) { CP.drill = { tid, ci: null }; render(); }
function drillChap(ci) { CP.drill.ci = ci; render(); }
function drillBack() { if (CP.drill.tid && CP.drill.ci !== null) CP.drill.ci = null; else CP.drill = { tid: null, ci: null }; render(); }

function vFormations(u) {
  const mine = myTrainings(u.id);
  const t = CP.drill.tid ? getTraining(CP.drill.tid) : null;

  /* ---- Niveau 1 : choisir sa formation ---- */
  if (!t || !mine.some(x => x.id === t.id)) {
    if (CP.drill.tid) CP.drill = { tid: null, ci: null };
    return `
    <div class="page-head"><div><h1>Mes formations</h1><p>Choisissez votre formation.</p></div></div>
    ${mine.length ? `<div class="card" style="overflow:hidden">${mine.map(tt => {
      const pr = trainingProgress(u.id, tt);
      return `<div class="cur-step click" onclick="drillOpen('${tt.id}')">
        <span class="step-ico ${pr.pct === 100 ? 's-done' : pr.pct ? 's-cur' : 's-gold'}">${icon(pr.pct === 100 ? 'check' : 'layers', 14)}</span>
        <div class="wrap"><div class="st-title">${esc(tt.title)}</div>
          <div class="st-meta">${pr.pct} % accompli · ${tt.chapters.length} chapitres</div></div>
        ${icon('chevR', 14)}</div>`;
    }).join('')}</div>
    <div class="mt16"><a class="btn btn-ghost btn-sm" href="#/catalogue">${icon('search', 14)} Découvrir d’autres formations</a></div>`
      : emptyState('cap', 'Aucune formation pour l’instant', 'Parcourez le catalogue pour trouver la formation qui vous ressemble.')}`;
  }

  /* ---- Niveau 2 : choisir son chapitre ---- */
  if (CP.drill.ci === null || !t.chapters[CP.drill.ci]) {
    return `
    <div class="page-head"><div><button class="btn btn-sm mb8" onclick="drillBack()">‹ Mes formations</button>
      <h1>Chapitres</h1><p>${esc(t.title)}</p></div></div>
    <div class="card" style="overflow:hidden">${t.chapters.map((ch, ci) => {
      const dn = chapterDone(u.id, t, ci); const un = chapterUnlocked(u.id, t, ci);
      return `<div class="cur-step ${un ? 'click' : 'locked'}" ${un ? `onclick="drillChap(${ci})"` : ''}>
        <span class="step-ico ${dn ? 's-done' : un ? 's-cur' : 's-lock'}">${icon(dn ? 'check' : un ? 'layers' : 'lock', 14)}</span>
        <div class="wrap"><div class="st-title">Chapitre ${ci + 1} — ${esc(ch.title)}</div>
          <div class="st-meta">${dn ? 'Terminé ✓' : un ? ch.modules.length + ' module' + (ch.modules.length > 1 ? 's' : '') + ' — à suivre' : 'Verrouillé — terminez d’abord le chapitre ' + ci}</div></div>
        ${un ? icon('chevR', 14) : ''}</div>`;
    }).join('')}</div>`;
  }

  /* ---- Niveau 3 : les modules du chapitre ---- */
  const ci = CP.drill.ci; const ch = t.chapters[ci];
  return `
  <div class="page-head"><div><button class="btn btn-sm mb8" onclick="drillBack()">‹ Chapitres</button>
    <h1>Chapitre ${ci + 1} — ${esc(ch.title)}</h1><p>${esc(t.title)}</p></div></div>
  <div class="card" style="overflow:hidden">
    ${ch.modules.map(m => {
      const dn = (S.progress[u.id] || {})[m.id]?.viewed;
      const un = stepUnlocked(u.id, t, { kind: 'module', id: m.id });
      return `<div class="cur-step ${un ? 'click' : 'locked'}" ${un ? `onclick="go('/formation/${t.id}/module/${m.id}')"` : ''}>
        <span class="step-ico ${dn ? 's-done' : un ? 's-cur' : 's-lock'}">${icon(dn ? 'check' : un ? 'play' : 'lock', 13)}</span>
        <div class="wrap"><div class="st-title">${esc(m.title)}</div>
          <div class="st-meta">Vidéo ${m.duration}${dn ? ' · terminée ✓' : un ? ' · à suivre maintenant' : ''}${m.text ? ' — ' + esc(m.text.split('\n')[0].slice(0, 70)) + (m.text.split('\n')[0].length > 70 ? '…' : '') : ''}</div></div>
        ${un ? icon('chevR', 14) : ''}</div>`;
    }).join('')}
    ${ch.exercise ? `<div class="cur-step click" onclick="go('/formation/${t.id}/exercice/${ch.id}')">
      <span class="step-ico s-gold">${icon('clipboard', 13)}</span>
      <div class="wrap"><div class="st-title">${esc(ch.exercise.title)}</div><div class="st-meta">Exercice de pratique — ne bloque pas la progression</div></div>
      ${icon('chevR', 14)}</div>` : ''}
    ${ch.assessment ? (() => {
      const st = { kind: 'assessment', id: ch.assessment.id, ref: ch.assessment };
      const un = stepUnlocked(u.id, t, st); const dn = stepDone(u.id, t, st);
      return `<div class="cur-step ${un ? 'click' : 'locked'}" ${un ? `onclick="go('/formation/${t.id}/evaluation/${ch.id}')"` : ''}>
        <span class="step-ico ${dn ? 's-done' : un ? 's-gold' : 's-lock'}">${icon(dn ? 'check' : un ? 'award' : 'lock', 13)}</span>
        <div class="wrap"><div class="st-title">Évaluation du chapitre</div>
          <div class="st-meta">${dn ? 'Réussie ✓' : un ? 'À passer pour débloquer le chapitre suivant' : 'Terminez d’abord les modules du chapitre'}</div></div>
        ${un ? icon('chevR', 14) : ''}</div>`;
    })() : ''}
  </div>`;
}

function spotlightHTML() {
  const best = S.reviews.filter(r => r.spotlight && r.status === 'published').slice(0, 3);
  if (!best.length) return '';
  return `<div class="page-head" style="margin-top:30px"><div><h2 style="font-size:19px">Ils témoignent</h2></div></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
    ${best.map(r => { const t = r.trainingId ? getTraining(r.trainingId) : null; const st = getUser(r.userId); return `
    <div class="card card-pad sp-card">${icon('quote', 18)}
      <p class="small" style="margin:8px 0 10px">${esc(r.text.length > 220 ? r.text.slice(0, 220) + '…' : r.text)}</p>
      <div class="row"><span class="step-ico s-gold" style="width:30px;height:30px">${icon('check', 13)}</span><div><b class="xs">${st ? esc(st.name) : 'Étudiant DAVAR vérifié'}</b><div class="xs faint">${t ? esc(t.title) : 'Plateforme DAVAR'}</div></div></div>
    </div>`; }).join('')}
  </div>`;
}
function vDiscover(u) { return vCatalog(u) + spotlightHTML(); }

/* ---------------- Exercices & quiz ---------------- */
function vExercises(u) {
  const rows = [];
  myTrainings(u.id).forEach(t => (t.chapters || []).forEach(ch => {
    (ch.steps || []).filter(st => st.kind === 'exercise').forEach(st => {
      const sub = (S.submissions || []).find(s => s.userId === u.id && s.trainingId === t.id && s.chapterId === ch.id);
      const badge = sub ? (sub.status === 'corrigé' ? '<span class="badge b-green">Corrigé</span>' : sub.status === 'refusé' ? `<span class="badge b-red">Refusé · ${esc(sub.reason || 'voir le motif')}</span>` : '<span class="badge b-gold">En correction</span>') : '<span class="badge">À faire</span>';
      rows.push(`<div class="row card card-pad mb8"><div class="wrap"><b>${esc(st.title)}</b><div class="xs muted">${esc(t.title)} · Chapitre « ${esc(ch.title)} »</div></div>${badge}<a class="btn btn-sm" href="${stepHref(t, st)}">${sub ? 'Revoir' : 'Commencer'}</a></div>`);
    });
  }));
  return `<div class="page-head"><div><h1>Mes exercices</h1><p>Des travaux corrigés personnellement par votre coach.</p></div></div>
  ${rows.length ? rows.join('') : emptyState('edit', 'Aucun exercice pour l’instant', 'Les exercices apparaîtront ici dès que votre formation en proposera.')}`;
}

function vQuizzes(u) {
  const rows = []; let next = null;
  myTrainings(u.id).forEach(t => (t.chapters || []).forEach((ch, ci) => {
    const ev = ch.assessment; if (!ev) return;
    const isQuiz = ev.type === 'quiz';
    const st = { kind: 'assessment', id: ev.id, ref: ev, chRef: ch };
    const unlocked = stepUnlocked(u.id, t, st);
    const passed = stepDone(u.id, t, st);
    if (!next && !passed) next = { t, ch, ev, unlocked, isQuiz };
    const meta = isQuiz ? `Score minimum : ${ev.minScore} %` : 'Travail à soumettre · validé par un coach';
    let hist = '';
    if (isQuiz) {
      const tries = ((S.evAttempts[u.id] || {})[ev.id] || []);
      if (tries.length) hist = `<div class="xs faint mt4">Historique : ${tries.slice(-3).map(x => x.pct + ' %').join(' · ')}</div>`;
    } else {
      const lastS = S.submissions.filter(x => x.userId === u.id && x.evId === ev.id && x.status !== 'replaced').sort((a, b) => b.at - a.at)[0];
      if (lastS) hist = `<div class="xs faint mt4">Dernier envoi : ${esc(lastS.file)} — ${{ pending: 'en correction', approved: 'validé', rejected: 'refusé', retry: 'nouvelle tentative demandée' }[lastS.status] || lastS.status} · ${timeAgo(lastS.at)}</div>`;
    }
    let btn;
    if (passed) btn = '<span class="badge b-green">Validé ✓</span>';
    else if (!unlocked) btn = `<a class="btn btn-sm" href="${stepHref(t, st)}">Voir</a>`;
    else if (isQuiz) btn = `<a class="btn btn-sm btn-primary" href="${stepHref(t, st)}">${icon('play', 13)} Passer l’évaluation</a>`;
    else if (S.submissions.some(x => x.userId === u.id && x.evId === ev.id && x.status === 'pending')) btn = `<a class="btn btn-sm" href="${stepHref(t, st)}">${icon('clock', 13)} En correction</a>`;
    else btn = `<a class="btn btn-sm btn-primary" href="${stepHref(t, st)}">${icon('upload', 13)} Soumettre mon travail</a>`;
    rows.push(`<div class="row card card-pad mb8" style="align-items:center">
      <div class="wrap"><b>${esc(ev.title)}</b>
      <div class="xs muted">${esc(t.title)} · Chapitre ${ci + 1} — ${esc(ch.title)} · ${meta}</div>${hist}</div>
      ${btn}
    </div>`);
  }));
  const nx = next ? `
  <div class="banner info mb16">${icon(next.isQuiz ? 'target' : 'upload', 16)}<span><b>Prochaine évaluation :</b> ${esc(next.ev.title)} — ${esc(next.t.title)}, chapitre ${next.t.chapters.indexOf(next.ch) + 1}. ${next.isQuiz ? (next.unlocked ? '' : 'Les modules du chapitre doivent être terminés pour la passer.') : next.unlocked ? 'Travail à soumettre : le chapitre suivant restera verrouillé jusqu’à la validation de votre fichier par un coach.' : 'Les modules du chapitre doivent être terminés pour la soumettre.'}</span>
  <a class="btn btn-primary btn-sm" style="margin-left:auto;flex:none" href="${stepHref(next.t, { kind: 'assessment', id: next.ev.id, ref: next.ev, chRef: next.ch })}">${!next.unlocked ? 'Voir' : next.isQuiz ? 'Commencer' : 'Soumettre mon travail'}</a></div>` : '';
  return `<div class="page-head"><div><h1>Mes évaluations</h1><p>Votre historique, et la prochaine étape pour valider vos acquis.</p></div></div>
  ${nx}
  ${rows.length ? rows.join('') : emptyState('clipboard', 'Aucune évaluation pour l’instant', 'Les évaluations apparaîtront ici au fil de votre formation.')}`;
}
/* ---------------- Livres & lecteur ---------------- */
function vBooks(u) {
  const books = myBooks(u);
  return `<div class="page-head"><div><h1>Mes livres</h1><p>Lisez directement dans la plateforme, votre page est mémorisée.</p></div></div>
  ${books.length ? `<div class="grid grid-cards">${books.map(b => {
    const page = (S.readPos[u.id] || {})[b.id] || 0;
    return `<div class="card card-pad">
      <div class="bk-cover">${b.cover ? `<img src="${b.cover}" alt="">` : `<span class="bk-gen">${esc(b.title)}</span>`}</div>
      <b style="font-size:15px;margin-top:12px;display:block">${esc(b.title)}</b>
      <div class="xs muted mt4">${page ? `Vous vous êtes arrêté à la page ${page}.` : (b.pages + ' pages')}</div>
      <a class="btn btn-primary btn-sm mt12" href="#/livre/${b.id}">${icon('book', 13)} ${page ? 'Continuer la lecture' : 'Commencer la lecture'}</a>
    </div>`;
  }).join('')}</div>` : emptyState('book', 'Aucun livre pour l’instant', 'Votre équipe pédagogique vous attribuera des livres ici.')}`;
}

const BK_SENTENCES = [
  'La maîtrise vient de la répétition : chaque jour, un petit pas de plus.',
  'Prenez le temps d’observer, puis d’agir : l’action juste naît de l’attention.',
  'Un objectif clair vaut mieux que dix intentions vagues.',
  'Notez vos victoires, même minuscules : elles construisent la confiance.',
  'La régularité l’emporte toujours sur l’intensité ponctuelle.',
  'Écoutez deux fois plus que vous ne parlez.',
  'Préparez, respirez, puis lancez-vous : l’élan fait le reste.',
  'Chaque erreur est une donnée, pas un verdict.',
  'Structurez votre propos : une idée par phrase, une phrase par idée.',
  'Ce que vous répétez, vous le possédez ; ce que vous survolez, vous l’oubliez.'
];
function bookPageText(b, pg) {
  const seed = (b.id.length * 7 + pg * 13) % BK_SENTENCES.length;
  return Array.from({ length: 5 }, (_, i) => BK_SENTENCES[(seed + i) % BK_SENTENCES.length]).map(s => `<p>${s}</p>`).join('');
}
function readerGo(bid, dir) {
  const b = bookOf(bid); if (!b) return;
  const uid = S.session.userId;
  const cur = (S.readPos[uid] || {})[bid] || 1;
  const np = Math.min(b.pages, Math.max(1, cur + dir));
  S.readPos[uid] = S.readPos[uid] || {}; S.readPos[uid][bid] = np;
  if (typeof rwActivity === 'function') rwActivity(uid);
  save(); render();
}
function readerGoto(bid) {
  const b = bookOf(bid); const inp = document.getElementById('rdGoto'); const v = parseInt(inp && inp.value, 10);
  if (!b || !v) return;
  const uid = S.session.userId;
  S.readPos[uid] = S.readPos[uid] || {}; S.readPos[uid][bid] = Math.min(b.pages, Math.max(1, v)); save(); render();
}
function vReader(u, bid) {
  const b = bookOf(bid);
  if (!b) return vNotFound();
  if (!b.assignedTo.includes(u.id) && b.assignedTo.length) return emptyState('lock', 'Livre non disponible', 'Ce livre ne fait pas encore partie de vos ressources.');
  const page = (S.readPos[u.id] || {})[bid] || 1;
  return `
  <div class="rd-wrap">
    <div class="row between mb12">
      <div class="row" style="gap:12px;align-items:center"><span class="bk-thumb rd-thumb">${b.cover ? `<img src="${b.cover}" alt="">` : `<span class="bk-gen">${esc(b.title)}</span>`}</span><div><h1 style="font-size:19px;margin:0">${esc(b.title)}</h1>${b.pdf ? '' : `<div class="xs muted mt4">Page ${page} sur ${b.pages}</div>`}</div></div>
      <a class="btn btn-sm" href="#/livres">${icon('back', 13)} Mes livres</a>
    </div>
    ${b.pdf ? `<div class="rd-pdf card"><iframe src="${b.pdf}" title="${esc(b.title)} — lecture du PDF"></iframe></div>
    <div class="xs faint" style="text-align:center;margin-top:10px">Votre livre, tel qu’il est : zoomez et naviguez dans le lecteur PDF.</div>` : `
    <div class="rd-page card card-pad" id="rdPage">${bookPageText(b, page)}</div>
    <div class="rd-bar card">
      <button class="btn btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="readerGo('${bid}',-1)">${icon('chevL', 14)} Page précédente</button>
      <div class="row" style="gap:6px"><input class="inp" style="width:74px" type="number" id="rdGoto" min="1" max="${b.pages}" value="${page}"><button class="btn btn-sm" onclick="readerGoto('${bid}')">Aller à</button></div>
      <button class="btn btn-sm btn-primary" ${page >= b.pages ? 'disabled' : ''} onclick="readerGo('${bid}',1)">Page suivante ${icon('chevR', 14)}</button>
    </div>
    <div class="xs faint" style="text-align:center;margin-top:10px">Votre position est enregistrée automatiquement.</div>`}
  </div>`;
}

/* ---------------- Audios ---------------- */
function audioToggle(id) {
  if (CP.audio.id === id && CP.audio.playing) { CP.audio.playing = false; }
  else { CP.audio.id = id; CP.audio.playing = true; CP.audio.pos = (S.audioPos[S.session.userId] || {})[id] || 0; if (typeof rwActivity === 'function') rwActivity(S.session.userId); }
  render();
}
function audioSeek(id, pct) {
  const uid = S.session.userId;
  S.audioPos[uid] = S.audioPos[uid] || {}; S.audioPos[uid][id] = Math.round(pct); save();
  CP.audio.id = id; CP.audio.pos = Math.round(pct); render();
}
function audioTick() {
  if (!CP.audio.playing || !CP.audio.id) return;
  const uid = S.session.userId;
  S.audioPos[uid] = S.audioPos[uid] || {};
  S.audioPos[uid][CP.audio.id] = ((S.audioPos[uid][CP.audio.id] || 0) + 1) % 100;
  CP.audio.pos = S.audioPos[uid][CP.audio.id];
  const bar = document.querySelector('#auLine .au-fill'); if (bar) bar.style.width = CP.audio.pos + '%';
  const lbl = document.getElementById('auPct'); if (lbl) lbl.textContent = CP.audio.pos + ' %';
  if (CP.audio.pos % 20 === 0) save();
}
setInterval(audioTick, 900);
function openAudioList() { CP.audioList = true; render(); }
function closeAudioList() { CP.audioList = false; render(); }
function auCoverHTML(a, sz) {
  return `<span class="au-cover">${a.cover ? `<img src="${a.cover}" alt="">` : ''}<span class="au-ov">${icon('headset', sz || 18)}</span></span>`;
}
function vAudios(u) {
  const auds = myAudios(u);
  if (!auds.length) return `<div class="page-head"><div><h1>Mes audios</h1><p>Séances guidées, visualisations, respiration.</p></div></div>
    ${emptyState('headset', 'Aucun audio pour l’instant', 'Votre équipe pédagogique vous attribuera des contenus audio ici.')}`;
  if (CP.audioList) return `
  <div class="page-head"><div><h1>Mes audios — lecture</h1><p>Toutes vos pistes : le fichier se charge uniquement quand vous appuyez sur lecture.</p></div>
    <button class="btn btn-sm" onclick="closeAudioList()">${icon('chevL', 14)} Retour</button></div>
  ${auds.map(a => `
    <div class="card card-pad mb8">
      <div class="row">${auCoverHTML(a, 16)}<div class="wrap"><b>${esc(a.title)}</b><div class="xs muted">${(a.tracks && a.tracks.length) ? a.tracks.length + ' piste(s) — dans l’ordre du livre audio' : esc(a.duration || 'Audio')}</div></div></div>
      ${(a.tracks && a.tracks.length) ? a.tracks.map((tr, i) => `<div class="au-item"><div class="xs muted" style="margin:10px 0 4px">Piste ${i + 1} · ${esc(tr.name)}</div><audio controls preload="none" src="${tr.url}" style="width:100%"></audio></div>`).join('')
        : (a.src ? `<audio controls preload="none" src="${a.src}" style="width:100%;margin-top:10px"></audio>`
                 : `<div class="xs faint mt8">Piste en cours de dépôt par l’équipe pédagogique.</div>`)}
    </div>`).join('')}
  <div class="xs faint" style="text-align:center">Lecture réelle : vos données mobiles ne sont utilisées que pendant l’écoute.</div>`;
  return `<div class="page-head"><div><h1>Mes audios</h1><p>Touchez un audio pour ouvrir sa liste de lecture.</p></div></div>
  ${auds.map(a => `
    <div class="card card-pad mb8" style="cursor:pointer" onclick="openAudioList()">
      <div class="row">
        ${auCoverHTML(a, 18)}
        <div class="wrap"><b>${esc(a.title)}</b><div class="xs muted">${(a.tracks && a.tracks.length) ? a.tracks.length + ' piste(s)' : esc(a.duration || 'Audio')} · appuyer pour écouter</div></div>
        ${icon('play', 18, 'muted')}
      </div>
    </div>`).join('')}`;
}
function audioSeekFromClick(e, id, el) { const r = el.getBoundingClientRect(); audioSeek(id, ((e.clientX - r.left) / r.width) * 100); }

/* ---------------- Certificats (slider) ---------------- */
function certTotal() {
  const uid = S.session.userId;
  const pend = S.certRequests.filter(c => c.userId === uid && c.status === 'pending').length ? 1 : 0;
  return S.certs.filter(c => c.userId === uid).length + pend;
}
function certMove(d) {
  CP.certIdx = Math.max(0, Math.min(certTotal() - 1, CP.certIdx + d)); render();
}
function vCerts(u) {
  const certs = S.certs.filter(c => c.userId === u.id);
  const pend = S.certRequests.filter(c => c.userId === u.id && c.status === 'pending');
  if (!certs.length && !pend.length) return `<div class="page-head"><div><h1>Mes certificats</h1></div></div>
    ${emptyState('award', 'Pas encore de certificat', 'Terminez une formation à 100 % puis demandez votre certificat : il sera vérifié par notre équipe avant émission.')}`;
  const total = certs.length + (pend.length ? 1 : 0);
  const idx = Math.min(CP.certIdx, total - 1);
  return `<div class="page-head"><div><h1>Mes certificats</h1></div></div>
  <div class="cert-slider">
    <button class="cert-nav" ${idx <= 0 ? 'disabled' : ''} onclick="certMove(-1)" title="Précédent">${icon('chevL', 20)}</button>
    <div class="cert-stage">
      ${certs.map((x, i) => `<div class="cert-vis ${i === idx ? 'on' : ''} ${x.imageUrl ? 'has-img' : ''}" onclick="showCert('${x.id}')">
        <div class="cv-title">${esc(getTraining(x.trainingId) ? getTraining(x.trainingId).title : (x.course || ''))}</div>
        ${x.imageUrl ? `<img class="cert-img" src="${esc(x.imageUrl)}" alt="Certificat ${esc(x.code)}">` : `
        <div class="cv-top"><img class="cv-logo" src="assets/campus-official.png" alt=""><b>DAVAR ACADÉMIE</b><span class="xs">Certificat de réussite</span></div>
        <div class="cv-name">${esc(x.holderName || x.name || '')}</div>
        <div class="cv-course">${esc(getTraining(x.trainingId) ? getTraining(x.trainingId).title : x.course || '')}</div>
        <div class="cv-meta"><span>Code ${esc(x.code)}</span><span>${fmtDate(x.issuedAt || x.at)}</span></div>`}
      </div>`).join('')}
      ${pend.length ? `<div class="cert-vis ${idx === certs.length ? 'on' : ''}"><div class="cv-top"><b>DAVAR ACADÉMIE</b><span class="xs">Demande en cours</span></div>
        <div class="cv-name" style="font-size:16px">Votre certificat est en préparation</div></div>` : ''}
    </div>
    <button class="cert-nav" ${idx >= total - 1 ? 'disabled' : ''} onclick="certMove(1)" title="Suivant">${icon('chevR', 20)}</button>
  </div>
  <div class="xs muted" style="text-align:center;margin-top:12px">${idx + 1} sur ${total}</div>
  `;
}

/* ---------------- Questions ---------------- */
function vQuestions(u) {
  const mine = S.threads.filter(th => th.userId === u.id)
    .sort((a, b) => (b.messages[b.messages.length - 1]?.at || 0) - (a.messages[a.messages.length - 1]?.at || 0));
  const tid = activeTid(u);
  return `<div class="page-head"><div><h1>Mes questions</h1><p>Vos conversations avec ${esc(aiName())} et votre coach — relisez-les à tout moment.</p></div>
    <button class="btn btn-primary" onclick="openChat('${tid || ''}',null,'ai')">${icon('message', 15)} Poser une question</button></div>
  ${mine.length ? `<div class="col" style="gap:10px">${mine.map(th => {
    const f = findModule(th.trainingId, th.moduleId);
    const kind = th.messages.some(m => m.from === 'coach') ? 'coach' : 'ai';
    const q = th.messages.find(m => m.from === 'student');
    const last = th.messages[th.messages.length - 1];
    const answered = th.messages.some(m => m.from === 'ai' || m.from === 'coach');
    return `<div class="card card-pad" style="cursor:pointer" onclick="openChat('${th.trainingId}','${th.moduleId}','${kind}')">
      <div class="row between" style="gap:8px">
        <div class="row" style="gap:10px;min-width:0">
          <span style="width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex:none;background:${kind === 'coach' ? 'var(--gold)' : 'var(--violet)'};color:#fff">${icon(kind === 'coach' ? 'user' : 'sparkles', 16)}</span>
          <div class="wrap" style="min-width:0">
            <b style="font-size:13.5px">${f ? esc(f.m.title) : 'Conversation'}</b>
            <div class="xs muted mt2">${kind === 'coach' ? 'Coach' : esc(aiName()) + ' (IA)'} · ${timeAgo(last?.at || Date.now())} · ${answered ? 'Répondu ✓' : 'En attente'}</div>
          </div>
        </div>
        ${icon('chevR', 14)}
      </div>
      ${q ? `<div class="xs muted mt8" style="border-left:3px solid var(--violet-line);padding-left:9px">« ${esc(q.text.slice(0, 110))}${q.text.length > 110 ? '…' : ''} »</div>` : ''}
      ${last && last.from !== 'student' ? `<div class="xs mt6" style="border-left:3px solid var(--green-line);padding-left:9px;color:var(--muted)">${esc(last.text.replace(/\n+/g, ' ').slice(0, 110))}${last.text.length > 110 ? '…' : ''}</div>` : ''}
    </div>`;
  }).join('')}</div>` : emptyState('message', 'Aucune question pour l’instant', 'Posez votre première question : l’assistant répond immédiatement, votre coach sous 48 h.')}`;
}

/* ---------------- Notifications ---------------- */
function vNotifs(u) {
  const mine = S.notifs.filter(n => n.userId === u.id && !lcNotifExpired(n));
  const FORM = ['exercise', 'eval', 'coach', 'module', 'quiz', 'formation'];
  const form = mine.filter(n => FORM.includes(n.type));
  const campus = mine.filter(n => !FORM.includes(n.type));
  const line = n => { const rt = notifRoute(n); return `<div class="nt-line ${n.read ? '' : 'unread'} ${rt ? 'go' : ''}" ${rt ? `onclick="notifGo('${n.id}')" title="Ouvrir la page concernée"` : ''}><b>${esc(n.title)}</b><span class="xs muted">${esc(n.body)}</span><span class="xs faint">${fmtDate(new Date(n.at).toISOString().slice(0, 10))}</span>${rt ? icon('chevR', 13) : ''}</div>`; };
  if (!mine.length) return `<div class="page-head"><div><h1>Notifications</h1></div></div>${emptyState('bell', 'Rien à signaler pour l’instant', 'Les activités de vos formations et du campus apparaîtront ici.')}`;
  return `<div class="page-head"><div><h1>Notifications</h1><p>Vos formations d’abord, la vie du campus ensuite.</p></div>
    <button class="btn btn-sm" onclick="markAllRead()">${icon('check', 14)} Tout marquer comme lu</button></div>
  <div class="grid" style="grid-template-columns:1.4fr 1fr;align-items:start">
    <div class="card card-pad"><div class="eyebrow mb8">Formation (prioritaire)</div>${form.length ? form.map(line).join('') : '<div class="xs muted">Aucune notification de formation.</div>'}</div>
    <div class="card card-pad"><div class="eyebrow mb8">Campus</div>${campus.length ? campus.map(line).join('') : '<div class="xs muted">Aucune notification du campus.</div>'}</div>
  </div>`;
}
/* ---------------- Profil & paramètres ---------------- */
/* ---- Pays & téléphone : sélecteur drapeaux + recherche + validation par pays ---- */
function ctryNorm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function ctryListHTML(q) {
  const s = ctryNorm(q);
  const list = COUNTRIES.filter(c => !s || ctryNorm(c.n).includes(s) || (c.d || '').includes(s));
  return list.map(c => `<div class="ctry-it" onclick="ctryPick(${COUNTRIES.indexOf(c)})"><span style="font-size:16px">${c.f}</span> ${esc(c.n)} <span class="dial">${c.d || ''}</span></div>`).join('')
    || '<div class="xs muted" style="padding:8px">Aucun pays trouvé.</div>';
}
function ctryToggle() {
  const p = document.getElementById('ctryPop'); if (!p) return;
  const open = p.style.display === 'none';
  p.style.display = open ? 'block' : 'none';
  if (open) { const s = document.getElementById('ctrySearch'); if (s) { s.value = ''; ctryFilter(); s.focus(); } }
}
function ctryFilter() { const s = document.getElementById('ctrySearch'); const l = document.getElementById('ctryList'); if (l) l.innerHTML = ctryListHTML(s ? s.value : ''); }
function ctryPick(i) {
  const c = COUNTRIES[i]; if (!c) return;
  const u = getUser(S.session.userId);
  u.country = c.n; u.dial = c.d; save();
  const p = document.getElementById('ctryPop'); if (p) p.style.display = 'none';
  render(); phoneCheck();
  toast('Pays mis à jour : ' + c.n, 'ok', 'globe');
}
function phoneValid(c, raw) {
  let v = String(raw || '').trim();
  const dial = (c && c.d) || '';
  const digitsOnly = v.replace(/[^0-9]/g, '');
  if (dial && v.indexOf(dial) === 0) v = v.slice(dial.length);             // indicatif déjà saisi (+225 …)
  else if (dial && digitsOnly.indexOf('00' + dial.slice(1)) === 0) v = digitsOnly.slice(1 + dial.length); // 00225…
  v = v.replace(/[^0-9]/g, '');                                            // les zéros initiaux font partie du numéro
  const min = c ? (c.min || 7) : 7, max = c ? (c.max || 15) : 15;
  return v.length >= min && v.length <= max;
}
function phoneCheck() {
  const u = getUser(S.session.userId); const el = document.getElementById('phoneState'); const inp = document.getElementById('setPhone');
  if (!el || !inp) return;
  const c = COUNTRIES.find(x => x.n === u.country);
  const v = inp.value.trim();
  if (!v) { el.textContent = ''; return; }
  el.innerHTML = phoneValid(c, v) ? '<span style="color:var(--green)">✓ Numéro conforme</span>'
    : '<span style="color:var(--red)">✗ Vérifiez le numéro (' + esc(c ? c.n : 'pays inconnu') + ')</span>';
}
function savePhone() {
  const inp = document.getElementById('setPhone'); if (!inp) return;
  const u = getUser(S.session.userId);
  const v = inp.value.trim();
  if (v && !phoneValid(COUNTRIES.find(x => x.n === u.country), v)) { toast('Le numéro ne correspond pas au format du pays choisi.', 'err', 'phone'); return; }
  u.phone = v; save();
  toast('Téléphone enregistré ✓', 'ok', 'check');
}
function saveCountry() {
  const u = getUser(S.session.userId);
  const c = COUNTRIES.find(x => x.n === document.getElementById('setCountry').value); if (!c) return;
  u.country = c.n; u.dial = c.d; save(); render();
  toast('Pays mis à jour : ' + c.n + ' — moyens de paiement adaptés.', 'ok', 'wallet');
}
function pfDirty() {
  const u = getUser(S.session.userId);
  const n = document.getElementById('pfName'), p = document.getElementById('pfPhone'), w = document.getElementById('pfPwd'), w2 = document.getElementById('pfPwd2');
  return (n && n.value !== u.name) || (p && p.value !== (u.phone || '')) || (w && w.value.trim() !== '') || (w2 && w2.value.trim() !== '');
}
function pfReset() {
  const u = getUser(S.session.userId);
  const n = document.getElementById('pfName'), p = document.getElementById('pfPhone'), w = document.getElementById('pfPwd'), w2 = document.getElementById('pfPwd2');
  if (n) n.value = u.name; if (p) p.value = u.phone || ''; if (w) w.value = ''; if (w2) w2.value = '';
}
function pfEditingDirty() {
  try { return location.hash.indexOf('#/profil') === 0 && !!S.session && pfDirty(); } catch (e) { return false; }
}
function pfCancel() {
  /* Sans modification : sortie directe. Avec modification : confirmation —
     OUI = reset des saisies + sortie du profil ; NON = reste, modifications conservées.
     Toute autre navigation (accueil, onglets, menu) = sortie forcée sans enregistrer. */
  if (!pfDirty()) { cpBack(); return; }
  confirmModal('Voulez-vous vraiment annuler ?', 'Toutes les modifications seront perdues.', 'Oui, annuler', true)
    .then(v => { if (v) { pfReset(); cpBack(); } });
}
function vProfileNew(u) {
  return `<div class="page-head"><div><h1>Mon profil</h1><p>Vos informations personnelles.</p></div></div>
  <div class="card card-pad" style="max-width:640px">
    <div class="row">${avatarHTML(u, 'lg')}<div><b style="font-size:16px">${esc(u.name)}</b><div class="xs muted">${esc(u.email)}</div></div></div>
    <div class="divider"></div>
    <div class="field"><label>Photo de profil</label>
      <input type="file" accept="image/*" class="inp" onchange="uploadPhoto(this)">
      <div class="hint">Votre photo reste dans votre taille de cadre, partout sur la plateforme.</div></div>
    <div class="field"><label>Nom complet</label>
      <input class="inp" id="pfName" maxlength="21" value="${esc(u.name)}">
      <div class="hint">Ce nom sera utilisé sur vos prochains certificats. Les certificats déjà émis ne sont jamais modifiés.</div></div>
    <div class="field"><label>Téléphone</label>
      <input class="inp" id="pfPhone" value="${esc(u.phone || '')}" placeholder="+225 …"></div>
    <div class="field"><label>Nouveau code secret</label>
      <input type="password" class="inp" id="pfPwd" placeholder="Laisser vide pour conserver l’actuel" autocomplete="new-password">
      <div class="hint">6 caractères minimum. Il sera exigé à la prochaine connexion. Votre e-mail, lui, reste votre identifiant fixe.</div></div>
    <div class="field"><label>Confirmer le code secret</label>
      <input type="password" class="inp" id="pfPwd2" placeholder="Retapez exactement le même code" autocomplete="new-password">
      <div class="hint">${icon('lock', 11)} Les deux codes doivent être identiques : sinon l’enregistrement est impossible.</div></div>
    <div class="field"><label>Adresse e-mail</label>
      <input class="inp" value="${esc(u.email)}" disabled>
      <div class="hint">${icon('lock', 11)} Votre e-mail est votre identifiant d’accès et ne peut pas être modifié.</div></div>
    <div class="row" style="gap:8px">
      <button class="btn" onclick="pfCancel()">${icon('x', 15)} Annuler</button>
      <button class="btn btn-primary" onclick="saveProfile()">${icon('check', 15)} Enregistrer</button>
    </div>
  </div>`;
}

function vSettings(u) {
  return `<div class="page-head"><div><h1>Paramètres</h1></div></div>
  <div class="grid vset-grid" style="grid-template-columns:1fr 1fr;align-items:start;max-width:860px">
    <div class="card card-pad">
      <div class="eyebrow mb8">Apparence</div>
      <div class="row between"><span class="small">Mode sombre</span>
        <label class="switch"><input type="checkbox" ${currentTheme() === 'dark' ? 'checked' : ''} onchange="setTheme(this.checked?'dark':'light')"><i></i></label></div>
      <div class="row between mt8"><span class="small">Taille des textes & icônes</span>
        <div class="row" style="gap:4px">${[0.9, 1, 1.1, 1.25].map(v => `<button class="btn btn-sm ${(u.uiScale || 1) === v ? 'btn-primary' : ''}" style="padding:4px 9px" onclick="setUiScale(${v})">${Math.round(v * 100)}</button>`).join('')}</div></div>
      <div class="xs faint mt4">Règle la taille de tout votre tableau de bord, sur cet appareil.</div>
      <div class="divider"></div>
      <div class="eyebrow mb8">Notifications</div>
      <div class="row between"><span class="small">Activer les notifications</span>
        <label class="switch"><input type="checkbox" ${S.settings.pushEnabled ? 'checked' : ''} onchange="togglePush()"><i></i></label></div>
      <div class="xs faint mt8">Recevez les réponses de votre coach, les corrections et vos certificats en temps réel.</div>
      <div class="divider"></div>
      <div class="eyebrow mb8">Sécurité</div>
      <div class="row between"><span class="small">Connexion par empreinte digitale</span>
        <label class="switch"><input type="checkbox" ${u.webauthn ? 'checked' : ''} onchange="toggleWebauthn()"><i></i></label></div>
      <div class="xs faint mt8" id="fpHint">Vérification de votre appareil…</div>
      <div class="divider"></div>
      <div class="eyebrow mb8">Pays & téléphone</div>
      <div class="field" style="position:relative"><label>Pays du compte</label>
        <button type="button" class="inp ctry-btn" id="ctryBtn" onclick="ctryToggle()">
          <span style="font-size:17px">${((COUNTRIES.find(c => c.n === u.country)) || {}).f || '🌍'}</span>
          <span>${esc(u.country || 'Choisir mon pays')}</span>
          <span style="margin-left:auto;opacity:.55">${icon('chevD', 13)}</span>
        </button>
        <select id="setCountry" tabindex="-1" aria-hidden="true" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none" onchange="saveCountry()">${COUNTRIES.map(x => `<option ${u.country === x.n ? 'selected' : ''}>${x.n}</option>`).join('')}</select>
        <div class="ctry-pop" id="ctryPop" style="display:none" onclick="event.stopPropagation()">
          <input class="inp" id="ctrySearch" placeholder="Rechercher un pays…" autocomplete="off" oninput="ctryFilter()">
          <div class="ctry-list" id="ctryList">${ctryListHTML('')}</div>
        </div>
      </div>
      <div class="field"><label>Numéro de téléphone</label>
        <input class="inp" id="setPhone" value="${esc(u.phone || '')}" placeholder="Votre numéro" oninput="phoneCheck()" onchange="savePhone()">
        <div class="xs mt4" id="phoneState" style="min-height:14px"></div></div>
    </div>
    <div class="card card-pad">
      <div class="eyebrow mb8">Support</div>
      <p class="xs muted mb8">Notre équipe vous répond sur le canal de votre choix.</p>
      <button class="btn" style="width:100%;margin-bottom:8px" onclick="openSupportChat()">${icon('message', 16)} Discussion en direct</button>
      <a class="btn" style="width:100%;margin-bottom:8px" href="${esc(S.settings.support.whatsapp)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp</a>
      <a class="btn" style="width:100%;margin-bottom:8px" href="tel:${esc(S.settings.support.phone)}">${icon('phone', 16)} Appeler</a>
      <button class="btn" style="width:100%" onclick="openReport()">${icon('mail', 16)} Report</button>
    </div>
  </div>`;
}

/* ---------------- AVIS (obligatoires, ≤1000 mots, spotlight) ---------------- */
function reviewPrompts(u) {
  const out = [];
  if (Date.now() - u.joined >= 14 * 86400000 && !S.reviews.some(r => r.userId === u.id && r.targetType === 'platform'))
    out.push({ type: 'platform', trainingId: null, label: 'Votre expérience sur la plateforme DAVAR' });
  myTrainings(u.id).forEach(t => {
    const e = S.enrollments.find(x => x.userId === u.id && x.trainingId === t.id);
    if (e && Date.now() - e.at >= 30 * 86400000 && !S.reviews.some(r => r.userId === u.id && r.targetType === 'training' && r.trainingId === t.id))
      out.push({ type: 'training', trainingId: t.id, label: `Votre avis sur « ${t.title} »` });
  });
  return out;
}
function checkReviewRequests(u) {
  reviewPrompts(u).forEach(p => {
    const key = u.id + ':' + p.type + (p.trainingId || '');
    if (S.reviewAsked[key]) return;
    S.reviewAsked[key] = true;
    notify(u.id, 'info', 'Votre avis compte ✨', p.label + ' — deux minutes, 1000 mots maximum.');
  });
  save();
}
function submitReview(type, trainingId) {
  const txt = (document.getElementById('rvText').value || '').trim();
  const words = txt ? txt.split(/\s+/).length : 0;
  if (!txt) return toast('Écrivez votre avis, ou activez l’enregistrement audio.', 'err', 'edit');
  if (words > 1000) return toast('1000 mots maximum : votre avis en compte ' + words + '.', 'err', 'alert');
  const audio = document.getElementById('rvAudio').checked;
  S.reviews.unshift({ id: uid(), userId: S.session.userId, targetType: type, trainingId: trainingId || null, text: txt, words, audio, at: Date.now(), status: 'pending', spotlight: false });
  notify('u-yann', 'admin', 'Nouvel avis à modérer', `${getUser(S.session.userId).name} — ${type === 'platform' ? 'plateforme' : (getTraining(trainingId) || {}).title || ''}`);
  save(); render();
  toast('Merci ! Votre avis a été envoyé pour validation ✓', 'ok', 'star');
}
function vAvis(u) {
  const prompts = reviewPrompts(u);
  const mine = S.reviews.filter(r => r.userId === u.id);
  return `
  <div class="page-head"><div><h1>Mes avis</h1><p>Votre parole compte : elle améliore le campus et aide les futurs étudiants.</p></div></div>
  ${prompts.length ? prompts.map(p => `
    <div class="card card-pad mb16" style="border-color:var(--violet-line)">
      <div class="eyebrow">Avis demandé</div>
      <b style="font-size:15px">${p.label}</b>
      <div class="xs muted mt4">Écrit (1000 mots maximum) ou audio — votre enregistrement est transcrit par l’équipe.</div>
      <div class="field mt8"><textarea class="inp" id="rvText" rows="5" oninput="rvCount()" placeholder="Partagez votre expérience, en toute liberté…"></textarea>
        <div class="row between mt4"><span class="xs faint" id="rvWords">0 / 1000 mots</span>
          <label class="xs muted" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="rvAudio"> Je préfère envoyer un audio (transcrit par l’équipe)</label></div></div>
      <button class="btn btn-primary btn-sm" onclick="submitReview('${p.type}','${p.trainingId || ''}')">${icon('send', 13)} Envoyer mon avis</button>
    </div>`).join('') : (!mine.length ? emptyState('star', 'Pas encore d’avis demandé', 'Après deux semaines de campus et un mois de formation, nous vous demanderons votre avis.') : '')}
  ${!prompts.length ? `<div class="card card-pad" style="text-align:center">${icon('star', 26)}<p class="small muted mt8">Merci pour votre parole ✨${mine.length ? ' Vos avis ont bien été transmis à l’équipe.' : ''}</p></div>` : ''}`;
}
function rvCount() {
  const w = (document.getElementById('rvText').value.trim() ? document.getElementById('rvText').value.trim().split(/\s+/).length : 0);
  const el = document.getElementById('rvWords');
  el.textContent = w + ' / 1000 mots';
  el.style.color = w > 1000 ? 'var(--red)' : '';
}

/* ---------------- VÉRIFICATION PUBLIQUE D'UN CERTIFICAT (§36) ---------------- */
function vVerifyCert(code) {
  const c = S.certs.find(x => x.code.toLowerCase() === (code || '').toLowerCase());
  const t = c ? getTraining(c.trainingId) : null;
  const body = c ? `
    <div class="banner ok" style="padding:14px 16px">${icon('checkCircle', 20)}<span><b>Certificat authentique.</b> Ce document a été délivré par DAVAR ACADÉMIE.</span></div>
    <div class="card card-pad mt16" style="text-align:left">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px;text-align:left">
        <div><div class="xs faint">Numéro</div><b>${esc(c.code)}</b></div>
        <div><div class="xs faint">Statut</div><b>${c.status === 'actif' ? 'Actif' : c.status === 'expiré' ? 'Expiré (fin de politique de conservation)' : esc(c.status)}</b></div>
        <div><div class="xs faint">Titulaire</div><b>${esc(c.holderName || c.name || '')}</b></div>
        <div><div class="xs faint">Formation</div><b>${esc(c.formationTitle || (t ? t.title : ''))}</b></div>
        <div><div class="xs faint">Délivré le</div><b>${fmtDate(new Date(c.issuedAt || c.at).toISOString().slice(0, 10))}</b></div>
        <div><div class="xs faint">Document officiel</div><b>PDF ${c.pdfRef ? 'conservé' : '—'}</b></div>
      </div>
      <div class="xs faint mt16">Le certificat est un document historique figé à l’émission. Seules les informations nécessaires à la vérification sont publiques ; aucune donnée privée n’est exposée.</div>
    </div>` : `
    <div class="banner err" style="padding:14px 16px">${icon('alert', 20)}<span><b>Certificat introuvable.</b> Aucun certificat ne correspond à ce numéro dans le registre DAVAR ACADÉMIE.</span></div>`;
  return `<div class="gate" style="min-height:100vh"><div class="gcard" style="max-width:520px;text-align:center">
    <img class="lg-logo" src="assets/campus-logo.png" alt="Davar Académie">
    <h2 style="color:#fff;margin-top:16px">Vérification d’un certificat</h2>
    <p style="color:rgba(255,255,255,.75);font-size:13.5px;margin:8px 0 16px">Numéro vérifié : <b style="color:#fff">${esc(code || '—')}</b></p>
    <div style="text-align:left">${body}</div>
    <div class="mt16"><a class="btn" href="#/" style="background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.25)">Accueil DAVAR ACADÉMIE</a></div>
  </div></div>`;
}
