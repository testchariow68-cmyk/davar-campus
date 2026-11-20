/* ============================================================
   Composants UI partagés
   ============================================================ */
const UI = { bellOpen: false, userMenu: false, adminNavOpen: false, taOpen: false, viewMenu: false };
const CHAT = { open: false, trainingId: null, moduleId: null, mode: 'ai' };

function avatarHTML(user, cls = '') {
  if (user.photo) return `<img class="avatar ${cls}" src="${user.photo}" alt="">`;
  const init = user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return `<span class="avatar ${cls}" style="background:${user.color || 'var(--ava-1)'}">${esc(init)}</span>`;
}
/* Marque = logo de la structure (présent sur tous les dashboards) */
function brandHTML(href = '#/') {
  return `<a class="brand" href="${href}"><img class="brand-img" src="assets/logo-structure.png" alt="Davar Académie" onclick="event.preventDefault();event.stopPropagation();openLogoZoom()"><div class="brand-txt">DAVAR<span>Académie</span></div></a>`;
}
/* Aperçu du logo : petite carte flottante (¼ de la taille du certificat), sans couvrir la page — croix ou clic extérieur pour replier */
function openLogoZoom() {
  closeLogoZoom();
  const d = document.createElement('div'); d.id = 'logoZoom';
  d.onclick = e => { if (e.target === d) closeLogoZoom(); };
  d.innerHTML = `<div class="lz-card"><button class="lz-x" onclick="closeLogoZoom()" title="Replier">✕</button>
    <img src="assets/logo-structure.png" alt="Davar Académie — aperçu du logo"></div>`;
  document.body.appendChild(d);
}
function closeLogoZoom() { const d = document.getElementById('logoZoom'); if (d) d.remove(); }
function brandDarkHTML() {
  return `<div class="brand sb-brand"><img class="sb-logo" src="assets/logo-structure.png" alt="Davar Académie" style="cursor:pointer" onclick="event.preventDefault();event.stopPropagation();openLogoZoom()" title="Voir le logo en grand"><div class="brand-txt" style="color:#fff">DAVAR ACADÉMIE<span>Administration</span></div></div>`;
}
function wordmarkHTML(dark) {
  /* Pages publiques : jamais le logo structure, seulement l'emblème campus */
  return `<a class="brand" href="#/" style="text-decoration:none"><img src="assets/campus-official.png" alt="" style="width:34px;height:34px;object-fit:contain;flex:none"><div class="brand-txt" style="${dark ? 'color:#fff' : ''}">DAVAR<span>Académie</span></div></a>`;
}

/* ---------- Thème clair / sombre (défaut = système, persistant) ---------- */
function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('davar_theme', t); } catch (e) { } /* stockage parfois bloqué (aperçu sandboxé) */
  if (typeof applyPalette === 'function') applyPalette();
  render();
}
function toggleTheme() { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }
function themeBtn() {
  return `<button class="icon-btn" title="Mode ${currentTheme() === 'dark' ? 'clair' : 'sombre'}" onclick="toggleTheme()">${icon(currentTheme() === 'dark' ? 'sun' : 'moon', 18)}</button>`;
}

/* ---------- Ticker réseaux sociaux (discret, défile en bas) ---------- */
function socialTickerHTML(userId) {
  const subs = S.socialSubs[userId] || {};
  const todo = S.settings.socials.filter(s => !subs[s.id]);
  if (!todo.length) return '';
  const items = todo.map(s => `<span class="ti">${icon('globe', 13)} Rejoignez Davar Académie sur <b>&nbsp;${esc(s.platform)}</b>
    <button onclick="subSocial('${s.id}')">S’abonner</button></span>`).join('');
  const track = `<div class="ticker-track">${items}${items}</div>`;
  return `<div class="ticker">${track}</div>`;
}
/* S'abonner : ouvre la VRAIE page du réseau pour un abonnement réel.
   Aucune API publique (Instagram/TikTok/Facebook) ne permet de vérifier un
   abonnement : la confirmation de l'étudiant, horodatée, sert de contrôle
   (visible par l'admin dans Configuration → contrôle des abonnements). */
function subSocial(id) {
  const s = S.settings.socials.find(x => x.id === id); if (!s) return;
  window.open(s.link, '_blank', 'noopener');
  confirmModal('Avez-vous rejoint ' + esc(s.platform) + ' ?',
    'La page officielle vient de s’ouvrir dans un nouvel onglet : appuyez sur « Suivre » là-bas, puis confirmez ici. Votre confirmation est horodatée et visible par l’équipe.',
    'Oui, je suis abonné(e)').then(v => {
      if (v) subSocialConfirm(id);
      else toast('Vous pourrez confirmer plus tard depuis le bandeau.', '', 'star');
    });
}
function subSocialConfirm(id) {
  const s = S.settings.socials.find(x => x.id === id); if (!s) return;
  S.socialSubs[S.session.userId] = S.socialSubs[S.session.userId] || {};
  S.socialSubs[S.session.userId][id] = { at: Date.now() };   /* horodaté — truthy, compatible avec les contrôles existants */
  save(); render();
  toast(`Merci ! Abonnement à ${esc(s.platform)} confirmé ✓ (horodaté pour l’équipe)`, 'ok', 'star');
}
/* ---------- Bandeau d'annonce défilant (configuré par Super Admin / Manager) ---------- */
function announceBarHTML(user) {
  const a = S.settings.announcement;
  if (!a || !a.text) return '';
  const staff = isStaff(user);
  const targeted = a.audience === 'all' || (a.audience === 'staff' && staff) || (a.audience === 'students' && !staff);
  if (!targeted) return '';
  const it = `<span class="ti">${icon('bell', 13)} ${esc(a.text)}</span>`;
  return `<div class="announce-bar"><div class="ticker-track">${it}${it}${it}</div></div>`;
}
function pbarHTML(pct, cls = '') {
  return `<div class="pbar-row"><div class="pbar ${cls}"><i style="width:${Math.min(100, pct)}%"></i></div><span class="pct">${pct}%</span></div>`;
}
function coverStyle(t) {
  if (t.coverImg) return `background:url('${t.coverImg}') center/cover no-repeat`;
  return `background:linear-gradient(140deg,hsl(${t.hue} 45% 12%) 0%,hsl(${t.hue} 55% 22%) 55%,hsl(${t.hue} 48% 32%) 100%)`;
}
/* Carte cover : image uploadée si présente, sinon monogramme dégradé */
function coverHTML(t, extraStyle) {
  return `<div class="t-cover" style="${coverStyle(t)}${extraStyle || ''}">${t.coverImg ? '' : `<span class="mono">${t.mono}</span>`}</div>`;
}
/* Lecteur : transforme une URL YouTube / Vimeo / fichier en embed réel */
function embedHTML(url, ratio) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  const vm = url.match(/vimeo\.com\/(\d+)/);
  const tk = url.match(/tiktok\.com\/(?:[^/]+\/video\/|embed\/v2\/|v\/)(\d+)|vm\.tiktok\.com\/(\w+)/);
  if (tk) { const id = tk[1] || tk[2]; return `<iframe class="embed-real ${RATIO_CLS[ratio] || 'r-169'}" src="https://www.tiktok.com/embed/v2/${id}" title="Vidéo du module" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:0"></iframe>`; }
  if (String(url).startsWith('r2:')) {
    const key = String(url).slice(3);
    const signed = (window.SEC && window.SEC.R2) ? window.SEC.R2.signVideoUrl(key, { secret: window.VIDEO_SECRET || 'davar-demo' }) : '';
    return videoShell(`<video class="embed-real" src="${esc(signed)}" data-r2="${esc(key)}" playsinline oncontextmenu="return false" ontimeupdate="vidTime(this)" onclick="vidToggle(this)" style="width:100%;height:100%;background:#000;object-fit:contain"></video>`, ratio);
  }
  if (yt) return `<iframe class="embed-real ${RATIO_CLS[ratio] || 'r-169'}" src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="Vidéo du module" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:0"></iframe>`;
  if (vm) return `<iframe class="embed-real" src="https://player.vimeo.com/video/${vm[1]}" title="Vidéo du module" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:0"></iframe>`;
  return videoShell(`<video class="embed-real" src="${esc(url)}" playsinline oncontextmenu="return false" ontimeupdate="vidTime(this)" onclick="vidToggle(this)" style="width:100%;height:100%;background:#000;object-fit:contain"></video>`, ratio);
}
/* Lecteur vidéo maison : AUCUN contrôle natif → le bouton « télécharger » n'existe pas,
   dans aucun navigateur. Seulement lecture/pause, curseur, temps, plein écran. */
function videoShell(videoTag, ratio) {
  return `<div class="vidwrap ${RATIO_CLS[ratio] || 'r-169'}" style="position:relative;width:100%;height:100%;background:#000">
    ${videoTag}
    <div class="vidbar" style="position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:8px;padding:6px 10px;background:linear-gradient(transparent,rgba(0,0,0,.78))">
      <button class="vbtn" onclick="vidToggle(this)" title="Lecture / Pause" style="background:none;border:0;color:#fff;cursor:pointer">${icon('play', 16)}</button>
      <input type="range" min="0" max="1000" value="0" oninput="vidSeek(this)" style="flex:1;accent-color:var(--gold)">
      <span class="vidtime xs" style="color:#fff;min-width:74px;text-align:right">0:00 / 0:00</span>
      <button class="vbtn" onclick="vidFull(this)" title="Plein écran" style="background:none;border:0;color:#fff;cursor:pointer">${icon('expand', 16)}</button>
    </div>
  </div>`;
}
function vidOf(el) { return el.closest('.vidwrap').querySelector('video'); }
function vidToggle(el) { const v = el.tagName === 'VIDEO' ? el : vidOf(el); if (v.paused) v.play(); else v.pause(); }
function vidSeek(r) { const v = vidOf(r); if (v.duration) v.currentTime = (r.value / 1000) * v.duration; }
function vidFull(el) { const v = vidOf(el); if (v.requestFullscreen) v.requestFullscreen(); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); }
function vidT(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function vidTime(v) { const w = v.closest('.vidwrap'); if (!w) return; const r = w.querySelector('input[type=range]'); const t = w.querySelector('.vidtime'); if (v.duration && !v.seeking) r.value = Math.round(v.currentTime / v.duration * 1000); t.textContent = vidT(v.currentTime) + ' / ' + vidT(v.duration); }
function notifIcon(type) {
  const map = {
    cert: ['award', 'var(--gold-soft)', '#8A6D2B'], coach: ['message', 'var(--gold-soft)', '#8A6D2B'],
    ai: ['sparkles', 'var(--violet-soft)', 'var(--violet)'], exercise: ['clipboard', 'var(--green-soft)', 'var(--green)'],
    eval: ['target', 'var(--violet-soft)', 'var(--violet)'], admin: ['shield', 'var(--violet-soft)', 'var(--violet)'],
    sale: ['wallet', 'var(--green-soft)', 'var(--green)'], info: ['bell', '#F0EEF5', 'var(--muted)'],
    badge: ['award', 'var(--gold-soft)', '#8A6D2B'], rappel: ['clock', 'var(--violet-soft)', 'var(--violet)'],
    retour: ['rw_circle', 'var(--violet-soft)', 'var(--violet)'],
    reply: ['message', 'var(--violet-soft)', 'var(--violet)']
  };
  const [ic, bg, col] = map[type] || map.info;
  return `<span class="ni-icon" style="background:${bg};color:${col}">${icon(ic, 16)}</span>`;
}

/* ---------- Toasts ---------- */
function toast(msg, kind = '', iconN = 'check') {
  let wrap = document.querySelector('.toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toasts'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(iconN || 'check', 16)}<span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.transition = 'all .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 320); }, 3400);
}

/* ---------- Modal ---------- */
function openModal({ title, body, foot, onClose, wide }) {
  closeModal();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'modalOverlay';
  ov.innerHTML = `<div class="modal" ${wide ? 'style="width:min(720px,100%)"' : ''}>
    <div class="modal-head"><h3>${title}</h3><button class="icon-btn" onclick="closeModal()">${icon('x', 17)}</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) { closeModal(); onClose && onClose(); } });
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
}
function closeModal() { document.getElementById('modalOverlay')?.remove(); document.body.style.overflow = ''; }
function confirmModal(title, msg, okLabel = 'Confirmer', danger = false) {
  return new Promise(res => {
    openModal({
      title, body: `<p class="muted" style="font-size:13.5px">${msg}</p>`,
      foot: `<button class="btn" onclick="closeModal();window.__cres(false)">Annuler</button>
             <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" onclick="closeModal();window.__cres(true)">${okLabel}</button>`
    });
    window.__cres = v => res(v);
  });
}

/* ---------- Dropdowns globaux ---------- */
function toggleBell() { UI.bellOpen = !UI.bellOpen; UI.userMenu = false; UI.viewMenu = false; render(); }
function toggleUserMenu() { UI.userMenu = !UI.userMenu; UI.bellOpen = false; UI.viewMenu = false; render(); }
function lcNotifExpired(n) {
  const h = (typeof lcCfg === 'function' ? lcCfg().notifReadHours : 48) || 48;
  return !!(n.read && Date.now() - (n.readAt || n.at) > h * 3600000);
}
function markAllRead() { const u = S.session.userId; S.notifs.forEach(n => { if (n.userId === u && !n.read) { n.read = true; n.readAt = Date.now(); } }); save('notifs'); UI.bellOpen = false; render(); toast('Notifications marquées comme lues ✓', 'ok', 'bell'); }
/* Redirection intelligente : chaque notification ramène à la page où l'on agit.
   Les notifications purement informatives (réunion, annonce…) marquent simplement comme lu. */
function notifRoute(n) {
  if (!n) return null;
  if (n.meta && n.meta.route) return n.meta.route;
  const staff = isStaff(getUser(S.session.userId));
  const t = n.type;
  if (t === 'badge') return null;                       /* ouvre la fiche distinction */
  if (staff) {
    if (['coach', 'reply', 'ai', 'report'].includes(t)) return '#/admin/conversations';
    if (['eval', 'exercise'].includes(t)) return '#/admin/evaluations';
    if (t === 'cert') return '#/admin/certifications';
    if (t === 'sale') return '#/admin/ventes';
    if (t === 'staff') return '#/admin/activites';
    return null;
  }
  if (['coach', 'reply', 'ai'].includes(t)) return '#/questions';
  if (t === 'cert') return '#/certificats';
  if (['eval', 'exercise', 'rappel', 'retour', 'module', 'formation', 'quiz'].includes(t)) return '#/formations';
  return null;
}
function notifGo(id) {
  const x = S.notifs.find(y => y.id === id); if (!x) return;
  x.read = true; x.readAt = Date.now(); save('notifs');
  const route = notifRoute(x);
  UI.bellOpen = false;
  if (route) { location.hash = route; render(); } else render();
}
function bellItemClick(id) {
  const x = S.notifs.find(y => y.id === id); if (!x) return;
  x.read = true; x.readAt = Date.now(); save('notifs');
  const badge = x.meta && x.meta.badge;
  const route = badge ? null : notifRoute(x);
  UI.bellOpen = false;
  if (route) { location.hash = route; render(); return; }
  render();
  const more = S.notifs.some(n => n.userId === S.session.userId && !n.read);
  if (!more) setTimeout(() => { if (UI.bellOpen && !S.notifs.some(n => n.userId === S.session.userId && !n.read)) { UI.bellOpen = false; render(); } }, 650);
  if (badge) openBadgeSheet(badge);
}
function bellHTML(userId) {
  const mine = S.notifs.filter(n => n.userId === userId && !lcNotifExpired(n));
  const unread = mine.filter(n => !n.read).length;
  return `<div class="dd-anchor">
    <button class="icon-btn" onclick="toggleBell()" title="Notifications">${icon('bell', 19)}${unread ? '<span class="n-badge"></span>' : ''}</button>
    ${UI.bellOpen ? `<div class="dd-menu notif-dd">
      <div class="nd-head"><span>Notifications</span>${unread ? '<button onclick="markAllRead()">Tout marquer lu</button>' : ''}</div>
      <div class="notif-list">${mine.length ? mine.slice(0, 12).map(n => `
        <div class="notif-item ${n.read ? '' : 'unread'}" onclick="bellItemClick('${n.id}')">
          ${notifIcon(n.type)}
          <div class="wrap"><h4>${esc(n.title)}</h4><p>${esc(n.body)}</p><time>${timeAgo(n.at)}</time></div>
        </div>`).join('') : '<div class="empty small">Aucune notification pour le moment.</div>'}
      </div>
      <div style="padding:9px 16px;border-top:1px solid var(--line);font-size:11px;color:var(--faint);display:flex;gap:6px;align-items:center">${icon('zap', 12)} Notifications ${S.settings.pushEnabled ? '· activées' : '· désactivées'}</div>
    </div>` : ''}
  </div>`;
}
function userMenuHTML(user) {
  return `<div class="dd-anchor">
    <button class="icon-btn" onclick="toggleUserMenu()" style="padding:2px">${avatarHTML(user)}</button>
    ${UI.userMenu ? `<div class="dd-menu">
      <div style="padding:12px 14px;border-bottom:1px solid var(--line)">
        <div style="font-weight:700;font-size:13.5px">${esc(user.name)}</div>
        <div class="xs muted">${esc(user.email)}</div>
      </div>
      ${isStaff(user) ? `<a class="dd-item" href="#/profil">${icon('user', 15)} Profil</a>` : ''}
      ${!isStaff(user) ? `
        <a class="dd-item" href="#/certificats">${icon('award', 15)} Mes certificats</a>
        <a class="dd-item" href="#/profil">${icon('settings', 15)} Profil & paramètres</a>` : ''}
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="resetDemo()">${icon('refresh', 15)} Réinitialiser la démo</div>
      <div class="dd-item danger" onclick="logout()">${icon('logout', 15)} Se déconnecter</div>
    </div>` : ''}
  </div>`;
}

/* ---------- Divers ---------- */
function statCard(lbl, val, iconN, extra = '') {
  return `<div class="card stat">
    <div class="s-top"><span class="s-lbl">${lbl}</span><span class="s-ico">${icon(iconN, 17)}</span></div>
    <div class="s-val">${val}</div>${extra}
  </div>`;
}
function emptyState(iconN, title, sub) {
  return `<div class="empty">${icon(iconN, 30)}<div class="mt8" style="font-weight:700;color:var(--muted)">${title}</div><div class="xs mt4">${sub || ''}</div></div>`;
}
function logout() {
  /* Le Super Admin ne peut pas se déconnecter tant qu'aucun Manager n'est présent sur la plateforme */
  const u = S.session ? getUser(S.session.userId) : null;
  if (u && u.role === 'admin') {
    const manager = realManager();
    if (!manager) {
      confirmModal('Se déconnecter ?', 'Aucun Manager n’est présent sur la plateforme. Pour ne pas laisser l’administration sans responsable, invitez d’abord un Manager (Équipe → Inviter un staff). La déconnexion sera possible dès qu’il aura accepté.', 'Compris').then(() => {});
      return;
    }
  }
  S.session = null; save(); location.hash = '#/login'; render();
}

/* Fermer les dropdowns au clic extérieur */
document.addEventListener('click', e => {
  const tg = e.target && e.target.closest ? e.target : null;
  if (UI.taOpen && !(tg && tg.closest('.tasel'))) { UI.taOpen = false; render(); }
  if ((UI.bellOpen || UI.userMenu || UI.viewMenu) && !(tg && tg.closest('.dd-anchor'))) {
    UI.bellOpen = false; UI.userMenu = false; UI.viewMenu = false; render();
  }
});
