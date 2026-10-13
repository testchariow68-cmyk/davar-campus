/* ============================================================
   CENTRE DE CONTRÔLE — SUPER ADMINISTRATEUR & ÉQUIPE
   ============================================================ */
const ROLES = [
  ['coach', 'Coach'], ['correcteur', 'Correcteur'], ['assistant', 'Assistant pédagogique'],
  ['contenu', 'Responsable de contenu'], ['support', 'Support'], ['analyste', 'Analyste'],
  ['manager', 'Manager']
];
/* Navigation visible selon les rôles (chaque staff a SON dashboard).
   Le Super Admin voit tout ; personne d'autre ne touche aux réglages sensibles. */
function staffAccess(u) {
  if (u.role === 'admin') return null; // tout
  const me = S.team.find(m => m.email === u.email);
  const roles = me ? me.roles : [];
  if (roles.includes('manager')) return ['', 'analytics', 'formations', 'exercices', 'evaluations', 'ressources', 'etudiants', 'conversations', 'avis', 'certifications', 'recompenses', 'ventes', 'cycle', 'activites', 'equipe'];
  const acc = [];
  if (roles.includes('coach')) acc.push('etudiants', 'conversations', 'evaluations');
  if (roles.includes('correcteur')) acc.push('evaluations', 'conversations');
  if (roles.includes('contenu')) acc.push('formations', 'exercices');
  if (roles.includes('support')) acc.push('conversations');
  if (roles.includes('analyste')) acc.push('analytics', 'sante', 'assistants', 'badges', 'activite');
  if (roles.includes('assistant')) acc.push('etudiants', 'evaluations');
  return acc.length ? [''].concat(acc) : [''];
}

function adminShell(r, u) {
  const sec = r.parts[1] || '';
  const access = staffAccess(u);
  if (access && !access.includes(sec)) {
    return `<div class="admin-shell"><aside class="sidebar">${brandDarkHTML()}<div class="sb-sec"><div class="sb-label">Accès</div><a class="sb-item" href="#/admin">${icon('grid', 16)} Vue d'ensemble</a></div></aside>
      <div class="admin-main"><div class="admin-top"><h2>Accès restreint</h2></div>
      <div class="admin-content"><div class="card lock-hero" style="max-width:480px;margin:40px auto"><div class="lk">${icon('lock', 24)}</div><h2>Réservé à d'autres rôles</h2><p class="muted small mt8">Votre rôle ne donne pas accès à cette section. Chaque membre du staff voit uniquement ce dont il a besoin.</p></div></div></div></div>`;
  }
  const subCount = S.submissions.filter(x => x.status === 'pending').length;
  const coachQ = S.threads.filter(th => !th.resolved && th.messages.some(m => m.from === 'student' && m.coach) && !th.messages.some(m => m.from === 'coach')).length;
  const unread = S.notifs.filter(n => n.userId === u.id && !n.read).length;
  const NAV = [
    ['PILOTAGE', [['', 'Vue d’ensemble', 'grid', 0], ['analytics', 'Analytics', 'chart', 0],
      ['sante', 'Santé technique', 'wallet', 0, 'ana'], ['assistants', 'Analyse assistants virtuels', 'sparkles', 0, 'ana'],
      ['badges', 'Badges & distinctions', 'rw_seal', 0, 'ana'], ['activite', 'Activité étudiants', 'users', 0, 'ana']]],
    ['PÉDAGOGIE', [['formations', 'Formations', 'book', 0], ['ressources', 'Ressources', 'doc', 0], ['exercices', 'Exercices', 'clipboard', 0], ['evaluations', 'Évaluations', 'target', subCount]]],
    ['COMMUNAUTÉ', [['etudiants', 'Étudiants', 'users', 0], ['conversations', 'Conversations', 'message', coachQ], ['avis', 'Avis', 'star', 0]]],
    ['SYSTÈME', [['certifications', 'Certifications', 'award', 0], ['recompenses', 'Récompenses', 'rw_seal', 0], ['ventes', 'Ventes', 'wallet', 0], ['exports', 'Exports', 'download', 0], ['cycle', 'Cycle de vie', 'clock', 0], ['ia', 'Assistant virtuel', 'sparkles', 0], ['emails', 'E-mails', 'mail', 0], ['activites', 'Activités', 'chart', 0], ['equipe', 'Équipe', 'shield', 0], ['parametres', 'Configuration', 'settings', 0]]]
  ];
  const titles = { '': 'Vue d’ensemble', analytics: 'Analytics', sante: 'Santé technique', assistants: 'Analyse assistants virtuels', badges: 'Badges & distinctions', activite: 'Activité étudiants', formations: 'Formations', ressources: 'Ressources', exercices: 'Exercices', evaluations: 'Évaluations', etudiants: 'Étudiants', conversations: 'Conversations', avis: 'Avis', certifications: 'Certifications', ventes: 'Ventes', ia: 'Assistant virtuel', emails: 'E-mails', exports: 'Exports', cycle: 'Cycle de vie', activites: 'Activités de l’équipe', recompenses: 'Récompenses', equipe: 'Équipe', parametres: 'Configuration' };
  const content = adminPage(r, u);

  return `<div class="admin-shell">
    <aside class="sidebar">
      ${brandDarkHTML()}
      ${NAV.map(([lbl, items]) => {
        const isAna = u.role === 'admin' || ((S.team.find(m => m.email === u.email) || {}).roles || []).includes('analyste');
        const vis = items.filter(([id, , , , only]) => (!access || access.includes(id)) && (!only || isAna));
        if (!vis.length) return '';
        return `<div class="sb-sec"><div class="sb-label">${lbl}</div>
        ${vis.map(([id, name, ic, cnt]) => `<a class="sb-item ${sec === id ? 'active' : ''}" href="#/admin${id ? '/' + id : ''}">${icon(ic, 16)} ${name}${cnt ? `<span class="cnt hot">${cnt}</span>` : ''}</a>`).join('')}
      </div>`;
      }).join('')}
      <div class="sb-foot" onclick="adminUserPop(event, this)" style="cursor:pointer" title="Mon compte">
        <div class="row">${avatarHTML(u, 'sm')}<div class="wrap"><div style="font-size:12px;font-weight:700;color:#fff">${esc(u.name)}</div><div style="font-size:10.5px;color:#7E7592">${u.role === 'admin' ? 'Super Administrateur' : esc(u.title || 'Équipe')}</div></div></div>
      </div>
    </aside>
    <div class="admin-main">
      ${viewAsBannerHTML()}
      <div class="admin-top">
        <h2>${titles[sec] || 'Centre de contrôle'} ${u.role === 'admin' ? `<span class="badge ${(S.palette || 'violet') === 'violet' ? 'b-gold' : 'b-violet'}" style="margin-left:8px">Super Admin</span>` : `<span class="badge ${(S.palette || 'violet') === 'violet' ? 'b-violet' : 'b-dark'}" style="margin-left:8px">Équipe</span>`}</h2>
        <div class="tb-right">
          ${viewAsBtnHTML(u)}
          ${themeBtn()}
          <span id="adBellBox">${bellHTML(u.id)}</span>
          ${userMenuHTML(u)}
        </div>
      </div>
      ${u.role === 'admin' ? '' : announceBarHTML(u)}
      <div class="admin-content" id="adPage">${content}</div>
      ${u.role === 'admin' ? '' : socialTickerHTML(u.id)}
    </div>
    <a class="fab-home" href="javascript:void(0)" onpointerdown="fabDown(event)" onclick="fabHomeTap(event)" title="Glissez pour déplacer · 1 tap : retour · 2 taps : accueil">${icon('home', 17)}</a>
  </div>`;
}
function adminPage(r, u) {
  const sec = r.parts[1] || '';
  if (sec !== 'parametres') { PAL_DRAFT = null; PALC_DRAFT = null; }
  if (sec !== 'exports') { EXPORT_READY = null; }
  let content = aOverview(u);
  if (sec === 'analytics') content = aAnalytics();
  else if (sec === 'sante') content = aSante();
  else if (sec === 'assistants') content = aAssistants();
  else if (sec === 'badges') content = aBadgesAnalyst();
  else if (sec === 'activite') content = aActiviteEtudiants();
  else if (sec === 'formations') content = r.parts[2] ? aTrainingEditor(r.parts[2]) : aTrainings();
  else if (sec === 'ressources') content = aResources(u);
  else if (sec === 'exercices') content = aExercises();
  else if (sec === 'evaluations') content = aEvaluations();
  else if (sec === 'etudiants') content = r.parts[2] ? aStudentDetail(r.parts[2]) : aStudents();
  else if (sec === 'conversations') content = r.parts[2] ? aConversationDetail(r.parts[2]) : aConversations();
  else if (sec === 'avis') content = aAvis(u);
  else if (sec === 'certifications') content = aCerts();
  else if (sec === 'ventes') content = aSales();
  else if (sec === 'ia') content = aAI();
  else if (sec === 'emails') content = aEmails(u);
  else if (sec === 'activites') content = aActivites(u);
  else if (sec === 'recompenses') content = aRewards(u);
  else if (sec === 'exports') content = aExports(u);
  else if (sec === 'cycle') content = aLifecycle(u);
  else if (sec === 'equipe') content = aTeam();
  else if (sec === 'parametres') content = aSettings();
  return content;
}
/* ---------- Vues test : un compte test par rôle (une seule combinaison) ----------
   Le Super Admin et le Manager peuvent tout tester ; Échap ou le bouton « Quitter » ramène au compte réel. */
function aActivites(u) {
  const meTeam = S.team.find(m => m.email === u.email);
  const isManager = u.role !== 'admin' && meTeam && meTeam.roles.includes('manager');
  const adminU = S.users.find(x => x.role === 'admin');
  let logs = S.auditLog.slice(0, 120);
  if (isManager && adminU) logs = logs.filter(a => a.actor !== adminU.id);
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Activités de l’équipe</h1><p>Chaque action de chaque membre${u.role === 'admin' ? '' : ' (hors Super Administrateur)'} — les actions importantes déclenchent une alerte push pour le Super Admin et le Manager.</p></div></div>
  <div class="card" style="overflow-x:auto">
    ${logs.length ? `<table class="tbl"><thead><tr><th>Membre</th><th>Action</th><th>Détail</th><th>Niveau</th><th>Date & heure</th></tr></thead><tbody>
    ${logs.map(a => { const au = getUser(a.actor); return `<tr>
      <td><b class="xs">${esc(au ? au.name : a.actor)}</b></td>
      <td class="xs">${esc(actionLabel(a.action))}</td>
      <td class="xs muted">${esc((a.payload && (a.payload.subject || a.payload.name || a.payload.data || a.payload.email || a.payload.to)) || '—')}</td>
      <td>${a.important ? '<span class="badge b-gold">importante</span>' : '<span class="badge b-grey">routine</span>'}</td>
      <td class="xs muted">${new Date(a.at).toLocaleString('fr-FR')}</td></tr>`; }).join('')}
    </tbody></table>` : '<div style="padding:16px" class="xs muted">Aucune activité enregistrée pour l’instant.</div>'}
  </div>`;
}
function viewAsStudent() { viewAs('u-awa'); }
function viewAsList() {
  /* Production : la vue test n'ouvre JAMAIS une vraie personne — uniquement les comptes test. */
  const out = [];
  /* Filet de sécurité absolu : SEULS les comptes test, le fondateur et les vraies personnes n’y sont JAMAIS. */
  const stu = S.users.find(u => u.id === 'u-test-etudiant' && u.role === 'student' && u.id !== 'u-yann');
  if (stu) out.push({ id: stu.id, lbl: 'Vue Étudiant — ' + stu.name, ic: 'user' });
  S.users.filter(u => u.id.indexOf('u-test-') === 0 && u.id !== 'u-test-etudiant' && u.role !== 'admin' && u.id !== 'u-yann').forEach(u =>
    out.push({ id: u.id, lbl: 'Vue ' + String(u.title || '').replace('Compte test — ', '') + ' — ' + u.name, ic: 'shield' }));
  return out;
}
function toggleViewMenu() { UI.viewMenu = !UI.viewMenu; UI.userMenu = false; UI.bellOpen = false; render(); }
function viewAsBtnHTML(u) {
  if (S.session.viewAsReal) return '';
  const meTeam = S.team.find(m => m.email === u.email);
  /* Le Super Admin a TOUJOURS le test de vue (toutes les vues). Le Manager seulement si activé en Configuration — et jamais la vue du fondateur. */
  const can = u.role === 'admin' || !!(meTeam && meTeam.roles.includes('manager') && S.settings.managerViewAs);
  if (!can) return '';
  return `<div class="dd-anchor"><button class="btn btn-ghost btn-sm" onclick="toggleViewMenu()">${icon('eye', 14)} Tester une vue</button>
    ${UI.viewMenu ? `<div class="dd-menu view-dd" style="min-width:270px">
      <div style="padding:10px 14px;border-bottom:1px solid var(--line)" class="xs muted">Toutes les vues — étudiant et staff — sur comptes test uniquement, jamais une vraie personne. Vous gardez vos droits : Échap ou « Quitter » pour revenir.</div>
      ${viewAsList().map(x => `<div class="dd-item" onclick="viewAs('${x.id}')">${icon(x.ic, 15)} ${esc(x.lbl)}</div>`).join('')}
    </div>` : ''}</div>`;
}
function viewAs(uid) {
  const meU = getUser(S.session.userId);
  const meT = S.team.find(m => m.email === (meU ? meU.email : ''));
  const allowed = meU && (meU.role === 'admin' || !!((meT && meT.roles.includes('manager')) && S.settings.managerViewAs));
  if (!allowed) { UI.viewMenu = false; return toast('Le test de vue n’est pas activé pour votre compte.', 'err', 'shieldCheck'); }
  if (!uid || String(uid).indexOf('u-test-') !== 0 || uid === 'u-yann') { UI.viewMenu = false; return toast('La vue test n’ouvre que des comptes test — jamais le fondateur ni une vraie personne.', 'err', 'shieldCheck'); }
  const real = S.session.viewAsReal || S.session.userId;
  S.session = { userId: uid, viewAsReal: real }; save();
  UI.viewMenu = false;
  const u = getUser(uid);
  location.hash = isStaff(u) ? '#/admin' : '#/';
  render();
  toast('Vue test : ' + u.name + ' — bouton « Quitter » ou touche Échap pour revenir', '', 'eye');
}
function quitViewAs() {
  const real = S.session.viewAsReal; if (!real) return;
  S.session = { userId: real }; save();
  const u = getUser(real);
  location.hash = isStaff(u) ? '#/admin' : '#/';
  render();
  toast('Retour à votre compte ✓', 'ok', 'shieldCheck');
}
function viewAsBannerHTML() {
  if (!S.session || !S.session.viewAsReal) return '';
  const u = getUser(S.session.userId);
  return `<div class="viewas-bar"><span>${icon('eye', 14)} <span class="xs">Vue test : <b>${esc(u.name)}</b> — touche Échap pour quitter</span></span>
    <button class="viewas-quit" onclick="quitViewAs()" title="Quitter la vue test (Échap)">Quitter</button></div>`;
}
function bindAdmin(r) { }

/* ---------------- VUE D'ENSEMBLE ---------------- */
/* ---------------- Vue d'ensemble — dispatchée par rôle ----------------
   Super Admin et Manager : pilotage complet (finances incluses).
   Autres membres du staff : dashboard personnalisé — KPI et tâches actionnables
   selon les droits du rôle ; aucune donnée financière hors Super Admin/Manager. */
function aOverview(u) {
  if (u.role === 'admin') return aOverviewPilotage(u);
  const me = S.team.find(m => m.email === u.email);
  const roles = me ? me.roles : [];
  if (roles.includes('manager')) return aOverviewPilotage(u);
  return aOverviewStaff(u, roles);
}
function nowStamp() {
  const d = new Date();
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
const STAFF_ROLE_LABELS = { coach: 'Coach', correcteur: 'Correcteur', contenu: 'Responsable de contenu', support: 'Support', analyste: 'Analyste', assistant: 'Assistant pédagogique' };
function coachPendingQs() { return S.threads.filter(th => !th.resolved && th.messages.some(m => m.from === 'student' && m.coach) && !th.messages.some(m => m.from === 'coach')); }
function subRowTask(x) {
  return `<a class="res-item" href="#/admin/evaluations"><span class="step-ico s-gold">${icon('upload', 14)}</span>
    <div class="wrap"><b style="font-size:13px">Corriger : ${esc(x.file)}</b><div class="xs faint">${esc(getUser(x.userId)?.name)} · ${esc(getTraining(x.trainingId)?.title)} · ${timeAgo(x.at)}</div></div>
    <span class="badge b-amber">En attente</span></a>`;
}
function aOverviewStaff(u, roles) {
  const students = S.users.filter(x => x.role === 'student');
  const pendSubs = S.submissions.filter(x => x.status === 'pending');
  const kpis = []; const tasks = []; let extraCards = '';
  if (roles.includes('coach')) {
    const qs = coachPendingQs();
    kpis.push(statCard('Étudiants suivis', students.length, 'users'));
    kpis.push(statCard('Questions pour moi', qs.length, 'message', qs.length ? '<span class="badge b-red">À répondre</span>' : '<span class="badge b-green">À jour</span>'));
    qs.forEach(th => tasks.push(`<a class="res-item" href="#/admin/conversations/${th.id}"><span class="step-ico s-gold">${icon('message', 14)}</span>
      <div class="wrap"><b style="font-size:13px">Répondre : ${esc(getUser(th.userId)?.name)}</b><div class="xs faint">${esc(th.messages[th.messages.length - 1].text.slice(0, 80))}…</div></div>
      <span class="badge b-amber">48 h</span></a>`));
  }
  if (roles.includes('correcteur')) {
    const done = S.submissions.filter(x => x.status === 'approved').length;
    kpis.push(statCard('Copies à corriger', pendSubs.length, 'clipboard', pendSubs.length ? '<span class="badge b-red">À traiter</span>' : '<span class="badge b-green">À jour</span>'));
    kpis.push(statCard('Copies corrigées', done, 'checkCircle'));
    pendSubs.forEach(x => tasks.push(subRowTask(x)));
  }
  if (roles.includes('assistant')) {
    kpis.push(statCard('Étudiants', students.length, 'users', '<span class="xs muted">+' + students.filter(x => Date.now() - x.joined < 30 * DAY).length + ' ce mois-ci</span>'));
    kpis.push(statCard('Travaux en attente', pendSubs.length, 'alert'));
    if (!roles.includes('correcteur')) pendSubs.forEach(x => tasks.push(subRowTask(x)));
  }
  if (roles.includes('contenu')) {
    const pub = S.trainings.filter(t => t.published);
    const drafts = S.trainings.filter(t => !t.published);
    const chaps = S.trainings.reduce((a, t) => a + t.chapters.length, 0);
    kpis.push(statCard('Formations publiées', pub.length + ' / ' + S.trainings.length, 'book'));
    kpis.push(statCard('Chapitres', chaps, 'layers'));
    drafts.forEach(t => tasks.push(`<a class="res-item" href="#/admin/formations"><span class="step-ico s-cur">${icon('book', 14)}</span>
      <div class="wrap"><b style="font-size:13px">Finaliser : ${esc(t.title)}</b><div class="xs faint">Brouillon — ${t.chapters.length} chapitre(s)</div></div>
      <span class="badge b-grey">Brouillon</span></a>`));
  }
  if (roles.includes('support')) {
    const open = S.threads.filter(th => !th.resolved);
    const waiting = open.filter(th => th.messages.length && th.messages[th.messages.length - 1].from === 'student');
    kpis.push(statCard('Conversations ouvertes', open.length, 'message', waiting.length ? '<span class="badge b-red">' + waiting.length + ' sans réponse</span>' : '<span class="badge b-green">À jour</span>'));
    kpis.push(statCard('Résolues', S.threads.filter(th => th.resolved).length, 'checkCircle'));
    open.slice(0, 6).forEach(th => tasks.push(`<a class="res-item" href="#/admin/conversations/${th.id}"><span class="step-ico ${waiting.includes(th) ? 's-gold' : 's-cur'}">${icon('message', 14)}</span>
      <div class="wrap"><b style="font-size:13px">${esc(getUser(th.userId)?.name)}</b><div class="xs faint">${esc(th.messages[th.messages.length - 1].text.slice(0, 80))}…</div></div>
      <span class="badge ${waiting.includes(th) ? 'b-amber' : 'b-grey'}">${waiting.includes(th) ? 'Sans réponse' : 'Ouverte'}</span></a>`));
  }
  if (roles.includes('analyste')) {
    const done = students.filter(x => myTrainings(x.id).some(t => trainingProgress(x.id, t).pct === 100)).length;
    const pub = S.trainings.filter(t => t.published);
    const note = pub.length ? (pub.reduce((a, t) => a + t.rating, 0) / pub.length).toFixed(1) : '—';
    const L = S.auditLog || [];
    const nC = L.filter(a => /^chariow/.test(a.action)).length, nM = L.filter(a => /^moneyfusion/.test(a.action)).length, nF = L.filter(a => /^flutterwave/.test(a.action)).length;
    kpis.push(statCard('Étudiants', students.length, 'users', '<span class="xs muted">+' + students.filter(x => Date.now() - x.joined < 30 * DAY).length + ' ce mois-ci</span>'));
    kpis.push(statCard('Taux de complétion', (students.length ? Math.round(done / students.length * 100) : 0) + ' %', 'target'));
    kpis.push(statCard('Badges émis', (S.rewards || []).length, 'rw_seal'));
    kpis.push(statCard('Passerelles suivies', [nC, nM, nF].filter(x => x > 0).length + ' / 3', 'wallet'));
    kpis.push(statCard('Note moyenne', '⭐ ' + note, 'star'));
    extraCards = analystDeepHTML();
  }
  /* Activité récente : jamais de ventes ni de paiements pour le staff */
  const activity = [
    ...S.submissions.map(x => ({ at: x.at, icon: 'upload', txt: `Soumission reçue — ${getUser(x.userId)?.name} · ${x.file}` })),
    ...S.certs.map(c => ({ at: c.issuedAt, icon: 'award', txt: `Certificat émis — ${getUser(c.userId)?.name} · ${getTraining(c.trainingId)?.title}` })),
    ...S.threads.flatMap(th => th.messages.filter(m => m.from === 'student').map(m => ({ at: m.at, icon: 'message', txt: `Question de ${getUser(th.userId)?.name} (${m.coach ? 'adressée au coach' : 'répondue par l’IA'})` })))
  ].sort((a, b) => b.at - a.at).slice(0, 8);
  const labels = roles.map(r => STAFF_ROLE_LABELS[r] || r).join(' · ');
  return `
  <div class="page-head"><div><div class="xs stamp">${nowStamp()}</div><h1 style="font-size:19px">${cpGreet()} ${esc(u.name.split(' ')[0])} 👋</h1><p>${esc(labels)} — votre espace de travail complet.</p></div></div>
  <div class="grid g4">${kpis.slice(0, 4).join('') || '<div class="card card-pad empty small">Aucun indicateur pour ce rôle.</div>'}</div>
  ${kpis.length > 4 ? `<div class="grid g4 mt16">${kpis.slice(4).join('')}</div>` : ''}
  <div class="grid mt16" style="grid-template-columns:1.5fr 1fr;align-items:start">
    <div class="card">
      <div class="card-head"><h3>Ma file de travail</h3></div>
      ${tasks.join('')}
      ${roles.includes('analyste') ? `<a class="res-item" href="#/admin/analytics"><span class="step-ico s-cur">${icon('chart', 14)}</span><div class="wrap"><b style="font-size:13px">Ouvrir les analytics complets</b><div class="xs faint">Tendances, cohortes et progression détaillée</div></div><span class="badge b-grey">Analytics</span></a>` : ''}
      ${!tasks.length && !roles.includes('analyste') ? '<div class="empty small">Aucune tâche en attente ✨</div>' : ''}
    </div>
    <div class="card">
      <div class="card-head"><h3>Activité récente</h3></div>
      ${activity.map(a => `<div class="res-item"><span class="step-ico s-cur">${icon(a.icon, 13)}</span>
        <div class="wrap"><span class="small">${a.txt}</span><div class="xs faint mt4">${timeAgo(a.at)}</div></div></div>`).join('') || '<div class="empty small">Aucune activité.</div>'}
    </div>
  </div>
  ${extraCards}`;
}
/* ---------- Analyste : santé technique de la plateforme (jamais de montants) ---------- */
function analystDeepHTML() {
  const studentsOfAnalyst = S.users.filter(x => x.role === 'student');
  const L = (S.auditLog || []);
  const ev = re => L.filter(a => re.test(a.action));
  const chariow = ev(/^chariow/), mf = ev(/^moneyfusion/), fw = ev(/^flutterwave/);
  const hooks = x => x.filter(a => /webhook|pulse/.test(a.action)).length;
  const provRow = (name, list) => {
    const last = list.length ? Math.max(...list.map(a => a.at)) : 0;
    return `<div class="res-item"><span class="step-ico s-cur">${icon('wallet', 13)}</span>
      <div class="wrap"><b style="font-size:13px">${name}</b><div class="xs faint">${list.length} appel(s) · ${hooks(list)} webhook(s) confirmé(s)${last ? ' · dernier ' + timeAgo(last) : ''}</div></div></div>`;
  };
  const firsts = [['Chariow', chariow], ['Money Fusion', mf], ['Flutterwave', fw]]
    .filter(x => x[1].length).map(x => ({ n: x[0], at: Math.min(...x[1].map(a => a.at)) })).sort((a, b) => a.at - b.at);
  const aiSw = L.filter(a => a.action === 'ai_fallback').sort((a, b) => b.at - a.at);
  const chain = (S.aiConfig && S.aiConfig.fallbackChain && S.aiConfig.fallbackChain.length) ? S.aiConfig.fallbackChain : ['groq', 'gemini', 'openrouter', 'hf'];
  const cur = chain.find(id => !((S.aiUsage || {})[id] || {}).exhausted) || chain[0];
  const rw = (S.rewards || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const rw30 = rw.filter(r => Date.now() - (r.at || 0) < 30 * DAY).length;
  const lastAct = st => Math.max(st.lastLogin || 0,
    ...S.submissions.filter(s => s.userId === st.id).map(s => s.at || 0),
    ...Object.values(S.progress[st.id] || {}).map(v => v.at || 0),
    ...S.certs.filter(c => c.userId === st.id).map(c => c.issuedAt || 0));
  const actRows = studentsOfAnalyst.slice().sort((a, b) => lastAct(b) - lastAct(a)).slice(0, 6).map(st =>
    `<div class="res-item"><span class="step-ico s-cur">${icon('users', 13)}</span>
      <div class="wrap"><b style="font-size:13px">${esc(st.name)}</b><div class="xs faint">Dernière activité ${lastAct(st) ? timeAgo(lastAct(st)) : 'jamais'} · connexion ${st.lastLogin ? timeAgo(st.lastLogin) : '—'}</div></div></div>`).join('');
  return `
  <div class="grid mt16" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="card"><div class="card-head"><h3>Santé technique — paiements & assistants</h3></div>
      ${provRow('API Chariow', chariow)}${provRow('Money Fusion', mf)}${provRow('Flutterwave', fw)}
      <div class="res-item"><span class="step-ico s-gold">${icon('clock', 13)}</span>
        <div class="wrap"><b style="font-size:13px">Chronologie des passerelles</b><div class="xs faint">${firsts.map(f => f.n + ' (' + new Date(f.at).toLocaleDateString('fr-FR') + ')').join(' → ') || '—'}</div></div></div>
      <div class="res-item"><span class="step-ico s-cur">${icon('sparkles', 13)}</span>
        <div class="wrap"><b style="font-size:13px">Assistant virtuel actif : ${esc(AI_PROVIDERS[cur] || cur)}</b>
        <div class="xs faint">${Object.entries(S.aiUsage || {}).map(([id, v]) => (AI_PROVIDERS[id] || id) + ' : ' + (v.count || 0) + ' req' + (v.exhausted ? ' (quota atteint)' : '')).join(' · ') || 'aucun quota consommé aujourd’hui'}</div></div></div>
      ${aiSw.map(a => `<div class="res-item"><span class="step-ico s-gold">${icon('sparkles', 13)}</span>
        <div class="wrap"><b style="font-size:13px">Bascule IA : ${esc((a.payload && a.payload.from) || '?')} → ${esc((a.payload && a.payload.to) || '?')}</b><div class="xs faint">${new Date(a.at).toLocaleString('fr-FR')}</div></div></div>`).join('')}
    </div>
    <div class="card"><div class="card-head"><h3>Badges & activité des étudiants</h3></div>
      <div class="res-item"><span class="step-ico s-gold">${icon('rw_seal', 13)}</span>
        <div class="wrap"><b style="font-size:13px">${rw.length} badge(s) attribué(s) · ${rw30} sur 30 j</b><div class="xs faint">Fréquence d’attribution : qui, quel badge, quel jour</div></div></div>
      ${rw.slice(0, 5).map(r => `<div class="res-item"><span class="step-ico s-gold">${icon('award', 13)}</span>
        <div class="wrap"><b style="font-size:13px">${esc(getUser(r.userId) ? getUser(r.userId).name : r.userId)} — ${esc((typeof REWARD_DEFS !== 'undefined' && REWARD_DEFS[r.badgeId]) ? REWARD_DEFS[r.badgeId].name : r.badgeId)}</b>
        <div class="xs faint">${new Date(r.at).toLocaleString('fr-FR')} · ${esc(r.mode || '')}</div></div></div>`).join('')}
      ${actRows}
    </div>
  </div>`;
}
/* Menu utilisateur staff/admin : profil (nom + code secret modifiables), paramètres, déconnexion */
function adminUserPop(e, el) {
  e.stopPropagation();
  let m = document.getElementById('adUserPop');
  if (m) { m.remove(); return; }
  const u = getUser(S.session.userId);
  m = document.createElement('div'); m.id = 'adUserPop'; m.className = 'u-menu show';
  m.innerHTML = `
    <div class="u-head">${avatarHTML(u)}<div><b>${esc(u.name)}</b><div class="xs muted">${esc(u.email)}</div></div></div>
    <button class="u-it" onclick="location.hash='#/profil'">${icon('user',15)} Mon profil — nom & code secret</button>
    <button class="u-it" onclick="location.hash='#/parametres'">${icon('settings',15)} Paramètres</button>
    <div class="divider"></div>
    <button class="u-it" style="color:var(--danger)" onclick="logout()">${icon('logout',15)} Se déconnecter</button>`;
  document.body.appendChild(m);
  const r = el.getBoundingClientRect();
  m.style.bottom = (window.innerHeight - r.top + 8) + 'px'; m.style.left = '12px';
  setTimeout(() => document.addEventListener('click', function cl(ev) { if (!m.contains(ev.target) && !el.contains(ev.target)) { m.remove(); document.removeEventListener('click', cl); } }), 10);
}
/* ---------- Sections Analyste : chaque donnée analysée = sa propre page ---------- */
function analystProvRows() {
  const L = S.auditLog || [];
  const ev = re => L.filter(a => re.test(a.action));
  const hooks = x => x.filter(a => /webhook|pulse/.test(a.action)).length;
  const row = (name, list) => {
    const last = list.length ? Math.max(...list.map(a => a.at)) : 0;
    return `<div class="res-item"><span class="step-ico s-cur">${icon('wallet', 13)}</span>
      <div class="wrap"><b style="font-size:13px">${name}</b><div class="xs faint">${list.length} appel(s) · ${hooks(list)} webhook(s) confirmé(s)${last ? ' · dernier ' + timeAgo(last) : ' · jamais utilisé'}</div></div></div>`;
  };
  return row('API Chariow', ev(/^chariow/)) + row('Money Fusion', ev(/^moneyfusion/)) + row('Flutterwave', ev(/^flutterwave/));
}
function aSante() {
  const L = S.auditLog || [];
  const first = re => { const l = L.filter(a => re.test(a.action)); return l.length ? Math.min(...l.map(a => a.at)) : 0; };
  const firsts = [['Chariow', first(/^chariow/)], ['Money Fusion', first(/^moneyfusion/)], ['Flutterwave', first(/^flutterwave/)]].filter(x => x[1]).sort((a, b) => a[1] - b[1]);
  return `<div class="page-head"><div><h1 style="font-size:19px">Santé technique — paiements & assistants</h1><p>Utilisation réelle des passerelles : appels, webhooks, chronologie des bascules. Aucune donnée financière.</p></div></div>
  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="card"><div class="card-head"><h3>Passerelles de paiement</h3></div>${analystProvRows()}</div>
    <div class="card"><div class="card-head"><h3>Chronologie des bascules</h3></div>
      ${firsts.map(f => `<div class="res-item"><span class="step-ico s-gold">${icon('clock', 13)}</span><div class="wrap"><b style="font-size:13px">${f[0]}</b><div class="xs faint">premier appel le ${new Date(f[1]).toLocaleString('fr-FR')}</div></div></div>`).join('') || '<div class="empty small">Aucune passerelle appelée.</div>'}
      <div class="res-item"><span class="step-ico s-cur">${icon('info', 13)}</span><div class="wrap"><div class="xs faint">Le routage suit le pays de l’étudiant : pays Money Fusion → Money Fusion, sinon Chariow ; Flutterwave en renfort cartes & mobile money.</div></div></div>
    </div>
  </div>`;
}
function aAssistants() {
  const L = (S.auditLog || []).filter(a => a.action === 'ai_fallback');
  const chain = (S.aiConfig && S.aiConfig.fallbackChain && S.aiConfig.fallbackChain.length) ? S.aiConfig.fallbackChain : ['groq', 'gemini', 'openrouter', 'hf'];
  const cur = chain.find(id => !((S.aiUsage || {})[id] || {}).exhausted) || chain[0];
  const rows = chain.map(id => {
    const out = L.filter(a => a.payload && a.payload.from === id).length;
    const inn = L.filter(a => a.payload && a.payload.to === id).length;
    const u = (S.aiUsage || {})[id];
    return `<tr><td><b class="xs">${AI_PROVIDERS[id] || id}</b>${id === cur ? ' <span class="badge b-green">actif</span>' : ''}</td>
      <td class="xs">${u && u.count ? u.count + ' req aujourd’hui' : '0 req'}</td>
      <td class="xs">${out} bascule(s) quittée(s)</td><td class="xs">${inn} bascule(s) reçue(s)</td></tr>`;
  }).join('');
  const pairs = [];
  chain.forEach(a => chain.forEach(b => { if (a !== b) { const n = L.filter(x => x.payload && x.payload.from === a && x.payload.to === b).length; pairs.push([a, b, n]); } }));
  return `<div class="page-head"><div><h1 style="font-size:19px">Assistants virtuels — bascules</h1><p>Fréquence de changement entre TOUS les assistants (0 si aucune bascule). Chaque bascule réelle est journalisée avec sa date.</p></div></div>
  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="card" style="overflow-x:auto"><div class="card-head"><h3>Par assistant</h3></div>
      <table class="tbl"><thead><tr><th>Assistant</th><th>Requêtes (jour)</th><th>Départs</th><th>Arrivées</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="card" style="overflow-x:auto"><div class="card-head"><h3>Fréquence des bascules (paire par paire)</h3></div>
      <table class="tbl"><thead><tr><th>Bascule</th><th>Fréquence</th><th>Dernière fois</th></tr></thead><tbody>
      ${pairs.map(p => { const last = L.filter(x => x.payload && x.payload.from === p[0] && x.payload.to === p[1]).map(x => x.at).sort((a, b) => b - a)[0];
        return `<tr><td class="xs">${AI_PROVIDERS[p[0]] || p[0]} → ${AI_PROVIDERS[p[1]] || p[1]}</td><td><b class="xs">${p[2]}</b></td><td class="xs muted">${last ? new Date(last).toLocaleString('fr-FR') : 'jamais'}</td></tr>`; }).join('')}
      </tbody></table></div>
  </div>
  <div class="card mt16"><div class="card-head"><h3>Journal des bascules</h3></div>
    ${L.sort((a, b) => b.at - a.at).map(a => `<div class="res-item"><span class="step-ico s-gold">${icon('sparkles', 13)}</span><div class="wrap"><b style="font-size:13px">${esc((a.payload && a.payload.from) || '?')} → ${esc((a.payload && a.payload.to) || '?')}</b><div class="xs faint">${new Date(a.at).toLocaleString('fr-FR')}</div></div></div>`).join('') || '<div class="empty small">Aucune bascule enregistrée — fréquence 0.</div>'}</div>`;
}
function aBadgesAnalyst() {
  const rw = (S.rewards || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const rw30 = rw.filter(r => Date.now() - (r.at || 0) < 30 * DAY).length;
  return `<div class="page-head"><div><h1 style="font-size:19px">Badges & distinctions</h1><p>Qui a reçu quel badge, quel jour — fréquence d’attribution sur 30 jours : ${rw30}.</p></div></div>
  <div class="card" style="overflow-x:auto">
    ${rw.length ? `<table class="tbl"><thead><tr><th>Étudiant</th><th>Badge</th><th>Date & heure</th><th>Mode</th></tr></thead><tbody>
      ${rw.map(r => `<tr><td><b class="xs">${esc(getUser(r.userId) ? getUser(r.userId).name : r.userId)}</b></td><td class="xs">${esc((typeof REWARD_DEFS !== 'undefined' && REWARD_DEFS[r.badgeId]) ? REWARD_DEFS[r.badgeId].name : r.badgeId)}</td><td class="xs muted">${new Date(r.at).toLocaleString('fr-FR')}</td><td class="xs">${esc(r.mode || '')}</td></tr>`).join('')}
    </tbody></table>` : '<div class="empty small">Aucun badge attribué pour l’instant.</div>'}</div>`;
}
function aActiviteEtudiants() {
  const studs = S.users.filter(x => x.role === 'student');
  const logins = id => (S.auditLog || []).filter(a => a.action === 'login' && a.actor === id && Date.now() - a.at < 30 * DAY).length;
  const lastAct = st => Math.max(st.lastLogin || 0,
    ...S.submissions.filter(s => s.userId === st.id).map(s => s.at || 0),
    ...Object.values(S.progress[st.id] || {}).map(v => v.at || 0),
    ...S.certs.filter(c => c.userId === st.id).map(c => c.issuedAt || 0));
  return `<div class="page-head"><div><h1 style="font-size:19px">Activité des étudiants</h1><p>Fréquence de connexion (30 j) et dernière activité — staff exclu.</p></div></div>
  <div class="card" style="overflow-x:auto">
    <table class="tbl"><thead><tr><th>Étudiant</th><th>Connexions (30 j)</th><th>Dernière connexion</th><th>Dernière activité</th></tr></thead><tbody>
    ${studs.slice().sort((a, b) => lastAct(b) - lastAct(a)).map(st => `<tr><td><b class="xs">${esc(st.name)}</b></td><td><b class="xs">${logins(st.id)}</b></td><td class="xs muted">${st.lastLogin ? timeAgo(st.lastLogin) : '—'}</td><td class="xs muted">${lastAct(st) ? timeAgo(lastAct(st)) : 'jamais'}</td></tr>`).join('')}
    </tbody></table></div>`;
}
function aOverviewPilotage(u) {
  const students = S.users.filter(x => x.role === 'student');
  const pub = S.trainings.filter(t => t.published);
  const ca = S.sales.filter(s => Date.now() - s.at < 30 * DAY).reduce((a, b) => a + b.amount, 0);
  const pending = pendingCountAdmin();
  const subs = S.submissions.filter(x => x.status === 'pending');
  const declSales = S.sales.filter(s => s.status === 'declaré');
  const coachQs = S.threads.filter(th => !th.resolved && th.messages.some(m => m.from === 'student' && m.coach) && !th.messages.some(m => m.from === 'coach'));
  const aiRevs = S.threads.filter(th => !th.resolved && th.messages.some(m => m.from === 'ai') && !th.aiValidated);
  const activity = [
    ...S.sales.map(s => ({ at: s.at, icon: 'wallet', txt: `Vente confirmée — ${getUser(s.userId)?.name || s.email} · ${getTraining(s.trainingId)?.title} (${fmtMoney(s.amount)})` })),
    ...S.submissions.map(x => ({ at: x.at, icon: 'upload', txt: `Soumission reçue — ${getUser(x.userId)?.name} · ${x.file}` })),
    ...S.certs.map(c => ({ at: c.issuedAt, icon: 'award', txt: `Certificat émis — ${getUser(c.userId)?.name} · ${getTraining(c.trainingId)?.title}` })),
    ...S.threads.flatMap(th => th.messages.filter(m => m.from === 'student').map(m => ({ at: m.at, icon: 'message', txt: `Question de ${getUser(th.userId)?.name} (${m.coach ? 'adressée au coach' : 'répondue par l’IA'})` })))
  ].sort((a, b) => b.at - a.at).slice(0, 8);

  return `
  <div class="page-head"><div><h1 style="font-size:19px">${cpGreet()} ${esc(u.name.split(' ')[0])} 👋</h1><p>${u.role === 'admin' ? 'Super Administrateur' : 'Manager'} — pilotage complet de la plateforme.</p></div></div>
  <div class="grid g4">
    ${statCard('Étudiants', students.length, 'users', '<span class="xs muted">+' + students.filter(s => Date.now() - s.joined < 30 * DAY).length + ' ce mois-ci</span>')}
    ${statCard('Formations publiées', pub.length + ' / ' + S.trainings.length, 'book')}
    ${statCard('Ventes (30 j)', fmtMoney(ca), 'wallet')}
    ${statCard('Tâches en attente', pending, 'alert', pending ? '<span class="badge b-red">À traiter</span>' : '<span class="badge b-green">À jour</span>')}
  </div>

  ${pending ? `<div class="banner warn mt16">${icon('alert', 15)}<span><b>${pending} action(s) attendent votre équipe :</b> ${subs.length} soumission(s) à corriger, ${declSales.length} paiement(s) manuel(s) à vérifier, ${coachQs.length} question(s) au coach, ${aiRevs.length} réponse(s) IA à superviser.</span></div>` : ''}

  <div class="grid mt16" style="grid-template-columns:1.5fr 1fr;align-items:start">
    <div class="card">
      <div class="card-head"><h3>À traiter maintenant</h3></div>
      ${subs.map(x => `<a class="res-item" href="#/admin/evaluations">
        <span class="step-ico s-gold">${icon('upload', 14)}</span>
        <div class="wrap"><b style="font-size:13px">Corriger : ${esc(x.file)}</b><div class="xs faint">${esc(getUser(x.userId)?.name)} · ${esc(getTraining(x.trainingId)?.title)} · ${timeAgo(x.at)}</div></div>
        <span class="badge b-amber">En attente</span></a>`).join('')}
      ${S.certRequests.filter(q => q.status === 'pending').map(q => `<a class="res-item" href="#/admin/certifications">
        <span class="step-ico s-gold">${icon('award', 14)}</span>
        <div class="wrap"><b style="font-size:13px">Évaluer : ${esc(getUser(q.userId)?.name)} a demandé son certificat</b><div class="xs faint">${esc(getTraining(q.trainingId)?.title)} · 100 % terminé · ${timeAgo(q.at)}</div></div>
        <span class="badge b-gold">Certificat</span></a>`).join('')}
      ${declSales.map(s => `<a class="res-item" href="#/admin/ventes">
        <span class="step-ico s-gold">${icon('wallet', 14)}</span>
        <div class="wrap"><b style="font-size:13px">Vérifier : ${fmtMoney(s.amount)} par ${esc(s.method)}</b><div class="xs faint">${esc(getUser(s.userId)?.name)} · ${esc(getTraining(s.trainingId)?.title)} · réf ${esc(s.ref || '')} · ${timeAgo(s.at)}</div></div>
        <span class="badge b-amber">Déclaré</span></a>`).join('')}
      ${coachQs.map(th => `<a class="res-item" href="#/admin/conversations/${th.id}">
        <span class="step-ico s-gold">${icon('message', 14)}</span>
        <div class="wrap"><b style="font-size:13px">Répondre au coach : ${esc(getUser(th.userId)?.name)}</b><div class="xs faint">${esc(th.messages[th.messages.length - 1].text.slice(0, 80))}…</div></div>
        <span class="badge b-amber">48 h</span></a>`).join('')}
      ${aiRevs.map(th => `<a class="res-item" href="#/admin/conversations/${th.id}">
        <span class="step-ico s-cur">${icon('sparkles', 14)}</span>
        <div class="wrap"><b style="font-size:13px">Superviser la réponse IA — ${esc(getUser(th.userId)?.name)}</b><div class="xs faint">Valider, corriger ou compléter la réponse de ${esc(aiName())}.</div></div>
        <span class="badge b-violet">IA</span></a>`).join('')}
      ${!pending ? '<div class="empty small">Tout est traité ✨</div>' : ''}
    </div>
    <div class="card">
      <div class="card-head"><h3>Activité récente</h3></div>
      ${activity.map(a => `<div class="res-item"><span class="step-ico s-cur">${icon(a.icon, 13)}</span>
        <div class="wrap"><span class="small">${a.txt}</span><div class="xs faint mt4">${timeAgo(a.at)}</div></div></div>`).join('')}
    </div>
  </div>`;
}

/* ---------------- ÉTUDIANTS ---------------- */
/* « Terminée le » : uniquement si progression 100 % ET certificat validé (conditions cumulatives) */
function finishedDatesHTML(st) {
  const out = [];
  myTrainings(st.id).forEach(t => {
    if (trainingProgress(st.id, t).pct !== 100) return;
    const c = S.certs.find(x => x.userId === st.id && x.trainingId === t.id);
    if (c) out.push(fmtDate(c.issuedAt || c.at));
  });
  return out.length ? out.join('<br>') : '<span class="xs faint">—</span>';
}
function aStudents() {
  const students = S.users.filter(x => x.role === 'student');
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Étudiants</h1><p>Comptes, formations, progression et activité — chaque progression est strictement individuelle.</p></div>
    <div class="row" style="gap:8px">
      <div class="row" style="gap:6px" title="Un compte inactif est clôturé automatiquement après cette durée (traces et certificats conservés).">
        <input class="inp" id="ttlDays" type="number" min="30" value="${S.accountTtlDays || 365}" style="width:86px"><span class="xs muted">jours max après la fin de formation</span>
        <button class="btn btn-sm" onclick="saveTtl()">${icon('check', 13)}</button>
      </div>
      <button class="btn btn-primary btn-sm" onclick="addStudentModal()">${icon('plus', 14)} Ajouter un étudiant</button>
    </div></div>
  <div class="banner info mb16" style="padding:9px 12px">${icon('clock', 13)}<span class="xs">Un étudiant reste tant qu’il est actif. Une fois sa dernière formation terminée et sans activité pendant la durée ci-dessus, son compte est <b>clôturé automatiquement</b> : l’accès disparaît, mais les traces d’audit et ses certificats sont conservés pour prouver son passage.</span></div>
  <div class="card" style="overflow-x:auto">
    <table class="tbl">
      <thead><tr><th>Étudiant</th><th>Contact</th><th>Formations</th><th>Progression moyenne</th><th>Certificats</th><th>Inscrit le</th><th>Dernière connexion</th><th>Terminée le</th><th>Actions</th></tr></thead>
      <tbody>
      ${students.map(st => {
        const mine = myTrainings(st.id);
        const avg = mine.length ? Math.round(mine.reduce((a, t) => a + trainingProgress(st.id, t).pct, 0) / mine.length) : 0;
        const certs = S.certs.filter(c => c.userId === st.id).length;
        return `<tr class="click" onclick="go('/admin/etudiants/${st.id}')">
          <td><div class="row">${avatarHTML(st)}<div><b>${esc(st.name)}</b>${st.test ? ' <span class="badge b-grey">Compte test</span>' : ''}<div class="xs faint">${esc(st.email)}</div></div></div></td>
          <td class="xs muted">${esc(st.phone || '')}</td>
          <td>${mine.length ? mine.map(t => `<span class="badge b-grey" style="margin:1px">${t.code}</span>`).join(' ') : '<span class="xs faint">—</span>'}</td>
          <td style="min-width:150px">${pbarHTML(avg)}</td>
          <td>${certs ? `<span class="badge b-gold">${certs}</span>` : '<span class="xs faint">—</span>'}</td>
          <td class="xs muted">${fmtDate(st.joined)}</td>
          <td class="xs muted">${st.lastLogin ? new Date(st.lastLogin).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '<span class="xs faint">jamais</span>'}</td>
          <td class="xs muted">${finishedDatesHTML(st)}</td>
          <td onclick="event.stopPropagation()"><div class="row" style="gap:6px">
            ${isSuspended(st)
              ? `<button class="btn btn-sm" onclick="setUserStatus('${st.id}','active')">${icon('unlock', 13)}</button>`
              : `<button class="btn btn-sm btn-danger" onclick="setUserStatus('${st.id}','suspended')">${icon('lock', 13)}</button>`}
            <button class="btn btn-sm btn-ghost" onclick="removeStudent('${st.id}')">${icon('trash', 13)}</button>
          </div></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  </div>`;
}
function aStudentDetail(id) {
  const st = getUser(id); if (!st) return vNotFound();
  const mine = myTrainings(id);
  const subs = S.submissions.filter(x => x.userId === id);
  const ths = S.threads.filter(x => x.userId === id);
  const certs = S.certs.filter(c => c.userId === id);
  return `
  <div class="breadcrumb"><a href="#/admin/etudiants">Étudiants</a>${icon('chevR', 12)}<span>${esc(st.name)}</span></div>
  <div class="card card-pad mb16">
    <div class="row" style="flex-wrap:wrap">${avatarHTML(st, 'lg')}
      <div class="wrap"><h2 style="font-size:18px">${esc(st.name)}</h2><div class="xs muted">${esc(st.email)} · ${esc(st.phone || '')} · inscrit(e) le ${fmtDate(st.joined)}</div></div>
      <button class="btn btn-sm" onclick="toast('E-mail envoyé à l’étudiant(e) (démo)','ok','mail')">${icon('mail', 14)} Contacter</button>
    </div>
  </div>
  <div class="grid g2" style="align-items:start">
    <div class="card">
      <div class="card-head"><h3>Formations & progression</h3></div>
      ${mine.length ? mine.map(t => { const pr = trainingProgress(id, t); return `
        <div class="res-item">${coverHTML(t,';width:52px;height:38px;border-radius:7px;flex:none')}
        <div class="wrap"><b style="font-size:12.8px">${esc(t.title)}</b><div class="mt4">${pbarHTML(pr.pct, trainingCompleted(id, t) ? 'gold' : '')}</div></div>
        ${trainingCompleted(id, t) ? '<span class="badge b-gold">Terminée</span>' : ''}</div>`; }).join('') : '<div class="empty small">Aucune formation.</div>'}
    </div>
    <div class="col" style="gap:16px">
      <div class="card">
        <div class="card-head"><h3>Soumissions</h3></div>
        ${subs.length ? subs.map(x => `<div class="res-item"><span class="res-ico doc">${icon('file', 14)}</span>
          <div class="wrap"><b style="font-size:12.5px">${esc(x.file)}</b><div class="xs faint">${esc(getTraining(x.trainingId)?.title)} · ${timeAgo(x.at)}</div></div>
          <span class="badge ${x.status === 'approved' ? 'b-green' : x.status === 'pending' ? 'b-amber' : 'b-red'}">${{ pending: 'En attente', approved: 'Validée', rejected: 'Refusée', retry: 'À refaire' }[x.status]}</span></div>`).join('') : '<div class="empty small">Aucune soumission.</div>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>Conversations</h3></div>
        ${ths.length ? ths.map(th => `<a class="dd-item" href="#/admin/conversations/${th.id}">${icon('message', 14)} ${esc((th.messages[0]?.text || '').slice(0, 60))}…</a>`).join('') : '<div class="empty small">Aucune conversation.</div>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>Certificats</h3></div>
        ${certs.length ? certs.map(c => `<div class="res-item" style="cursor:pointer" onclick="showCert('${c.id}')"><span class="step-ico s-gold">${icon('award', 13)}</span>
          <div class="wrap"><b style="font-size:12.5px">${esc(getTraining(c.trainingId)?.title)}</b><div class="xs faint">${c.code}</div></div>${icon('chevR', 13, 'faint')}</div>`).join('') : '<div class="empty small">Aucun certificat.</div>'}
      </div>
    </div>
  </div>`;
}

/* ---------------- FORMATIONS ---------------- */
function aTrainings() {
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Formations</h1><p>Créez, publiez, organisez : Formation → Chapitres → Modules → Contenus.</p></div>
    <button class="btn btn-primary btn-sm" onclick="newTrainingModal()">${icon('plus', 14)} Nouvelle formation</button></div>
  <div class="card" style="overflow-x:auto">
    <table class="tbl">
      <thead><tr><th>Formation</th><th>Structure</th><th>Étudiants</th><th>Prix</th><th>Publication</th><th></th></tr></thead>
      <tbody>
      ${S.trainings.map(t => `<tr>
        <td><div class="row">${coverHTML(t,';width:46px;height:34px;border-radius:7px;flex:none')}
          <div><b>${esc(t.title)}</b><div class="xs faint">${t.code} · ${t.level}</div></div></div></td>
        <td class="xs muted">${t.chapters.length} chapitres · ${stepsOf(t).filter(s => s.kind === 'module').length} modules</td>
        <td class="xs muted">${t.students}</td>
        <td><b>${fmtMoney(t.price)}</b></td>
        <td><label class="switch"><input type="checkbox" ${t.published ? 'checked' : ''} onchange="togglePublish('${t.id}')"><i></i></label></td>
        <td><a class="btn btn-sm" href="#/admin/formations/${t.id}">${icon('edit', 13)} Éditeur</a></td>
      </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}
function togglePublish(tid) {
  const t = getTraining(tid);
  if (!t.published) {
    /* Contrôle obligatoire avant publication : checkout, abréviation, cover, vidéo principale de chaque module */
    const missing = [];
    if (!t.chariow_url) missing.push('le lien de checkout Chariow');
    if (!t.abbr) missing.push('l’abréviation (certificats)');
    if (!t.coverImg) missing.push('la cover de la formation');
    const mods = stepsOf(t).filter(s => s.kind === 'module');
    const noVideo = mods.filter(s => !s.ref.videoUrl);
    if (!mods.length) missing.push('au moins un module');
    else if (noVideo.length) missing.push(`la vidéo principale de ${noVideo.length} module(s) : « ${noVideo.map(m => m.ref.title).slice(0, 3).join(' », « ')}${noVideo.length > 3 ? '…' : ''} »`);
    if (missing.length) { toast('Publication impossible — il manque : ' + missing.join(' · '), 'err', 'alert'); return; }
  }
  t.published = !t.published; save('trainings'); render();
  toast(t.published ? `« ${t.title} » publiée ✓` : `« ${t.title} » dépubliée`, '', t.published ? 'eye' : 'lock');
}
function newTrainingModal() {
  openModal({
    title: 'Nouvelle formation',
    body: `<div class="field"><label>Titre <span class="xs" style="color:var(--red)">*</span></label><input class="inp" id="ntTitle" placeholder="Ex. Devenir un excellent orateur"></div>
      <div class="row" style="gap:10px"><div class="field wrap"><label>Abréviation <span class="xs" style="color:var(--red)">*</span></label><input class="inp" id="ntAbbr" maxlength="5" placeholder="Ex. ORA" style="text-transform:uppercase"></div>
      <div class="field wrap"><label>Prix (FCFA)</label><input class="inp" id="ntPrice" type="number" value="45000"></div></div>
      <div class="field"><label>Lien de checkout Chariow <span class="xs" style="color:var(--red)">*</span></label><input class="inp" id="ntChariow" placeholder="https://votre-compte.mychariow.co/prd_…/checkout"></div>
      <div class="field"><label>Cover (image de couverture) <span class="xs" style="color:var(--red)">*</span></label><input class="inp" type="file" id="ntCover" accept="image/*" style="padding:8px"></div>
      <div class="field"><label>Description</label><textarea class="inp" id="ntDesc"></textarea></div>
      <div class="hint">Obligatoire : titre, abréviation, checkout Chariow et cover. La vidéo principale de chaque module sera exigée avant la publication.</div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="createTraining()">Créer la formation</button>`
  });
}
function createTraining() {
  const title = document.getElementById('ntTitle').value.trim();
  if (!title) { toast('Le titre est obligatoire.', 'err'); return; }
  const abbr = document.getElementById('ntAbbr').value.trim().toUpperCase();
  if (!abbr) { toast('L’abréviation est obligatoire (elle figure sur les certificats).', 'err'); return; }
  const chariow = document.getElementById('ntChariow').value.trim();
  if (!chariow) { toast('Le lien de checkout Chariow est obligatoire.', 'err', 'wallet'); return; }
  const coverFile = document.getElementById('ntCover').files[0];
  if (!coverFile) { toast('La cover de la formation est obligatoire.', 'err', 'image'); return; }
  const price = +document.getElementById('ntPrice').value || 0;
  const desc = document.getElementById('ntDesc').value.trim() || 'Description à compléter.';
  const rd = new FileReader();
  rd.onload = e => {
    S.trainings.push({
      id: uid(), code: abbr + '-' + Math.floor(100 + Math.random() * 900), abbr, title, mono: abbr.slice(0, 2),
      desc, longDesc: desc, level: 'Débutant', hours: 8, price, published: false, hue: 268,
      students: 0, rating: null, chariow_url: chariow, coverImg: e.target.result, chapters: []
    });
    save(); closeModal(); render();
    toast('Formation créée — ajoutez chapitres, modules et leurs vidéos principales', 'ok', 'plus');
  };
  rd.readAsDataURL(coverFile);
}
function aTrainingEditor(tid) {
  const t = getTraining(tid); if (!t) return vNotFound();
  return `
  <div class="breadcrumb"><a href="#/admin/formations">Formations</a>${icon('chevR', 12)}<span>${esc(t.title)}</span></div>
  <div class="grid" style="grid-template-columns:1fr 320px;align-items:start">
    <div>
      <div class="card card-pad mb16">
        <div class="eyebrow mb8">Structure pédagogique</div>
        <p class="xs muted mb16">Formation → Chapitres → Modules → Contenus. Réorganisez librement ; les étudiants ne voient que ce qui est publié.</p>
        <div class="banner gold mb16" style="padding:10px 12px">${icon('shieldCheck', 14)}<span class="small"><b>Enrichissement silencieux :</b> vos ajouts apparaissent instantanément chez les étudiants, <b>sans notification</b> et <b>sans jamais réinitialiser leur progression</b>. Un étudiant déjà certifié reste à 100 % ; un étudiant en cours découvre le nouveau contenu en arrivant au chapitre concerné.</span></div>
        ${t.chapters.map((ch, ci) => `
        <div class="cur-chapter">
          <div class="cur-ch-head">
            <span class="step-ico s-cur">${icon('layers', 14)}</span>
            <div class="wrap"><h3>Chapitre ${ci + 1} — ${esc(ch.title)}</h3><span class="xs faint">${ch.modules.length} module(s)${ch.exercise ? ' · exercice' : ''}${ch.assessment ? ' · évaluation' : ''}</span></div>
            <button class="icon-btn" title="Renommer le chapitre" onclick="chapterModal('${t.id}','${ch.id}')">${icon('edit', 13)}</button>
            <button class="icon-btn" title="Monter" onclick="moveChapter('${t.id}',${ci},-1)" ${ci === 0 ? 'disabled' : ''}>${icon('chevD', 14, 'style="transform:rotate(180deg)"')}</button>
            <button class="icon-btn" title="Descendre" onclick="moveChapter('${t.id}',${ci},1)" ${ci === t.chapters.length - 1 ? 'disabled' : ''}>${icon('chevD', 14)}</button>
            <button class="icon-btn" onclick="delChapter('${t.id}','${ch.id}')">${icon('trash', 14)}</button>
          </div>
          ${ch.modules.map((m, mi) => `
            <div class="cur-step">
              <span class="step-ico s-cur">${icon('video', 13)}</span>
              <div class="wrap"><div class="st-title">${esc(m.title)} ${m.videoUrl ? '' : '<span class="badge b-red" style="margin-left:6px">vidéo requise</span>'}</div><div class="st-meta">${m.ratio} · ${m.duration}${m.videoUrl ? ' · vidéo principale ✓' : ''}${m.resources.length ? ` · ${m.resources.length} ressource(s)` : ''}${m.extraVideos.length ? ` · ${m.extraVideos.length} vidéo(s) complémentaire(s)` : ''}</div></div>
              <button class="icon-btn" title="Modifier (titre, vidéo principale…)" onclick="moduleModal('${t.id}','${ch.id}','${m.id}')">${icon('edit', 13)}</button>
              <button class="icon-btn" title="Enrichir (vidéos complémentaires, ressources)" onclick="enrichModal('${t.id}','${ch.id}','${m.id}')">${icon('plus', 13)}</button>
              <button class="icon-btn" onclick="moveModule('${t.id}','${ch.id}',${mi},-1)" ${mi === 0 ? 'disabled' : ''}>${icon('chevD', 14, 'style="transform:rotate(180deg)"')}</button>
              <button class="icon-btn" onclick="moveModule('${t.id}','${ch.id}',${mi},1)" ${mi === ch.modules.length - 1 ? 'disabled' : ''}>${icon('chevD', 14)}</button>
              <button class="icon-btn" onclick="delModule('${t.id}','${ch.id}','${m.id}')">${icon('trash', 14)}</button>
            </div>`).join('')}
          ${ch.exercise ? `<div class="cur-step"><span class="step-ico s-gold">${icon('clipboard', 13)}</span><div class="wrap"><div class="st-title">${esc(ch.exercise.title)}</div><div class="st-meta">Exercice · ${ch.exercise.questions.length} question(s)</div></div></div>` : ''}
          ${ch.assessment ? `<div class="cur-step"><span class="step-ico s-gold">${icon('target', 13)}</span><div class="wrap"><div class="st-title">${esc(ch.assessment.title)}</div><div class="st-meta">${ch.assessment.type === 'quiz' ? `Évaluation quiz · minimum ${ch.assessment.minScore} %` : 'Travail à soumettre · validation humaine'}</div></div></div>` : ''}
          <div style="padding:10px 16px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="moduleModal('${t.id}','${ch.id}')">${icon('plus', 13)} Module</button>
            <button class="btn btn-ghost btn-sm" onclick="exerciseModal('${t.id}','${ch.id}')">${icon('clipboard', 13)} Exercice</button>
            <button class="btn btn-ghost btn-sm" onclick="evalModal('${t.id}','${ch.id}')">${icon('target', 13)} Évaluation</button>
          </div>
        </div>`).join('')}
        <button class="btn btn-block" onclick="chapterModal('${t.id}')">${icon('plus', 14)} Ajouter un chapitre</button>
      </div>
    </div>
    <div>
      <div class="card card-pad">
        <div class="eyebrow mb8">Informations</div>
        <div class="field"><label>Titre</label><input class="inp" id="etTitle" value="${esc(t.title)}"></div>
        <div class="row" style="gap:10px"><div class="field wrap"><label>Abréviation (certificats)</label><input class="inp" id="etAbbr" value="${esc(t.abbr || '')}" maxlength="5" style="text-transform:uppercase"></div>
        <div class="field wrap"><label>Prix (FCFA)</label><input class="inp" id="etPrice" type="number" value="${t.price}"></div></div>
        <div class="field"><label>Lien de checkout Chariow</label><input class="inp" id="etChariow" value="${esc(t.chariow_url || '')}" placeholder="https://….mychariow.co/prd_…/checkout"></div>
        <div class="field"><label>Cover de la formation ${t.coverImg ? '<span class="badge b-green">✓ en place</span>' : '<span class="xs" style="color:var(--red)">obligatoire pour publier</span>'}</label>
          ${t.coverImg ? `<img src="${t.coverImg}" alt="" style="width:100%;border-radius:10px;margin-bottom:8px;max-height:120px;object-fit:cover">` : ''}
          <input class="inp" type="file" id="etCover" accept="image/*" style="padding:8px"></div>
        <div class="field"><label>Description</label><textarea class="inp" id="etDesc">${esc(t.desc)}</textarea></div>
        <div class="row between"><span class="small muted">Publication</span><label class="switch"><input type="checkbox" ${t.published ? 'checked' : ''} onchange="togglePublish('${t.id}')"><i></i></label></div>
        <button class="btn btn-primary btn-block mt16" onclick="saveTrainingInfo('${t.id}')">${icon('check', 14)} Enregistrer</button>
      </div>
      <div class="card card-pad mt16">
        <div class="eyebrow mb8">Vidéos & stockage</div>
        <p class="xs muted">Stockage : <b>Cloudflare R2</b> (API S3). Accès protégé par autorisation + URLs signées temporaires. Le lecteur respecte le ratio réel de chaque vidéo (16:9, 9:16, 4:3…).</p>
      </div>
    </div>
  </div>`;
}
function saveTrainingInfo(tid) {
  const t = getTraining(tid);
  t.title = document.getElementById('etTitle').value.trim() || t.title;
  t.abbr = document.getElementById('etAbbr').value.trim().toUpperCase() || t.abbr;
  t.chariow_url = document.getElementById('etChariow').value.trim() || t.chariow_url;
  t.price = +document.getElementById('etPrice').value || t.price;
  t.desc = document.getElementById('etDesc').value;
  const f = document.getElementById('etCover').files[0];
  if (f) { const rd = new FileReader(); rd.onload = e => { t.coverImg = e.target.result; save('trainings'); render(); toast('Cover enregistrée', 'ok', 'image'); }; rd.readAsDataURL(f); return; }
  save('trainings'); render(); toast('Formation enregistrée — mise à jour silencieuse chez les étudiants', 'ok');
}
function chapterModal(tid, cid) {
  const ch = cid ? getTraining(tid).chapters.find(c => c.id === cid) : null;
  openModal({ title: ch ? 'Renommer le chapitre' : 'Nouveau chapitre', body: `<div class="field"><label>Titre du chapitre</label><input class="inp" id="chTitle" value="${ch ? esc(ch.title) : ''}" placeholder="Ex. Les fondamentaux"></div>`, foot: `<button class="btn" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="addChapter('${tid}','${cid || ''}')">${ch ? 'Enregistrer' : 'Ajouter'}</button>` });
}
function addChapter(tid, cid) {
  const v = document.getElementById('chTitle').value.trim(); if (!v) return toast('Titre requis', 'err');
  const ch = cid ? getTraining(tid).chapters.find(c => c.id === cid) : null;
  if (ch) { ch.title = v; save('trainings'); closeModal(); render(); toast('Chapitre renommé — mise à jour silencieuse', 'ok'); return; }
  getTraining(tid).chapters.push({ id: uid(), title: v, modules: [] });
  save('trainings'); closeModal(); render(); toast('Chapitre ajouté — les étudiants le verront sans notification', 'ok');
}
function moduleModal(tid, cid, mid) {
  const t = getTraining(tid); const ch = t.chapters.find(c => c.id === cid);
  const m = mid ? ch.modules.find(x => x.id === mid) : null;
  openModal({ title: m ? 'Modifier le module' : 'Nouveau module', body: `
    <div class="field"><label>Titre du module</label><input class="inp" id="mTitle" value="${m ? esc(m.title) : ''}"></div>
    <div class="field"><label>Vidéo principale (URL YouTube / R2 / Vimeo) <span class="xs" style="color:var(--red)">*</span></label><input class="inp" id="mVideo" value="${m ? esc(m.videoUrl || '') : ''}" placeholder="https://youtu.be/… ou URL signée R2"></div>
    <div class="row" style="gap:10px"><div class="field wrap"><label>Durée</label><input class="inp" id="mDur" value="${m ? m.duration : '10:00'}"></div>
    <div class="field wrap"><label>Format vidéo</label><select class="inp" id="mRatio">${['16:9', '9:16', '4:3', '1:1'].map(r => `<option ${m && m.ratio === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div></div>
    <div class="field"><label>Texte explicatif (contenu principal)</label><textarea class="inp" id="mText">${m ? esc(m.text) : ''}</textarea></div>
    <div class="hint">La vidéo principale est obligatoire : la publication de la formation est bloquée tant qu’un module n’en a pas. Ressources et vidéos complémentaires s’ajoutent ensuite.</div>`, foot: `<button class="btn" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="addModule('${tid}','${cid}','${mid || ''}')">${m ? 'Enregistrer' : 'Ajouter'}</button>` });
}
function addModule(tid, cid, mid) {
  const v = document.getElementById('mTitle').value.trim(); if (!v) return toast('Titre requis', 'err');
  const vid = document.getElementById('mVideo').value.trim();
  if (!vid) return toast('La vidéo principale du module est obligatoire.', 'err', 'video');
  const ch = getTraining(tid).chapters.find(c => c.id === cid);
  const data = { title: v, videoUrl: vid, duration: document.getElementById('mDur').value || '10:00', ratio: document.getElementById('mRatio').value, text: document.getElementById('mText').value };
  if (mid) { const m = ch.modules.find(x => x.id === mid); Object.assign(m, data); toast('Module enregistré', 'ok'); }
  else { ch.modules.push(Object.assign({ id: uid(), resources: [], extraVideos: [] }, data)); toast('Module ajouté', 'ok'); }
  save('trainings'); closeModal(); render();
}
function moveModule(tid, cid, i, d) {
  const ch = getTraining(tid).chapters.find(c => c.id === cid);
  const j = i + d; if (j < 0 || j >= ch.modules.length) return;
  [ch.modules[i], ch.modules[j]] = [ch.modules[j], ch.modules[i]]; save('trainings'); render();
}
function moveChapter(tid, i, d) {
  const t = getTraining(tid); const j = i + d; if (j < 0 || j >= t.chapters.length) return;
  [t.chapters[i], t.chapters[j]] = [t.chapters[j], t.chapters[i]]; save('trainings'); render();
}
function delModule(tid, cid, mid) {
  confirmModal('Supprimer ce module ?', 'Le contenu du module sera retiré de la formation.', 'Supprimer', true).then(v => {
    if (!v) return; const ch = getTraining(tid).chapters.find(c => c.id === cid);
    ch.modules = ch.modules.filter(m => m.id !== mid); save('trainings'); render(); toast('Module supprimé', '', 'trash');
  });
}
function delChapter(tid, cid) {
  confirmModal('Supprimer ce chapitre ?', 'Tous ses modules seront retirés de la formation.', 'Supprimer', true).then(v => {
    if (!v) return; const t = getTraining(tid); t.chapters = t.chapters.filter(c => c.id !== cid); save('trainings'); render(); toast('Chapitre supprimé', '', 'trash');
  });
}

/* ---------------- EXERCICES ---------------- */
function aExercises() {
  const rows = [];
  S.trainings.forEach(t => t.chapters.forEach(ch => { if (ch.exercise) rows.push({ t, ch, ex: ch.exercise }); }));
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Exercices</h1><p>Les exercices font pratiquer l’étudiant : traités dès qu’ils apparaissent, mais leur note ne conditionne jamais la progression.</p></div></div>
  <div class="card" style="overflow-x:auto">
    <table class="tbl">
      <thead><tr><th>Exercice</th><th>Formation</th><th>Questions</th><th>Tentatives</th><th>Score moyen</th></tr></thead>
      <tbody>${rows.map(({ t, ex }) => {
        const all = Object.values(S.exAttempts).flatMap(a => a[ex.id] || []);
        const avg = all.length ? Math.round(all.reduce((s, a) => s + a.score / a.total * 100, 0) / all.length) : null;
        return `<tr><td><b>${esc(ex.title)}</b><div class="xs faint">Choix unique / choix multiple</div></td>
          <td class="xs muted">${esc(t.title)}</td><td class="xs muted">${ex.questions.length}</td><td>${all.length}</td>
          <td>${avg !== null ? pbarHTML(avg, avg >= 70 ? '' : 'gold') : '<span class="xs faint">—</span>'}</td></tr>`;
      }).join('')}</tbody>
    </table>
  </div>`;
}

/* ---------------- ÉVALUATIONS & SOUMISSIONS ---------------- */
function aEvaluations() {
  const pending = S.submissions.filter(x => x.status === 'pending');
  const done = S.submissions.filter(x => x.status !== 'pending').sort((a, b) => b.at - a.at);
  const quizRows = [];
  Object.entries(S.evAttempts).forEach(([uidv, map]) => Object.entries(map).forEach(([evId, tries]) => {
    const best = tries.reduce((a, b) => (b.pct > a.pct ? b : a), tries[0]);
    const t = S.trainings.find(t => stepsOf(t).some(s => s.id === evId));
    quizRows.push({ u: getUser(uidv), evId, best, t });
  }));
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Évaluations</h1><p>Bloquantes par conception : score minimum ou validation humaine. Un refus ou une nouvelle tentative est toujours accompagné d’une explication.</p></div></div>
  <h3 style="font-size:14px" class="mb8">Soumissions à corriger ${pending.length ? `<span class="badge b-red">${pending.length}</span>` : ''}</h3>
  ${pending.length ? `<div class="grid g2" style="align-items:start">${pending.map(x => {
    const st = getUser(x.userId); const t = getTraining(x.trainingId);
    return `<div class="card card-pad">
      <div class="row">${avatarHTML(st)}<div class="wrap"><b style="font-size:13.5px">${esc(st.name)}</b><div class="xs faint">${esc(t.title)} · ${timeAgo(x.at)}</div></div><span class="badge b-amber">En attente</span></div>
      <div class="res-item mt8" style="border:1px solid var(--line);border-radius:10px"><span class="res-ico doc">${icon('file', 14)}</span>
        <div class="wrap"><b style="font-size:12.8px">${esc(x.file)}</b><div class="xs faint">${x.size}</div></div>
        <button class="btn btn-ghost btn-sm" onclick="openSubFile('${x.id}')">${icon('eye', 13)} Regarder / lire</button></div>
      ${x.note ? `<div class="q-expl mt8">« ${esc(x.note)} »</div>` : ''}
      <div class="row mt16" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" onclick="decideSubmission('${x.id}','approved')">${icon('check', 13)} Valider</button>
        <button class="btn btn-sm" onclick="decideSubmission('${x.id}','retry')">${icon('refresh', 13)} Non conforme — à refaire</button>
        <button class="btn btn-sm btn-danger" onclick="decideSubmission('${x.id}','rejected')">${icon('x', 13)} Refuser</button>
      </div>
    </div>`; }).join('')}</div>` : `<div class="card mb16">${emptyState('checkCircle', 'Aucune soumission en attente', '')}</div>`}

  <h3 style="font-size:14px;margin-top:26px" class="mb8">Résultats des évaluations quiz</h3>
  <div class="card" style="overflow-x:auto">
    ${quizRows.length ? `<table class="tbl"><thead><tr><th>Étudiant</th><th>Évaluation</th><th>Meilleur score</th><th>Statut</th></tr></thead><tbody>
      ${quizRows.map(r => `<tr><td><div class="row">${avatarHTML(r.u, 'sm')}<b>${esc(r.u.name)}</b></div></td>
        <td class="xs muted">${esc(r.t?.title || '')}</td><td style="min-width:140px">${pbarHTML(r.best.pct, r.best.passed ? 'gold' : '')}</td>
        <td>${r.best.passed ? '<span class="badge b-green">Réussie</span>' : '<span class="badge b-red">Non réussie — contenu verrouillé</span>'}</td></tr>`).join('')}
    </tbody></table>` : emptyState('target', 'Aucune tentative pour le moment', '')}
  </div>

  <h3 style="font-size:14px;margin-top:26px" class="mb8">Historique des soumissions</h3>
  <div class="card" style="overflow-x:auto">
    ${done.length ? `<table class="tbl"><thead><tr><th>Fichier</th><th>Étudiant</th><th>Décision</th><th>Retour du coach</th></tr></thead><tbody>
      ${done.map(x => `<tr><td><b>${esc(x.file)}</b><div class="xs faint">${timeAgo(x.at)}</div></td><td class="xs muted">${esc(getUser(x.userId)?.name)}</td>
        <td><span class="badge ${x.status === 'approved' ? 'b-green' : 'b-red'}">${{ approved: 'Validée', rejected: 'Refusée', retry: 'Nouvelle tentative' }[x.status]}</span></td>
        <td class="xs muted">${esc(x.feedback || '—')}</td></tr>`).join('')}
    </tbody></table>` : emptyState('upload', 'Aucune soumission traitée', '')}
  </div>`;
}
function openSubFile(subId) {
  const x = S.submissions.find(s => s.id === subId); if (!x) return;
  const f = S.files.find(f => f.refType === 'submission' && f.refId === subId);
  const blob = f ? S.fileBlobs[f.key] : null;
  if (!blob) return toast('Fichier indisponible — soumettez un vrai fichier depuis le compte étudiant pour le visionner ici.', 'err', 'alert');
  let media;
  if (f.kind === 'video') media = `<video controls src="${blob}" style="width:100%;border-radius:10px;background:#000"></video>`;
  else if (f.kind === 'audio') media = `<div style="padding:20px 8px">${icon('play', 26)}<div class="mt8"><audio controls src="${blob}" style="width:100%"></audio></div></div>`;
  else if (f.kind === 'image') media = `<img src="${blob}" alt="" style="max-width:100%;border-radius:10px;display:block;margin:0 auto">`;
  else media = (f.mime === 'application/pdf' || /\.pdf$/i.test(x.file || '')) ? `<iframe src="${blob}" style="width:100%;height:52vh;border:1px solid var(--line);border-radius:10px"></iframe>` : `<div class="q-expl">Document « ${esc(x.file)} » — <a href="${blob}" download="${esc(x.file)}">télécharger pour le consulter</a></div>`;
  openModal({ title: `Corriger : ${esc(x.file)}`, body: `${media}
    <div class="xs faint mt8">${icon('shield', 12)} Fichier supprimé automatiquement dès votre décision.</div>`,
    foot: `<button class="btn" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="closeModal();decideSubmission('${x.id}','retry')">${icon('refresh', 13)} Non conforme</button>
      <button class="btn btn-primary" onclick="closeModal();decideSubmission('${x.id}','approved')">${icon('check', 13)} Valider</button>` });
}
function decideSubmission(subId, status) {
  const needsText = status !== 'approved';
  openModal({
    title: status === 'approved' ? 'Valider la soumission' : status === 'rejected' ? 'Refuser la soumission' : 'Déclarer non conforme — nouvelle tentative',
    body: `<div class="field"><label>${status === 'approved' ? 'Commentaire pour l’étudiant (facultatif)' : 'Explication (obligatoire)'}</label>
      <textarea class="inp" id="decFb" placeholder="${status === 'approved' ? 'Points forts, axes d’amélioration…' : 'Dites clairement ce qui n’est pas conforme et ce que l’étudiant doit corriger…'}"></textarea>
      ${needsText ? '<div class="hint">Un refus ou une nouvelle tentative doit toujours être expliqué.</div>' : ''}</div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button>
      <button class="btn ${status === 'approved' ? 'btn-primary' : 'btn-danger'}" onclick="applyDecision('${subId}','${status}')">Confirmer</button>`
  });
}
function applyDecision(subId, status) {
  const fb = document.getElementById('decFb').value.trim();
  if (status !== 'approved' && !fb) return toast('Une explication est obligatoire.', 'err', 'alert');
  const x = S.submissions.find(s => s.id === subId); if (!x) return;
  x.status = status; x.feedback = fb || 'Travail validé, félicitations !'; x.decidedAt = Date.now();
  const t = getTraining(x.trainingId);
  if (status === 'approved') {
    notify(x.userId, 'eval', 'Évaluation validée ✓', `Votre travail « ${x.file} » a été accepté. ${t ? 'Contenu suivant débloqué.' : ''}`);
    maybeIssueCert(x.userId, x.trainingId);
    toast('Soumission validée — étudiant notifié', 'ok');
  } else if (status === 'rejected') { notify(x.userId, 'eval', 'Évaluation refusée', fb); toast('Soumission refusée — explication envoyée', 'err'); }
  else { notify(x.userId, 'eval', 'Nouvelle tentative demandée', fb); toast('Nouvelle tentative demandée — explication envoyée', 'gold'); }
  /* §3 : quelle que soit la décision, le fichier lourd est supprimé ; seul le résultat pédagogique léger est conservé */
  let nDel = 0;
  S.files.filter(f => f.refType === 'submission' && f.refId === x.id).forEach(f => { if (lcDeleteFile(f.id, 'décision : ' + status)) nDel++; });
  x.fileDeleted = true; x.fileDeletedAt = Date.now();
  if (nDel) toast(`Fichier de l’étudiant supprimé (${nDel}) — résultat pédagogique conservé`, '', 'trash');
  save(); closeModal(); render();
}

/* ---------------- CONVERSATIONS (supervision IA + coach) ---------------- */
function aConversations() {
  const ths = [...S.threads].sort((a, b) => b.messages[b.messages.length - 1]?.at - a.messages[a.messages.length - 1]?.at);
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Conversations</h1><p>Chaque échange IA est supervisable : validez, corrigez, complétez ou répondez directement. L’IA est un premier niveau, jamais un mur.</p></div></div>
  ${ths.length ? `<div class="col" style="gap:10px">${ths.map(th => {
    const u = getUser(th.userId); const f = findModule(th.trainingId, th.moduleId);
    const last = th.messages[th.messages.length - 1];
    const needCoach = !th.resolved && th.messages.some(m => m.from === 'student' && m.coach) && !th.messages.some(m => m.from === 'coach');
    const needAi = !th.resolved && th.messages.some(m => m.from === 'ai') && !th.aiValidated;
    return `<a class="card" style="padding:14px 16px;display:flex;gap:12px;align-items:center" href="#/admin/conversations/${th.id}">
      ${avatarHTML(u)}
      <div class="wrap"><div class="row" style="gap:8px"><b style="font-size:13.5px">${esc(u.name)}</b>
        ${needCoach ? '<span class="badge b-amber">Réponse coach attendue</span>' : ''}
        ${needAi ? '<span class="badge b-violet">Réponse IA à superviser</span>' : ''}
        ${th.resolved ? '<span class="badge b-green">Résolue</span>' : ''}</div>
        <div class="xs muted mt4">${f ? esc(f.t.title) + ' · ' + esc(f.m.title) : ''}</div>
        <div class="small mt4" style="color:var(--muted)">« ${esc((last?.text || '').slice(0, 110))}… » · ${timeAgo(last?.at || Date.now())}</div></div>
      ${icon('chevR', 15, 'faint')}
    </a>`; }).join('')}</div>` : `<div class="card">${emptyState('message', 'Aucune conversation', '')}</div>`}
  ${S.supportThreads.length ? `
  <h3 style="font-size:14px;margin-top:22px" class="mb8">Discussions support (temps réel)</h3>
  <div class="col" style="gap:10px">${S.supportThreads.map(th => {
    const st = getUser(th.userId); const sf = getUser(th.staffId);
    return `<div class="card card-pad">
      <div class="row">${st ? avatarHTML(st) : ''}<div class="wrap"><b style="font-size:13px">${esc(st?.name || 'Étudiant supprimé')}</b><div class="xs faint">discussion maintenue avec ${esc(sf?.name || '—')}</div></div></div>
      <div class="col mt8" style="gap:6px;max-height:200px;overflow:auto">${th.messages.slice(-8).map(m => `<div class="small" style="${m.from === 'student' ? 'color:var(--muted)' : ''}"><b>${m.from === 'student' ? 'Étudiant' : 'Support'} :</b> ${esc(m.text)}</div>`).join('') || '<div class="xs faint">Aucun message.</div>'}</div>
      <div class="chat-input mt8"><input class="inp" id="srep-${th.id}" placeholder="Répondre en tant que support…"><button class="btn btn-primary btn-sm" onclick="staffSupportReply('${th.id}',document.getElementById('srep-${th.id}').value)">${icon('send', 13)}</button></div>
    </div>`; }).join('')}</div>` : ''}`;
}
function aConversationDetail(thId) {
  const th = S.threads.find(x => x.id === thId); if (!th) return vNotFound();
  const u = getUser(th.userId); const f = findModule(th.trainingId, th.moduleId);
  const hasAi = th.messages.some(m => m.from === 'ai');
  return `
  <div class="breadcrumb"><a href="#/admin/conversations">Conversations</a>${icon('chevR', 12)}<span>${esc(u.name)}</span></div>
  <div class="grid" style="grid-template-columns:minmax(0,1fr) 300px;align-items:start">
    <div class="card" style="overflow:hidden">
      <div class="card-head"><div class="row">${avatarHTML(u)}<div><b style="font-size:13.5px">${esc(u.name)}</b><div class="xs faint">${f ? esc(f.t.title) + ' · ' + esc(f.m.title) : ''}</div></div></div>
        ${th.resolved ? '<span class="badge b-green">Résolue</span>' : `<button class="btn btn-sm" onclick="resolveThread('${th.id}')">${icon('check', 13)} Clôturer</button>`}
      </div>
      <div class="chat-msgs" style="height:420px">${th.messages.map(m => msgHTML(m)).join('')}</div>
      <div class="chat-foot">
        <div class="chat-input"><input class="inp" id="coachReply" placeholder="Répondre en tant que coach…" onkeydown="if(event.key==='Enter')coachSend('${th.id}')">
          <button class="btn btn-primary" onclick="coachSend('${th.id}')">${icon('send', 15)}</button></div>
      </div>
    </div>
    <div class="col" style="gap:16px">
      <div class="card card-pad">
        <div class="eyebrow mb8">Supervision IA</div>
        ${hasAi && !th.aiValidated ? `
          <p class="xs muted mb8">La réponse de ${esc(aiName())} n’a pas encore été revue par un humain.</p>
          <button class="btn btn-primary btn-block btn-sm" onclick="validateAI('${th.id}')">${icon('shieldCheck', 14)} Valider la réponse IA</button>
          <button class="btn btn-block btn-sm mt8" onclick="coachCorrect('${th.id}')">${icon('edit', 14)} Corriger / compléter</button>`
          : hasAi ? `<div class="banner ok" style="padding:10px 12px">${icon('checkCircle', 14)}<span class="small">Réponse IA validée par l’équipe.</span></div>`
          : '<p class="xs muted">Aucune réponse IA dans cette conversation.</p>'}
      </div>
      <div class="card card-pad">
        <div class="eyebrow mb8">Règles d’accompagnement</div>
        <ul class="xs muted" style="margin-left:16px;display:flex;flex-direction:column;gap:6px">
          <li>IA immédiatement, humain lorsque nécessaire.</li>
          <li>Le coach voit la question, la réponse IA et l’historique.</li>
          <li>Le coach peut valider, corriger ou se substituer à l’IA.</li>
        </ul>
      </div>
    </div>
  </div>`;
}
function validateAI(thId) {
  const th = S.threads.find(x => x.id === thId); th.aiValidated = true;
  th.messages.push({ id: uid(), from: 'sys', text: `Réponse IA validée par ${esc(getUser(S.session.userId).name)}`, at: Date.now() });
  notify(th.userId, 'coach', 'Votre coach a validé la réponse', 'La réponse de l’assistant a été vérifiée par un coach Davar.');
  save(); render(); toast('Réponse IA validée ✓', 'ok', 'shieldCheck');
}
function coachCorrect(thId) {
  openModal({ title: 'Corriger / compléter la réponse IA', body: `<div class="field"><label>Précision apportée à l’étudiant</label><textarea class="inp" id="corrTxt" placeholder="Complétez ou corrigez la réponse de l’assistant…"></textarea></div>`, foot: `<button class="btn" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="applyCorrection('${thId}')">Envoyer</button>` });
}
function applyCorrection(thId) {
  const v = document.getElementById('corrTxt').value.trim(); if (!v) return toast('Écrivez votre précision.', 'err');
  const th = S.threads.find(x => x.id === thId);
  th.messages.push({ id: uid(), from: 'coach', text: v, at: Date.now() });
  th.messages.push({ id: uid(), from: 'sys', text: 'Précision apportée par le coach (supervision IA)', at: Date.now() });
  th.aiValidated = true;
  notify(th.userId, 'coach', 'Votre coach a complété la réponse', 'Une précision humaine a été ajoutée à la conversation.');
  save(); closeModal(); render(); toast('Précision envoyée', 'ok');
}
function coachSend(thId) {
  const v = document.getElementById('coachReply').value.trim(); if (!v) return;
  const th = S.threads.find(x => x.id === thId);
  th.messages.push({ id: uid(), from: 'coach', text: v, at: Date.now() });
  notify(th.userId, 'coach', 'Votre coach a répondu', 'Consultez sa réponse dans votre conversation.');
  save(); render(); toast('Réponse coach envoyée', 'ok', 'message');
}
function resolveThread(thId) { const th = S.threads.find(x => x.id === thId); th.resolved = true; save(); render(); toast('Conversation clôturée', 'ok'); }

/* ---------------- ASSISTANT IA ---------------- */
/* ---------- Moteur de bascule automatique (quotas journaliers) ---------- */
const AI_PROVIDERS = { groq: 'Groq', gemini: 'Google Gemini', openrouter: 'OpenRouter', hf: 'Hugging Face', custom: 'API personnalisée' };
function aiToday() { return new Date().toISOString().slice(0, 10); }
function aiQuota(id) {
  S.aiUsage = S.aiUsage || {};
  const q = S.aiUsage[id];
  if (!q || q.day !== aiToday()) return { count: 0, exhausted: false };   /* nouveau jour : quota réinitialisé */
  return q;
}
function aiActiveProvider() {
  const chain = (S.aiConfig.fallbackChain && S.aiConfig.fallbackChain.length) ? S.aiConfig.fallbackChain : ['groq', 'gemini', 'openrouter', 'hf'];
  for (const id of chain) if (!aiQuota(id).exhausted) return id;
  return chain[0];
}
function aiSetPrimary(id) {
  const chain = ((S.aiConfig.fallbackChain || []).length ? S.aiConfig.fallbackChain.slice() : ['groq', 'gemini', 'openrouter', 'hf']).filter(x => x !== id);
  chain.unshift(id);
  S.aiConfig.fallbackChain = chain; S.aiConfig.provider = aiActiveProvider();
  save(); render();
  toast('Tête de chaîne : ' + (AI_PROVIDERS[id] || id) + ' — les autres le remplacent automatiquement si son quota journalier est atteint.', 'ok', 'sparkles');
}
function aiMarkExhausted(id) {
  S.aiUsage = S.aiUsage || {};
  S.aiUsage[id] = { day: aiToday(), count: aiQuota(id).count || 0, exhausted: true };
  recordAudit('ai_fallback', { from: id, to: aiActiveProvider() });
  S.aiConfig.provider = aiActiveProvider();
  save(); render();
  toast('Quota de ' + (AI_PROVIDERS[id] || id) + ' épuisé → relais par ' + (AI_PROVIDERS[S.aiConfig.provider] || S.aiConfig.provider) + '. Demain, ' + (AI_PROVIDERS[id] || id) + ' reprend la main.', '', 'zap');
}
function aiSaveTranscription(v) { S.aiConfig.transcription = v; save(); render(); toast('Moteur de transcription enregistré ✓', 'ok', 'check'); }
function aiSavePhoto(inp) {
  const f = inp.files && inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { S.aiConfig.photo = String(r.result); save(); render(); toast('Photo de l’assistant mise à jour ✓', 'ok', 'camera'); };
  r.readAsDataURL(f);
}
function aAI() {
  const ai = S.aiConfig;
  /* 0 FCFA : fournisseurs avec offres gratuites capables de 500–1000 étudiants/an.
     Ils forment une chaîne : mêmes données, mêmes consignes, ~99 % mêmes réponses.
     Quota journalier atteint → le suivant prend le relais ; le lendemain, le 1er revient. */
  const providers = [
    ['groq', 'Groq', 'Ultra-rapide · gratuit'],
    ['gemini', 'Google Gemini', 'Free tier généreux · gratuit'],
    ['openrouter', 'OpenRouter', 'Modèles « :free » · gratuit'],
    ['hf', 'Hugging Face', 'Inference API · gratuit'],
    ['custom', 'Personnalisée (API)', 'Votre propre moteur']
  ];
  const chain = (ai.fallbackChain && ai.fallbackChain.length ? ai.fallbackChain : ['groq', 'gemini', 'openrouter', 'hf']);
  const active = aiActiveProvider();
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Assistant virtuel</h1><p>Couche d’abstraction fournisseur : changez de moteur sans toucher au Campus. Le nom affiché est configurable.</p></div></div>
  <div class="grid" style="grid-template-columns:1.4fr 1fr;align-items:start">
    <div class="card card-pad">
      <div class="row between mb16"><div class="eyebrow">Connexion</div><span class="badge ${ai.status === 'connected' ? 'b-green' : 'b-red'}"><span class="dot ${ai.status === 'connected' ? 'dot-green' : 'dot-red'}"></span> ${ai.status === 'connected' ? 'Connecté' : 'Déconnecté'}</span></div>
      <div class="banner info mb8">${icon('zap', 13)}<span class="small">Fournisseur <b>actif</b> : <b>${AI_PROVIDERS[active] || active}</b> — choisi automatiquement dans la chaîne ci-dessous selon les quotas journaliers. Cliquer sur un fournisseur le place en tête de chaîne.</span></div>
      <div class="grid g2">
        ${chain.map((id, i) => { const pr = providers.find(x => x[0] === id) || [id, AI_PROVIDERS[id] || id, '']; const q = aiQuota(id);
          return `<div class="pay-opt ${active === id ? 'sel' : ''}" style="margin:0" onclick="aiSetPrimary('${id}')">
          <span class="pay-logo" style="background:${id === 'groq' ? '#F55036' : id === 'gemini' ? '#4385F3' : id === 'openrouter' ? '#6566F1' : id === 'hf' ? '#FFD21E' : '#333'};${id === 'hf' ? 'color:#191622' : ''}">${pr[1][0]}</span>
          <span class="wrap"><b style="font-size:13px">${i + 1}. ${pr[1]}</b><div class="xs muted">${pr[2]}</div>
            <div class="xs mt4">${q.exhausted ? '<span class="badge b-red">quota du jour atteint — relayé</span>' : (active === id ? '<span class="badge b-green">actif maintenant</span>' : '<span class="badge b-grey">en secours</span>')}</div></span>
          ${active === id ? icon('checkCircle', 17) : ''}
        </div>`; }).join('')}
      </div>
      <div class="row mt8" style="gap:8px"><button class="btn btn-sm" onclick="aiMarkExhausted('${active}')">${icon('zap', 13)} Simuler : quota de ${AI_PROVIDERS[active] || active} atteint</button>
        <span class="xs faint">Pour vérifier la bascule automatique. Demain, son quota repart de zéro et il reprend la main.</span></div>
      <div class="field mt16"><label>Clé API</label><input class="inp" type="password" value="sk-davar-••••••••••••••••" onchange="toast('Clé mise à jour','ok','key')">
        <div class="hint">Chiffrée côté serveur. La couche d’intégration traduit les appels quel que soit le fournisseur.</div></div>
      <div class="row" style="gap:10px"><button class="btn btn-sm" onclick="toast('Réponse de test reçue en 0,8 s ✓','ok','zap')">${icon('zap', 13)} Tester la connexion</button></div>
      <div class="divider"></div>
      <div class="eyebrow mb8">Transcription fidèle des avis audio (open source · gratuit · sans serveur à héberger)</div>
      <div class="col" style="gap:8px">
        ${[['groq-whisper', 'Whisper large-v3 via Groq (recommandé)', 'Modèle open source, API hébergée gratuite : ≈ 2 000 transcriptions/jour, 99 langues, très pointu. Aucun VPS.'],
           ['browser-whisper', 'Whisper dans le navigateur (transformers.js)', '100 % open source, s’exécute sur l’appareil de l’étudiant : zéro quota, zéro serveur, zéro coût. Un peu plus lent.']].map(([v, l, d]) => `
        <label class="row small" style="gap:9px;cursor:pointer"><input type="radio" name="transcr" ${ai.transcription === v ? 'checked' : ''} onchange="aiSaveTranscription('${v}')">
          <span><b>${l}</b><div class="xs muted">${d}</div></span></label>`).join('')}
      </div>
      <div class="divider"></div>
      <div class="eyebrow mb8">Photo de l’assistant</div>
      <div class="row" style="gap:12px">
        <span class="avatar" style="width:44px;height:44px;border-radius:50%;overflow:hidden;background:hsl(${ai.hue} 60% 45%);display:flex;align-items:center;justify-content:center;color:#fff;flex:none">${ai.photo ? `<img src="${ai.photo}" style="width:100%;height:100%;object-fit:cover" alt="">` : icon('sparkles', 18)}</span>
        <div class="wrap"><input type="file" accept="image/*" class="inp" onchange="aiSavePhoto(this)">
          <div class="hint">Une vraie photo, comme les profils des membres humains. Elle s’affiche partout où l’assistant apparaît.</div></div>
      </div>
      <div class="divider"></div>
      <div class="eyebrow mb8">Identité affichée dans le Campus</div>
      <div class="field"><label>Nom de l’assistant</label>
        <input class="inp" id="aiName" value="${esc(ai.customName)}" placeholder="${esc(ai.defaultName)}">
        <div class="hint">Par défaut, le nom fourni par le système IA est utilisé. Si vous définissez un nom personnalisé, il devient le nom affiché partout dans le Campus.</div></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label>Langue de réponse</label>
          <select class="inp" id="aiLang">
            ${[['fr', 'Français'], ['en', 'English'], ['es', 'Español'], ['pt', 'Português']].map(([v, l]) => `<option value="${v}" ${(ai.lang || 'fr') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <div class="hint">L’assistant reçoit aussi le nom de chaque étudiant.</div></div>
      </div>
      <div class="field"><label>Température (créativité) — ${ai.temperature}</label><input type="range" min="0" max="1" step="0.1" value="${ai.temperature}" style="width:100%;accent-color:var(--violet)" onchange="S.aiConfig.temperature=+this.value;save();this.previousElementSibling&&(this.closest('.field').querySelector('label').textContent='Température (créativité) — '+this.value)"></div>
      <button class="btn btn-primary" onclick="saveAI()">${icon('check', 14)} Enregistrer la configuration</button>
    </div>
    <div class="col" style="gap:16px">
      <div class="card card-pad">
        <div class="eyebrow mb8">Base de connaissances</div>
        <p class="xs muted mb8">Associez l’assistant aux contenus de chaque formation. Les connaissances restent <b>séparées par formation</b> — aucun mélange entre elles.</p>
        ${S.trainings.map(t => `<div class="row between" style="padding:8px 0;border-bottom:1px solid #F3F1F8">
          <span class="small"><b>${esc(t.title)}</b><div class="xs faint">${t.code}</div></span>
          <label class="switch"><input type="checkbox" ${ai.kb[t.id] ? 'checked' : ''} onchange="S.aiConfig.kb['${t.id}']=this.checked;save();toast(this.checked?'Formation associée à l’assistant':'Formation dissociée','','sparkles')"><i></i></label></div>`).join('')}
      </div>
      <div class="card card-pad" style="background:var(--grad-dark);border:none;color:#fff">
        <div class="eyebrow" style="color:var(--gold2)">Supervision humaine</div>
        <p class="small mt8" style="color:#D9D3E8">L’assistant répond en premier niveau. Les coachs voient toutes les conversations et peuvent valider, corriger ou répondre à la place de l’IA — sans jamais être bloqués par elle.</p>
      </div>
    </div>
  </div>`;
}
function saveSupport() {
  S.settings.support.whatsapp = document.getElementById('supWa').value.trim();
  S.settings.support.phone = document.getElementById('supPh').value.trim();
  S.settings.support.email = document.getElementById('supEm').value.trim();
  save(); render(); toast('Coordonnées du support enregistrées', 'ok');
}
function editSocialModal(id) {
  const s = S.settings.socials.find(x => x.id === id); if (!s) return;
  openModal({
    title: 'Modifier — ' + esc(s.platform),
    body: `<div class="field"><label>Plateforme</label><input class="inp" id="socEdPlat" value="${esc(s.platform)}"></div>
           <div class="field"><label>Lien de la page</label><input class="inp" id="socEdLink" value="${esc(s.link)}" placeholder="https://…"></div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button>
           <button class="btn btn-primary" onclick="saveSocialEdit('${id}')">${icon('check', 13)} Enregistrer</button>`
  });
}
function saveSocialEdit(id) {
  const s = S.settings.socials.find(x => x.id === id); if (!s) return;
  const pl = document.getElementById('socEdPlat').value.trim();
  const lk = document.getElementById('socEdLink').value.trim();
  if (!lk) return toast('Indiquez le lien du profil.', 'err');
  s.platform = pl || s.platform; s.link = lk;
  closeModal(); save(); render();
  toast('Lien mis à jour ✓', 'ok', 'globe');
}
function addSocial() {
  const p = document.getElementById('socPlat').value; const l = document.getElementById('socLink').value.trim();
  if (!l) return toast('Indiquez le lien du profil.', 'err');
  S.settings.socials.push({ id: uid(), platform: p, link: l });
  save(); render(); toast(`${p} ajouté au ticker`, 'ok', 'globe');
}
function saveAnnounce() {
  S.settings.announcement = { text: document.getElementById('annText').value.trim(), audience: document.getElementById('annAud').value };
  save('ticker'); render(); toast(S.settings.announcement.text ? 'Annonce publiée — elle défile sur les dashboards ciblés' : 'Annonce effacée', 'ok', 'bell');
}
function saveMotivations() {
  const raw = document.getElementById('motTxt').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!raw.length) return toast('Collez au moins une motivation.', 'err');
  const list = S.settings.motivations.slice();
  const used = new Set(list.map((_, i) => i + 1));
  let nextAuto = list.length + 1, added = 0;
  const conflicts = [];
  raw.forEach(line => {
    const m = line.match(/^(\d+)\s*[.)\-–:]\s*(.+)$/);
    if (m) {
      const n = parseInt(m[1], 10), txt = m[2].trim();
      if (!txt) return;
      if (used.has(n)) { conflicts.push(n); return; }
      used.add(n);
      list[n - 1] = txt;
      added++;
    } else {
      while (used.has(nextAuto)) nextAuto++;
      used.add(nextAuto);
      list[nextAuto - 1] = line;
      nextAuto++; added++;
    }
  });
  if (conflicts.length) return toast(`Numéros déjà utilisés : ${conflicts.join(', ')}. Choisissez d’autres numéros.`, 'err', 'alert');
  S.settings.motivations = list.map(x => x || '');
  while (S.settings.motivations.length && !S.settings.motivations[S.settings.motivations.length - 1]) S.settings.motivations.pop();
  save(); render(); toast(`${added} motivation(s) ajoutée(s) — stock numéroté de 1 à ${S.settings.motivations.length}`, 'ok', 'quote');
}
function delMotivation(i) {
  confirmModal(`Retirer la motivation n° ${i + 1} ?`, 'Les numéros suivants sont décalés pour rester continus (n°1, n°2, n°3…).', 'Retirer', true).then(v => {
    if (!v) return;
    S.settings.motivations.splice(i, 1);
    if (S.settings.motivationsIndex > i) S.settings.motivationsIndex--;
    S.settings.motivationsIndex = Math.max(0, Math.min(S.settings.motivationsIndex, S.settings.motivations.length - 1));
    save(); render(); toast('Motivation retirée — numérotation recalée', '', 'trash');
  });
}
function saveMotivationsReplace() {
  const raw = document.getElementById('motTxt').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!raw.length) return toast('Collez au moins une motivation.', 'err');
  const list = [];
  raw.forEach(line => { const m = line.match(/^(\d+)\s*[.)\-–:]\s*(.+)$/); list.push(m ? m[2].trim() : line); });
  if (S.settings.motivationsIndex >= S.settings.motivations.length || !S.settings.motivations.length) {
    S.settings.motivations = list; S.settings.motivationsIndex = 0; delete S.settings.motivationsNext;
    save(); render(); toast(`Nouvelle liste enregistrée et active : ${list.length} motivation(s) ✓`, 'ok', 'quote');
  } else {
    S.settings.motivationsNext = list;
    save(); render();
    toast(`Nouvelle liste enregistrée (${list.length}) — elle remplacera l’actuelle dès que ses envois seront terminés.`, 'ok', 'clock');
  }
}
function sendMotivationNow() {
  /* Rotation : la liste actuelle va jusqu'au bout, puis la liste enregistrée la remplace définitivement */
  if (S.settings.motivationsIndex >= S.settings.motivations.length && S.settings.motivationsNext && S.settings.motivationsNext.length) {
    S.settings.motivations = S.settings.motivationsNext; delete S.settings.motivationsNext; S.settings.motivationsIndex = 0;
    toast('Liste précédente terminée — la nouvelle liste enregistrée prend le relais ✓', 'ok', 'refresh');
  }
  const list = S.settings.motivations;
  if (!list.length) return toast('Aucune motivation en stock.', 'err');
  if (S.settings.motivationsIndex >= list.length) return toast('Tout le stock numéroté a déjà été envoyé. Enregistrez une nouvelle liste.', 'err', 'alert');
  const n = S.settings.motivationsIndex + 1;
  const txt = list[S.settings.motivationsIndex];
  S.settings.motivationsIndex++;
  S.users.filter(x => x.role === 'student').forEach(st => notify(st.id, 'info', 'Votre motivation de la semaine 💪', txt));
  const left = list.length - S.settings.motivationsIndex;
  if (left <= 10) notify('u-yann', 'info', 'Stock de motivations presque épuisé', `Il reste ${Math.max(0, left)} motivation(s) : pensez à en ajouter.`);
  save(); render(); toast(`Motivation n° ${n} envoyée en push à tous les étudiants`, 'ok', 'quote');
}
function saveAppScript() {
  S.settings.appscript.mailUrl = document.getElementById('asMail').value.trim();
  S.settings.appscript.certUrl = document.getElementById('asCert').value.trim();
  S.settings.chariow.coachingBooking = document.getElementById('asBooking').value.trim();
  S.settings.chariow.pulseSecret = document.getElementById('asPulse').value.trim();
  S.settings.chariow.apiKey = (document.getElementById('asChariowKey') || { value: '' }).value.trim();
  const mf = S.settings.moneyfusion = S.settings.moneyfusion || { merchantKey: '', privateKey: '' };
  mf.merchantKey = (document.getElementById('asMfKey') || { value: '' }).value.trim();
  mf.privateKey = (document.getElementById('asMfSecret') || { value: '' }).value.trim();
  mf.webhookSecret = (document.getElementById('asMfWebhook') || { value: '' }).value.trim();
  const fw = S.settings.flutterwave = S.settings.flutterwave || { enabled: false, mode: 'fallback', apiKey: '', webhookSecret: '' };
  fw.enabled = document.getElementById('asFwEnabled').checked;
  fw.mode = document.getElementById('asFwMode').value;
  fw.apiKey = document.getElementById('asFwKey').value.trim();
  fw.webhookSecret = document.getElementById('asFwSecret').value.trim();
  save(); render(); toast('Intégrations enregistrées — actives immédiatement', 'ok', 'zap');
}
function testLink(url) {
  if (!url) return toast('Aucune URL à tester.', 'err');
  toast('Test de connexion en cours…', '', 'globe');
  fetch(url, { method: 'GET', redirect: 'follow' })
    .then(r => toast(r.ok ? 'Connexion établie ✓ (HTTP ' + r.status + ')' : 'Réponse inattendue : HTTP ' + r.status, r.ok ? 'ok' : 'err', r.ok ? 'shieldCheck' : 'alert'))
    .catch(() => toast('Impossible de joindre cette URL depuis le navigateur (vérifiez le déploiement « Tous »).', 'err', 'alert'));
}
function saveAI() {
  S.aiConfig.customName = document.getElementById('aiName').value.trim();
  S.aiConfig.avatar = document.getElementById('aiAvatar').value.trim();
  S.aiConfig.lang = document.getElementById('aiLang').value;
  save(); render();
  toast(`Configuration IA enregistrée — l’assistant s’affiche désormais sous le nom « ${aiName()} »`, 'ok', 'sparkles');
}

/* ---------------- ÉQUIPE ---------------- */
function aTeam() {
  const admin = getUser('u-yann');
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Équipe</h1><p>Rôles <b>cumulables</b>. Le staff entre uniquement sur <b>invitation</b> (e-mail valable 7 jours). Chaque rôle voit son propre dashboard.</p></div>
    <div class="row" style="gap:8px">
      <button class="btn btn-primary btn-sm" onclick="inviteModal()">${icon('mail', 14)} Inviter un staff</button>
    </div></div>

  <div class="card card-pad mb16" style="border-color:var(--gold-line)">
    <div class="row" style="flex-wrap:wrap">${avatarHTML(admin)}
      <div class="wrap"><b style="font-size:14px">${esc(admin.name)}</b> <span class="badge b-gold">Super Administrateur</span>
      <div class="xs muted mt4">${esc(admin.email)} · compte permanent, non révocable, unique</div></div>
      <span class="pill">${icon('shieldCheck', 12)} Protégé</span>
    </div>
  </div>

  <div class="col" style="gap:12px">
    ${S.team.map(m => {
      const acct = S.users.find(x => x.email === m.email);
      return `<div class="card card-pad">
      <div class="row" style="flex-wrap:wrap">${avatarHTML(m)}
        <div class="wrap"><b style="font-size:13.5px">${esc(m.name)}</b> ${m.test ? '<span class="badge b-violet">Compte test</span>' : ''} ${acct && isSuspended(acct) ? '<span class="badge b-red">Suspendu</span>' : ''}<div class="xs muted">${esc(m.email)}</div></div>
        <div class="row" style="gap:6px">
          ${acct ? (isSuspended(acct)
            ? `<button class="btn btn-sm" onclick="setUserStatus('${acct.id}','active')">${icon('unlock', 13)} Réactiver</button>`
            : `<button class="btn btn-sm btn-danger" onclick="setUserStatus('${acct.id}','suspended')">${icon('lock', 13)} Suspendre</button>`) : ''}
          <button class="btn btn-sm btn-ghost" onclick="removeMember('${m.id}')">${icon('trash', 13)}</button>
        </div>
      </div>
      <div class="tag-row mt16">
        ${ROLES.map(([id, lbl]) => `<label class="role-chk ${m.roles.includes(id) ? 'on' : ''}"><input type="checkbox" ${m.roles.includes(id) ? 'checked' : ''} onchange="toggleRole('${m.id}','${id}')"> ${lbl}</label>`).join('')}
      </div>
    </div>`; }).join('')}
  </div>

  <h3 style="font-size:14px;margin-top:22px" class="mb8">Invitations en attente</h3>
  <div class="card">
    ${S.invites.filter(i => !i.used).length ? S.invites.filter(i => !i.used).map(i => `
      <div class="res-item"><span class="step-ico ${i.expiresAt > Date.now() ? 's-cur' : 's-lock'}">${icon('mail', 13)}</span>
        <div class="wrap"><b style="font-size:12.8px">${esc(i.email)}</b><div class="xs faint">${i.type === 'staff' ? `Staff · rôles : ${(i.roles || []).join(', ')}` : 'Étudiant · accès gracieux'} · expire ${i.expiresAt > Date.now() ? 'dans ' + Math.ceil((i.expiresAt - Date.now()) / DAY) + ' j' : '(expirée)'}</div></div>
      </div>`).join('') : '<div class="empty small">Aucune invitation en attente.</div>'}
  </div>
  <div class="banner info mt16">${icon('shield', 15)}<span class="small">Le <b>Super Administrateur</b> est unique et permanent : impossible de le révoquer, de le suspendre ou d’ajouter un second Super Admin. Les réglages sensibles (API, nom de plateforme, icône) ne sont visibles que de lui.</span></div>`;
}
function inviteModal() {
  openModal({
    title: 'Inviter un membre du staff',
    body: `<div class="field"><label>Adresse e-mail</label><input class="inp" id="invEmail" type="email" placeholder="personne@exemple.com"></div>
      <div class="field"><label>Rôles (cumulables)</label><div class="tag-row">${ROLES.map(([id, lbl]) => `<label class="role-chk"><input type="checkbox" value="${id}" class="invRole"> ${lbl}</label>`).join('')}</div>
      <div class="hint">Le membre recevra un e-mail d’invitation (Apps Script) valable <b>7 jours</b>. En cliquant, il configure son compte (nom, mot de passe, photo).</div></div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="sendInvite()">${icon('send', 14)} Envoyer l’invitation</button>`
  });
}
function sendInvite() {
  const email = document.getElementById('invEmail').value.trim().toLowerCase();
  if (!email) return toast('E-mail requis', 'err');
  if (S.users.some(u => u.email.toLowerCase() === email)) return toast('Un compte existe déjà avec cet e-mail.', 'err');
  const roles = [...document.querySelectorAll('.invRole:checked')].map(i => i.value);
  if (!roles.length) return toast('Choisissez au moins un rôle.', 'err');
  S.invites.push({ id: uid(), email, type: 'staff', roles, expiresAt: Date.now() + 7 * DAY, used: false });
  sendFlow('invite_staff', email, { roles: roles.join(', ') });
  if (roles.includes('coach')) S.users.filter(x => x.role === 'student').forEach(st =>
    notify(st.id, 'info', 'Un nouveau membre de l’équipe vous accompagne', 'La discussion en temps réel est disponible dans Mes questions.'));
  save(); closeModal(); render();
  toast(`Invitation envoyée à ${esc(email)} (7 jours)`, 'ok', 'mail');
}
function addStudentModal() {
  openModal({
    title: 'Ajouter un étudiant (accès gracieux)',
    body: `<div class="field"><label>Adresse e-mail de l’étudiant</label><input class="inp" id="asEmail" type="email"></div>
      <div class="banner gold" style="padding:10px 12px">${icon('sparkles', 13)}<span class="small">L’étudiant recevra un e-mail lui annonçant qu’il <b>bénéficie d’un accès gratuit</b> (une grâce). Le lien de configuration est valable <b>3 jours</b> ; s’il expire, rien n’est conservé en base : il n’existe qu’une fois son compte configuré.</span></div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button><button class="btn btn-gold" onclick="sendStudentGrace()">${icon('send', 14)} Ajouter & envoyer</button>`
  });
}
function sendStudentGrace() {
  const email = document.getElementById('asEmail').value.trim().toLowerCase();
  if (!email) return toast('E-mail requis', 'err');
  S.invites.push({ id: uid(), email, type: 'student', expiresAt: Date.now() + 3 * DAY, used: false });
  sendFlow('gift_access', email);
  save(); closeModal(); render();
  toast('Étudiant ajouté : e-mail d’accès gracieux envoyé (3 jours)', 'gold', 'mail');
}
function setUserStatus(userId, status) {
  const t = getUser(userId); if (!t) return;
  if (userId === 'u-yann') return toast('Le Super Administrateur ne peut pas être révoqué.', 'err', 'shield');
  if (status === 'suspended') {
    confirmModal(`Suspendre ${esc(t.name)} ?`, 'Il recevra un e-mail + une notification push et perdra l’accès à son dashboard jusqu’à réactivation.', 'Suspendre', true).then(v => {
      if (!v) return;
      t.status = 'suspended';
      notify(userId, 'info', 'Compte suspendu', 'Votre accès est suspendu. Contactez le support pour toute question.');
      sendFlow('suspend', t.email, { name: t.name });
      recordAudit('suspend', { user: userId });
      save(); render(); toast(`${t.name} suspendu(e)`, 'err', 'lock');
    });
  } else {
    t.status = 'active';
    notify(userId, 'info', 'Compte réactivé ✓', 'Votre accès au campus est de nouveau actif.');
    sendFlow('reactivate', t.email);
    recordAudit('reactivate', { user: userId });
    save(); render(); toast(`${t.name} réactivé(e)`, 'ok', 'unlock');
  }
}
function removeMember(tmId) {
  const m = S.team.find(x => x.id === tmId); if (!m) return;
  confirmModal(`Supprimer définitivement ${esc(m.name)} ?`, 'Son accès staff est révoqué. Des traces d’audit sont conservées.', 'Supprimer', true).then(v => {
    if (!v) return;
    S.team = S.team.filter(x => x.id !== tmId);
    const acct = S.users.find(x => x.email === m.email); if (acct) acct.deleted = true;
    recordAudit('delete_staff', { email: m.email });
    save(); render(); toast('Membre supprimé (traces d’audit conservées)', '', 'trash');
  });
}
function removeStudent(id) {
  const st = getUser(id); if (!st) return;
  confirmModal(`Supprimer définitivement ${esc(st.name)} ?`, 'Le compte et ses activités sont effacés pour libérer l’espace. Des traces d’audit (preuve de passage) sont conservées.', 'Supprimer définitivement', true).then(v => {
    if (!v) return;
    recordAudit('student_deleted', { email: st.email, name: st.name, joined: st.joined, certs: S.certs.filter(c => c.userId === id).map(c => c.code) });
    S.users = S.users.filter(x => x.id !== id);
    S.enrollments = S.enrollments.filter(e => e.userId !== id);
    delete S.progress[id]; delete S.exAttempts[id]; delete S.evAttempts[id];
    S.submissions = S.submissions.filter(x => x.userId !== id);
    S.threads = S.threads.filter(x => x.userId !== id);
    save(); render(); toast('Compte supprimé — traces d’audit conservées', '', 'trash');
  });
}
function generateCert(reqId) {
  const q = S.certRequests.find(x => x.id === reqId); if (!q) return;
  q.status = 'generated';
  const st = getUser(q.userId); const t = getTraining(q.trainingId);
  if (!S.certs.some(c => c.userId === q.userId && c.trainingId === q.trainingId)) {
    /* Certificat figé à l'émission : nom + formation capturés (document historique) */
    S.certs.push({ id: uid(), code: 'CERT-2026-' + Math.floor(1000 + Math.random() * 9000), userId: q.userId, trainingId: q.trainingId, issuedAt: Date.now(), status: 'actif', holderName: st ? st.name : '', formationTitle: t.title, pdfRef: 'certs/' + (t.abbr || t.code) + '-' + Date.now() + '.pdf', previewRef: t.coverImg || null, slideDeleted: true, frozen: true });
  }
  const enr = S.enrollments.find(e => e.userId === q.userId && e.trainingId === q.trainingId);
  if (enr) enr.completedAt = q.at;
  notify(q.userId, 'cert', 'Certificat délivré 🎓', `Votre certificat « ${t.title} » est disponible.`);
  sendFlow('cert_ready', st.email, { code: t.abbr || t.code });
  if (S.settings.appscript.certUrl) {
    fetch(S.settings.appscript.certUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ name: st.name, email: st.email, start: enr?.at, end: q.at, course: t.title, abbr: t.abbr || t.code }) }).catch(() => { });
  }
  recordAudit('cert_generated', { user: q.userId, training: q.trainingId });
  save(); render(); toast('Certificat émis : PDF officiel conservé, slide de travail supprimé ✓', 'gold', 'award');
}
function refuseCert(reqId) {
  const q = S.certRequests.find(x => x.id === reqId); if (!q) return;
  const t = getTraining(q.trainingId);
  const mods = stepsOf(t).filter(s => s.kind === 'module');
  openModal({
    wide: true, title: 'Refuser la demande — ' + esc(getUser(q.userId).name),
    body: `<div class="field"><label>Motif du refus (obligatoire, envoyé à l’étudiant)</label><textarea class="inp" id="rcMotif" placeholder="Ex. L’évaluation physique n’a pas encore validé le module 3…"></textarea></div>
      <div class="field"><label>Réinitialisation de la progression</label>
        <label class="role-chk mb8"><input type="checkbox" id="rcAll" onchange="document.querySelectorAll('.rcMod').forEach(c=>c.checked=this.checked)"> Tout le cours</label>
        <div class="col" style="gap:6px">${t.chapters.map((ch, ci) => `<div class="xs faint" style="font-weight:800;margin-top:6px">CHAPITRE ${ci + 1} — ${esc(ch.title)}</div>` + ch.modules.map(m => `<label class="role-chk"><input type="checkbox" class="rcMod" value="${m.id}"> ${esc(m.title)}</label>`).join(' ')).join('')}</div>
        <div class="hint">Ce qui n’est pas réinitialisé reste acquis. La progression se recalculera à partir des modules remis à zéro.</div></div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button><button class="btn btn-danger" onclick="applyRefuseCert('${reqId}')">Refuser & réinitialiser</button>`
  });
}
function applyRefuseCert(reqId) {
  const q = S.certRequests.find(x => x.id === reqId); if (!q) return;
  const motif = document.getElementById('rcMotif').value.trim();
  if (!motif) return toast('Le motif est obligatoire.', 'err', 'alert');
  const mods = [...document.querySelectorAll('.rcMod:checked')].map(c => c.value);
  q.status = 'refused'; q.feedback = motif;
  if (mods.length) {
    S.progress[q.userId] = S.progress[q.userId] || {};
    mods.forEach(m => delete S.progress[q.userId][m]);
  }
  if (typeof rwSetback === 'function' && mods.length) rwSetback(q.userId, 'reprise demandée après refus de certificat');
  notify(q.userId, 'cert', 'Demande de certificat : évaluation à refaire', motif);
  sendFlow('cert_request_ack', getUser(q.userId).email);
  recordAudit('cert_refused', { user: q.userId, resetModules: mods.length });
  save(); closeModal(); render();
  toast('Refus envoyé + progression réinitialisée (' + mods.length + ' module(s))', 'err');
}
function toggleRole(tmId, role) {
  const m = S.team.find(x => x.id === tmId);
  const has = m.roles.includes(role);
  /* Combinaisons impossibles : le Manager a déjà une vue sur tous les autres rôles —
     il ne se combine ni avec eux, ni avec le Super Admin (compte unique et séparé). */
  if (!has) {
    if (role === 'manager' && m.roles.length) { render(); return toast('Combinaison impossible : le Manager ne se combine avec aucun autre rôle. Retirez d’abord les autres rôles.', 'err', 'shield'); }
    if (m.roles.includes('manager')) { render(); return toast('Combinaison impossible : ce membre est Manager — ce rôle ne se combine pas. Retirez d’abord le rôle Manager.', 'err', 'shield'); }
  }
  m.roles = has ? m.roles.filter(r => r !== role) : [...m.roles, role];
  save(); render(); toast('Rôles mis à jour', 'ok', 'shield');
}

/* ---------------- CERTIFICATIONS ---------------- */
function aCerts() {
  const pending = S.certRequests.filter(q => q.status === 'pending');
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Certifications</h1><p>Validation <b>humaine</b> : à 100 %, l’étudiant demande son certificat ; vous évaluez (test physique), puis « Lancer la génération » active votre Apps Script de certification. Un refus exige un motif + réinitialisation ciblée.</p></div></div>

  ${pending.length ? `<h3 style="font-size:14px" class="mb8">Demandes de certificat à évaluer <span class="badge b-red">${pending.length}</span></h3>
  <div class="grid g2 mb24" style="align-items:start">${pending.map(q => {
    const st = getUser(q.userId); const t = getTraining(q.trainingId);
    const enr = S.enrollments.find(e => e.userId === q.userId && e.trainingId === q.trainingId);
    return `<div class="card card-pad">
      <div class="row">${avatarHTML(st)}<div class="wrap"><b style="font-size:13.5px">${esc(st.name)}</b><div class="xs muted">${esc(st.email)}</div></div><span class="badge b-gold">100 %</span></div>
      <div class="divider"></div>
      <div class="row between small"><span class="muted">Formation</span><b>${esc(t.title)} (${esc(t.abbr || t.code)})</b></div>
      <div class="row between small mt8"><span class="muted">Début</span><b>${enr ? fmtDate(enr.at) : '—'}</b></div>
      <div class="row between small mt8"><span class="muted">Fin</span><b>${fmtDate(q.at)}</b></div>
      <div class="row mt16" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-gold" onclick="generateCert('${q.id}')">${icon('zap', 13)} Lancer la génération</button>
        <button class="btn btn-sm btn-danger" onclick="refuseCert('${q.id}')">${icon('x', 13)} Refuser + motif</button>
      </div>
      <div class="xs faint mt8">La génération transmet à votre Apps Script : nom, e-mail, dates début/fin, nom du cours, abréviation.</div>
    </div>`; }).join('')}</div>` : ''}
  <div class="grid g3 mb16">
    ${statCard('Certificats délivrés', S.certs.length, 'award')}
    ${statCard('Statut actif', S.certs.filter(c => c.status === 'actif').length, 'checkCircle')}
    ${statCard('Ce mois-ci', S.certs.filter(c => Date.now() - c.issuedAt < 30 * DAY).length, 'calendar')}
  </div>
  <div class="card" style="overflow-x:auto">
    <table class="tbl"><thead><tr><th>Code</th><th>Étudiant</th><th>Formation</th><th>Date d’émission</th><th>Statut</th><th></th></tr></thead>
    <tbody>${S.certs.map(c => `<tr>
      <td><span class="kbd">${c.code}</span></td>
      <td><div class="row">${avatarHTML(getUser(c.userId), 'sm')}<b>${esc(getUser(c.userId)?.name)}</b></div></td>
      <td class="xs muted">${esc(getTraining(c.trainingId)?.title)}</td>
      <td class="xs muted">${fmtDate(c.issuedAt)}</td>
      <td><span class="badge b-green">Actif</span></td>
      <td><button class="btn btn-sm" onclick="showCert('${c.id}')">${icon('eye', 13)} Voir</button></td>
    </tr>`).join('')}</tbody></table>
  </div>`;
}

/* ---------------- VENTES ---------------- */
function aSales() {
  const confirmed = S.sales.filter(s => s.status === 'confirmé');
  const decls = S.sales.filter(s => s.status === 'declaré');
  const total = confirmed.reduce((a, b) => a + b.amount, 0);
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Ventes</h1><p>Paiements collectés via <b>Chariow</b> (1er achat, hors app), <b>Flutterwave</b> (achats dans l’app, voie universelle) et <b>Money Fusion</b> (mobile money, repli historique). Les frais de transaction sont <b>supportés par l’étudiant</b> et ajoutés au prix affiché. Chaîne : <b>paiement confirmé → webhook → compte identifié → formation attribuée</b>.</p></div></div>

  ${decls.length ? `
  <h3 style="font-size:14px" class="mb8">Paiements manuels à vérifier ${`<span class="badge b-red">${decls.length}</span>`}</h3>
  <div class="grid g2 mb24" style="align-items:start">${decls.map(s => {
    const st = getUser(s.userId); const t = getTraining(s.trainingId);
    return `<div class="card card-pad">
      <div class="row">${avatarHTML(st)}<div class="wrap"><b style="font-size:13.5px">${esc(st.name)}</b><div class="xs muted">${esc(st.email)} · ${timeAgo(s.at)}</div></div><span class="badge b-amber">Déclaré</span></div>
      <div class="divider"></div>
      <div class="row between small"><span class="muted">Formation</span><b>${esc(t.title)}</b></div>
      <div class="row between small mt8"><span class="muted">Montant</span><b>${fmtMoney(s.amount)}</b></div>
      <div class="row between small mt8"><span class="muted">Méthode</span><b>${esc(s.method)}</b></div>
      <div class="row between small mt8"><span class="muted">Référence commande</span><span class="kbd">${esc(s.ref || '')}</span></div>
      <div class="row between small mt8"><span class="muted">N° transaction déclaré</span><span class="kbd">${esc(s.txn || '—')}</span></div>
      <div class="banner info mt8 small" style="padding:9px 12px">${icon('eye', 13)}<span>Vérifiez que le transfert ${esc(s.method)} de <b>${fmtMoney(s.amount)}</b> est bien arrivé sur le compte marchand (réf ${esc(s.ref || '')}).</span></div>
      <div class="row mt16" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" onclick="confirmSale('${s.id}')">${icon('check', 13)} Confirmer & attribuer</button>
        <button class="btn btn-sm btn-danger" onclick="declineSale('${s.id}')">${icon('x', 13)} Rejeter</button>
      </div>
    </div>`; }).join('')}</div>` : ''}

  <div class="grid g3 mb16">
    ${statCard('Ventes confirmées', confirmed.length, 'wallet')}
    ${statCard('Chiffre d’affaires', fmtMoney(total), 'trend')}
    ${statCard('Panier moyen', fmtMoney(Math.round(total / Math.max(1, confirmed.length))), 'chart')}
  </div>
  <div class="card" style="overflow-x:auto">
    <table class="tbl"><thead><tr><th>Référence</th><th>Étudiant</th><th>Formation</th><th>Méthode</th><th>Montant</th><th>Statut</th><th></th></tr></thead>
    <tbody>${S.sales.map(s => `<tr>
      <td><span class="kbd">${(s.ref || s.id).toUpperCase()}</span><div class="xs faint mt4">${fmtDate(s.at)}${s.txn ? ' · n° ' + esc(s.txn) : ''}</div></td>
      <td><b>${esc(getUser(s.userId)?.name || '—')}</b><div class="xs muted">${esc(s.email)}</div></td>
      <td class="xs muted">${esc(getTraining(s.trainingId)?.title)}</td>
      <td class="xs muted">${esc(s.method)}</td>
      <td><b>${fmtMoney(s.amount)}</b>${s.fee ? `<div class="xs faint">+ ${fmtMoney(s.fee)} frais (étudiant)</div>` : ''}</td>
      <td>${s.status === 'confirmé' ? '<span class="badge b-green">Confirmé</span>' : s.status === 'declaré' ? '<span class="badge b-amber">À vérifier</span>' : '<span class="badge b-red">Rejeté</span>'}</td>
      <td><button class="btn btn-sm" onclick="saleDetail('${s.id}')">${icon('eye', 13)} Chaîne</button></td>
    </tr>`).join('')}</tbody></table>
  </div>`;
}
function confirmSale(id) {
  const s = S.sales.find(x => x.id === id); if (!s || s.status !== 'declaré') return;
  s.status = 'confirmé';
  ensureEnrollment(s.userId, s.trainingId); /* rattaché au compte existant — jamais de doublon */
  const t = getTraining(s.trainingId);
  notify(s.userId, 'sale', 'Formation activée ✓', `Paiement confirmé : « ${t.title} » a été ajoutée à votre compte.`);
  save(); render();
  toast('Paiement confirmé — formation attribuée au compte existant', 'ok', 'check');
}
function declineSale(id) {
  openModal({
    title: 'Rejeter la déclaration de paiement',
    body: `<div class="field"><label>Explication à l’étudiant (obligatoire)</label>
      <textarea class="inp" id="saleFb" placeholder="Ex. aucun transfert trouvé avec cette référence…"></textarea>
      <div class="hint">Un rejet est toujours accompagné d’une explication.</div></div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button>
      <button class="btn btn-danger" onclick="applySaleDecline('${id}')">Rejeter</button>`
  });
}
function applySaleDecline(id) {
  const fb = document.getElementById('saleFb').value.trim();
  if (!fb) return toast('Une explication est obligatoire.', 'err', 'alert');
  const s = S.sales.find(x => x.id === id); if (!s) return;
  s.status = 'rejeté'; s.feedback = fb;
  notify(s.userId, 'sale', 'Déclaration de paiement rejetée', fb);
  save(); closeModal(); render();
  toast('Déclaration rejetée — explication envoyée à l’étudiant', 'err');
}
function saleDetail(id) {
  const s = S.sales.find(x => x.id === id); if (!s) return;
  const t = getTraining(s.trainingId); const u = getUser(s.userId);
  openModal({ title: `Chaîne d’attribution — ${s.id.toUpperCase()}`, body: `
    <div class="steps-mini mb16"><b class="on">Paiement</b>${icon('chevR', 12)}<b class="on">Événement reçu</b>${icon('chevR', 12)}<b class="on">Compte identifié</b>${icon('chevR', 12)}<b class="on">Formation attribuée</b></div>
    <div class="col" style="gap:10px">
      <div class="res-item"><span class="step-ico s-done">${icon('check', 13)}</span><div class="wrap"><b style="font-size:12.8px">Achat confirmé</b><div class="xs muted">${esc(s.method)} · ${fmtMoney(s.amount)} · ${fmtDate(s.at)}</div></div></div>
      <div class="res-item"><span class="step-ico s-done">${icon('check', 13)}</span><div class="wrap"><b style="font-size:12.8px">Événement reçu par le Campus</b><div class="xs muted">Webhook sécurisé du système de vente.</div></div></div>
      <div class="res-item"><span class="step-ico s-done">${icon('check', 13)}</span><div class="wrap"><b style="font-size:12.8px">Compte identifié : ${esc(u?.email || s.email)}</b><div class="xs muted">L’étudiant existe déjà → aucun nouveau compte créé.</div></div></div>
      <div class="res-item"><span class="step-ico s-done">${icon('check', 13)}</span><div class="wrap"><b style="font-size:12.8px">Formation attribuée : ${esc(t.title)}</b><div class="xs muted">Ajoutée au compte existant immédiatement.</div></div></div>
    </div>`, foot: `<button class="btn btn-primary" onclick="closeModal()">Compris</button>` });
}

/* ---------------- ANALYTICS ---------------- */
function aAnalytics() {
  const act = S.analytics.activity; const max = Math.max(...act);
  const students = S.users.filter(x => x.role === 'student');
  const perT = S.trainings.filter(t => t.published).map(t => {
    const enrolled = S.enrollments.filter(e => e.trainingId === t.id);
    const avg = enrolled.length ? Math.round(enrolled.reduce((a, e) => a + trainingProgress(e.userId, t).pct, 0) / enrolled.length) : 0;
    return { t, n: enrolled.length, avg };
  });
  const exAll = Object.values(S.exAttempts).flatMap(m => Object.values(m)).flat();
  const evAll = Object.values(S.evAttempts).flatMap(m => Object.values(m)).flat();
  return `
  <div class="grid g4 mb16">
    ${statCard('Modules visionnés', Object.values(S.progress).reduce((a, p) => a + Object.values(p).filter(x => x.viewed).length, 0), 'play')}
    ${statCard('Progression moyenne', Math.round(students.reduce((a, st) => { const m = myTrainings(st.id); return a + (m.length ? m.reduce((b, t) => b + trainingProgress(st.id, t).pct, 0) / m.length : 0); }, 0) / Math.max(1, students.length)) + ' %', 'chart')}
    ${statCard('Réussite exercices', exAll.length ? Math.round(exAll.reduce((a, x) => a + x.score / x.total * 100, 0) / exAll.length) + ' %' : '—', 'clipboard')}
    ${statCard('Réussite évaluations', evAll.length ? Math.round(evAll.filter(x => x.passed).length / evAll.length * 100) + ' %' : '—', 'target')}
  </div>
  <div class="grid g2" style="align-items:start">
    <div class="card card-pad">
      <div class="eyebrow mb8">Activité — 14 derniers jours</div>
      <div class="chart-bars">${act.map((v, i) => `<i style="height:${Math.round(v / max * 100)}%" class="${i === act.length - 1 ? 'hi' : ''}" title="${v} actions"></i>`).join('')}</div>
      <div class="row between mt8 xs faint"><span>J-14</span><span>Aujourd’hui : ${act[act.length - 1]} actions</span></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Progression moyenne par formation</h3></div>
      ${perT.map(x => `<div class="res-item"><div class="t-cover" style="${coverStyle(x.t)};width:46px;height:34px;border-radius:7px;flex:none"><span class="mono" style="font-size:11px">${x.t.mono}</span></div>
        <div class="wrap"><b style="font-size:12.5px">${esc(x.t.title)}</b><div class="xs faint">${x.n} étudiant(s)</div><div class="mt4">${pbarHTML(x.avg)}</div></div></div>`).join('')}
    </div>
  </div>`;
}

/* ---------------- CONFIGURATION ---------------- */
function aSettings() {
  const u = getUser(S.session.userId);
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Configuration</h1><p>Identité visuelle, paramètres généraux, intégrations, notifications et sécurité.</p></div></div>
  <div class="grid g2" style="align-items:start">
    <div class="card card-pad">
      <div class="eyebrow mb8">Identité & paramètres généraux</div>
      <div class="field"><label>Nom de la plateforme</label><input class="inp" id="setPlatform" value="${esc(S.settings.platform)}"></div>
      <div class="field"><label>Taille de l’affichage (textes & icônes)</label>
        <div class="row" style="gap:6px">${[0.9, 1, 1.1, 1.25].map(v => `<button class="btn btn-sm ${(u.uiScale || 1) === v ? 'btn-primary' : ''}" onclick="setUiScale(${v})">${Math.round(v * 100)} %</button>`).join('')}</div>
        <div class="hint">Chaque utilisateur règle sa propre taille d’affichage.</div></div>
      <div class="field"><label>Palette du campus — toute la plateforme change (clair et sombre, chez tous les utilisateurs)</label>
        <div class="pal-grid">
          ${Object.keys(PALETTES).map(k => { const d = PALETTES[k];
            return `<button type="button" class="pal-card ${palDraft() === k ? 'sel' : ''}" onclick="selectPal('${k}')">
              <span class="pal-dots"><i style="background:${d.p}"></i><i style="background:${d.s}"></i><i style="background:${d.a}"></i></span>
              <span class="wrap"><b>${d.label}</b>${(S.palette || 'violet') === k ? `<span class="xs" style="color:var(--green)">appliquée ✓</span>` : (palDraft() === k ? `<span class="xs" style="color:var(--gold)">sélectionnée — non enregistrée</span>` : '')}</span>
            </button>`; }).join('')}
          <button type="button" class="pal-card pal-custom ${palDraft() === 'custom' ? 'sel' : ''}" onclick="selectPal('custom')">
            <span class="pal-dots"><i style="background:conic-gradient(#F00,#FF0,#0F0,#0FF,#00F,#F0F,#F00)"></i></span>
            <span class="wrap"><b>Au choix — composez la vôtre</b>${S.palette === 'custom' ? `<span class="xs" style="color:var(--green)">appliquée ✓</span>` : (palDraft() === 'custom' ? `<span class="xs" style="color:var(--gold)">sélectionnée — non enregistrée</span>` : '')}</span>
          </button>
        </div>
        ${palDraft() === 'custom' ? `
        <div class="pal-picker mt8">
          <div class="row" style="gap:14px;flex-wrap:wrap">
            <label class="col" style="gap:4px;align-items:center"><input type="color" value="${palcDraft().p || '#6D28D9'}" oninput="savePalCustom()" title="Couleur principale"><span class="xs muted">Principale</span></label>
            <label class="col" style="gap:4px;align-items:center"><input type="color" value="${palcDraft().s || '#8B5CF6'}" oninput="savePalCustom()" title="Couleur secondaire"><span class="xs muted">Secondaire</span></label>
            <label class="col" style="gap:4px;align-items:center"><input type="color" value="${palcDraft().a || '#C9A24B'}" oninput="savePalCustom()" title="Couleur premium (or)"><span class="xs muted">Premium</span></label>
            <label class="row small" style="gap:7px;cursor:pointer"><input type="checkbox" ${palcDraft().grad ? 'checked' : ''} onchange="savePalCustom(true)"> Dégradés</label>
          </div>
          <div class="xs faint mt4">Choisissez vos couleurs : rien n’est appliqué tant que « Enregistrer » n’est pas pressé. La principale remplace le violet partout, la premium remplace l’or.</div>
        </div>` : ''}
        <div class="hint">La signature DAVAR (violet) garde son bleu nuit profond en mode sombre ; les autres palettes passent sur un fond noir.</div></div>
      <div class="row" style="gap:8px"><button class="btn btn-primary" onclick="saveSettingsAll()">${icon('check', 14)} Enregistrer</button><span class="xs faint">Rien n’est sauvegardé avant cet appui.</span></div>
    </div>
    <div class="card card-pad">
      <div class="eyebrow mb8">Notifications</div>
      <div class="row between" style="padding:8px 0"><span class="small">Push Web (VAPID) <div class="xs faint">Réponses coach/IA, corrections, certificats, rappels</div></span><span class="badge b-green">Configuré</span></div>
      <div class="row between" style="padding:8px 0;border-top:1px solid #F3F1F8"><span class="small">Anti-doublons & pertinence <div class="xs faint">Dédoublonnage des événements, notifications inutiles filtrées</div></span><label class="switch"><input type="checkbox" checked onchange="toast('Règle enregistrée','ok')"><i></i></label></div>
      <div class="eyebrow mb8 mt16">Sécurité</div>
      <div class="row between" style="padding:8px 0"><span class="small">Double authentification (équipe)</span><label class="switch"><input type="checkbox" checked onchange="toast('2FA mise à jour','ok','shield')"><i></i></label></div>
      <div class="row between" style="padding:8px 0;border-top:1px solid #F3F1F8"><span class="small">Isolation des données étudiants <div class="xs faint">Un étudiant ne peut jamais consulter la progression d’un autre (RLS)</div></span><span class="badge b-green">Active</span></div>
    </div>
  </div>
  <h3 style="font-size:14px;margin-top:22px" class="mb8">Support (vu par les étudiants)</h3>
  <div class="card card-pad mb16">
    <div class="grid g3">
      <div class="field"><label>Lien WhatsApp</label><input class="inp" id="supWa" value="${esc(S.settings.support.whatsapp)}"></div>
      <div class="field"><label>Téléphone</label><input class="inp" id="supPh" value="${esc(S.settings.support.phone)}"></div>
      <div class="field"><label>E-mail</label><input class="inp" id="supEm" value="${esc(S.settings.support.email)}"></div>
    </div>
    <button class="btn btn-primary btn-sm" onclick="saveSupport()">${icon('check', 13)} Enregistrer le support</button>
  </div>

  <h3 style="font-size:14px" class="mb8">Réseaux sociaux (ticker discret)</h3>
  <div class="card card-pad mb16">
    ${S.settings.socials.map(s => `<div class="row between" style="padding:7px 0;border-bottom:1px solid #F3F1F8">
      <span class="small"><b>${esc(s.platform)}</b> <span class="xs muted">${esc(s.link)}</span></span>
      <span class="row" style="gap:2px"><button class="icon-btn" title="Modifier le lien" onclick="editSocialModal('${s.id}')">${icon('edit', 14)}</button>
      <button class="icon-btn" title="Supprimer" onclick="S.settings.socials=S.settings.socials.filter(x=>x.id!=='${s.id}');save();render()">${icon('trash', 14)}</button></span></div>`).join('')}
    <div class="row mt16" style="gap:8px;flex-wrap:wrap">
      <select class="inp" id="socPlat" style="max-width:180px">${['Instagram', 'TikTok', 'Facebook', 'YouTube', 'LinkedIn', 'X (Twitter)', 'WhatsApp', 'Telegram', 'Threads', 'Snapchat'].map(p => `<option>${p}</option>`).join('')}</select>
      <input class="inp" id="socLink" placeholder="https://…" style="flex:1;min-width:200px">
      <button class="btn btn-sm" onclick="addSocial()">${icon('plus', 13)} Ajouter</button>
    </div>
    <div class="xs faint mt8">Les plateformes non suivies défilent discrètement en bas des dashboards ; quand l’utilisateur s’abonne, elle disparaît de son ticker.</div>
  </div>

  <h3 style="font-size:14px" class="mb8">Annonce déroulante</h3>
  <div class="card card-pad mb16">
    <div class="field"><label>Message</label><input class="inp" id="annText" value="${esc(S.settings.announcement.text)}" placeholder="Ex. Séance live d’art oratoire samedi à 16 h"></div>
    <div class="field"><label>Audience</label><select class="inp" id="annAud">
      <option value="all" ${S.settings.announcement.audience === 'all' ? 'selected' : ''}>Étudiants + Staff</option>
      <option value="students" ${S.settings.announcement.audience === 'students' ? 'selected' : ''}>Étudiants uniquement</option>
      <option value="staff" ${S.settings.announcement.audience === 'staff' ? 'selected' : ''}>Staff uniquement</option>
    </select></div>
    <div class="row" style="gap:8px"><button class="btn btn-primary btn-sm" onclick="saveAnnounce()">${icon('check', 13)} Publier</button>
    <button class="btn btn-sm" onclick="S.settings.announcement.text='';save();render()">Effacer</button></div>
  </div>

  <h3 style="font-size:14px" class="mb8">Motivations du dimanche (étudiants uniquement)</h3>
  <div class="card card-pad mb16">
    <div class="row between mb8"><span class="small muted">Stock : <b>${S.settings.motivations.length}</b> motivation(s) numérotée(s) · la prochaine envoyée sera la <b>n° ${Math.min(S.settings.motivationsIndex + 1, S.settings.motivations.length) || 1}</b></span>
      ${S.settings.motivations.length - S.settings.motivationsIndex <= 10 ? '<span class="badge b-red">Stock presque épuisé !</span>' : '<span class="badge b-green">Stock OK</span>'}</div>
    ${S.settings.motivations.length ? `<div class="mot-list mb8">${S.settings.motivations.map((m, i) => `
      <div class="mot-line ${i === S.settings.motivationsIndex ? 'next' : ''}">
        <span class="mot-n">n°${i + 1}</span><span class="wrap">${esc(m)}</span>
        ${i === S.settings.motivationsIndex ? '<span class="badge b-violet" style="flex:none">prochaine</span>' : ''}
        <button class="icon-btn" style="flex:none;width:26px;height:26px" title="Retirer" onclick="delMotivation(${i})">${icon('x', 13)}</button>
      </div>`).join('')}</div>` : '<div class="xs muted mb8">Aucune motivation en stock pour l’instant.</div>'}
    ${(S.settings.motivationsNext && S.settings.motivationsNext.length) ? `<div class="banner info mb8">${icon('clock', 13)}<span class="small"><b>Nouvelle liste enregistrée (${S.settings.motivationsNext.length})</b> — en attente. La liste actuelle termine d’abord ses envois, puis la nouvelle la remplace automatiquement (rien n’est stocké en double).</span></div>` : ''}
    <div class="field"><label>${(S.settings.motivationsNext && S.settings.motivationsNext.length) ? 'Remplacer la liste en attente' : 'Nouvelle liste de motivations'} — <b>une par ligne, obligatoirement numérotées</b> (ex. « 1. La constance vaut mieux que l’élan. »)</label>
      <textarea class="inp" id="motTxt" rows="5" placeholder="1. La constance vaut mieux que l’élan.&#10;2. Chaque dimanche, une marche de plus."></textarea></div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="saveMotivationsReplace()">${icon('check', 13)} Enregistrer (remplace la liste actuelle)</button>
      <button class="btn btn-sm" onclick="saveMotivations()">${icon('upload', 13)} Compléter le stock actuel</button>
      <button class="btn btn-sm" onclick="sendMotivationNow()">${icon('bell', 13)} Envoyer la n° ${Math.min(S.settings.motivationsIndex + 1, S.settings.motivations.length) || 1} maintenant</button>
    </div>
    <div class="xs faint mt8">« Enregistrer » prépare le remplacement : si la liste actuelle n’est pas terminée, elle envoie d’abord ses motivations restantes, puis la nouvelle prend le relais définitivement. L’ancienne n’est stockée nulle part.</div>
  </div>

  <h3 style="font-size:14px" class="mb8">Paiement & intégrations externes</h3>
  <div class="card card-pad mb16">
    <div class="banner ok mb16">${icon('wallet', 15)}<span class="small"><b>Chariow</b> actif — tout achat (une formation ou le coaching) <b>crée le premier accès</b> de l’étudiant ; le webhook « paiement confirmé » débloque la formation achetée, sans jamais créer de doublon.</span></div>
    <div class="field"><label>Coaching personnel — lien de réservation Chariow</label>
      <div class="row" style="gap:8px"><input class="inp" id="asBooking" value="${esc(S.settings.chariow.coachingBooking || '')}" placeholder="https://….mychariow.co/prd_…/booking">
      <button class="btn btn-sm" onclick="testLink(document.getElementById('asBooking').value)">${icon('globe', 13)} Tester</button></div></div>
    <div class="grid g2">
      <div class="field"><label>Apps Script — envoi des e-mails (bienvenue, invitations, suspensions…)</label>
        <div class="row" style="gap:8px"><input class="inp" id="asMail" value="${esc(S.settings.appscript.mailUrl)}" placeholder="https://script.google.com/macros/s/…/exec">
        <button class="btn btn-sm" onclick="testLink(document.getElementById('asMail').value)">${icon('zap', 13)} Tester</button></div></div>
      <div class="field"><label>Apps Script — génération des certificats</label>
        <div class="row" style="gap:8px"><input class="inp" id="asCert" value="${esc(S.settings.appscript.certUrl)}" placeholder="https://script.google.com/macros/s/…/exec">
        <button class="btn btn-sm" onclick="testLink(document.getElementById('asCert').value)">${icon('award', 13)} Tester</button></div></div>
    </div>
    <div class="divider" style="margin:16px 0"></div>
    <div class="eyebrow mb8">API Chariow (produits & liens de checkout des formations)</div>
    <div class="field"><label>Clé API Chariow <span class="xs faint">(Espace marchand → Réglages → API — distincte du secret Pulse)</span></label>
      <input class="inp" id="asChariowKey" value="${esc(S.settings.chariow.apiKey || '')}" placeholder="cw_live_…" style="font-family:ui-monospace,monospace">
      <div class="hint">Sert à créer/mettre à jour vos produits et à récupérer le lien de checkout de chaque formation. Le Pulse (webhook) ci-dessous reste le déclencheur des accès.</div></div>
    <div class="divider" style="margin:16px 0"></div>
    <div class="eyebrow mb8">Réception des paiements — Pulse Chariow (webhook officiel)</div>
    <div class="field"><label>Secret de signature du Pulse <span class="xs faint">(whsec_… — propre au Pulse, ≠ clé API)</span></label>
      <div class="row" style="gap:8px"><input class="inp" id="asPulse" value="${esc(S.settings.chariow.pulseSecret || '')}" placeholder="whsec_…" style="font-family:ui-monospace,monospace">
      <button class="btn btn-sm" onclick="toast(S.settings.chariow.pulseSecret ? 'Secret en place ✓' : 'Aucun secret enregistré pour l’instant.', S.settings.chariow.pulseSecret ? 'ok' : 'err', 'shield')">${icon('shield', 13)} Vérifier</button></div></div>
    <div class="banner info mb8">${icon('zap', 14)}<span class="small">Dans <b>Chariow → Automatisations → Pulses → Ajouter un Pulse</b> : URL = <span class="kbd">https://VOTRE-DOMAINE/api/chariow/pulse</span> · Événement = <b>Vente réussie</b> · Produit = tous. Puis révélez le <b>Secret de signature</b> dans l’aperçu du Pulse et collez-le ci-dessus. Testez avec « Envoyer un pulse test ».</span></div>
    <div class="xs faint">Le serveur vérifie la signature HMAC-SHA256 de chaque Pulse et dédoublonne par <span class="kbd">x-pulse-delivery-id</span> : une vente ne peut jamais débloquer deux fois, ni créer un second compte.</div>
    <div class="divider" style="margin:16px 0"></div>
    <div class="eyebrow mb8">Flutterwave — fournisseur optionnel · mobile money CI/Sénégal (dont Wave) + cartes internationales ${(S.settings.flutterwave || {}).enabled ? '<span class="badge b-green">actif · ' + esc({ fallback: 'alternative', cards: 'cartes', all: 'universelle' }[(S.settings.flutterwave || {}).mode] || 'universelle') + '</span>' : '<span class="badge">inactif</span>'}</div>
    <div class="field"><label>Rôle sur la plateforme</label>
      <select class="inp" id="asFwMode">
        <option value="all" ${(((S.settings.flutterwave || {}).mode) || 'all') === 'all' ? 'selected' : ''}>Voie universelle — tous les achats dans l’app : mobile money + cartes internationales (recommandé)</option>
        <option value="cards" ${((S.settings.flutterwave || {}).mode) === 'cards' ? 'selected' : ''}>Cartes seulement (Money Fusion garde le mobile money)</option>
        <option value="fallback" ${((S.settings.flutterwave || {}).mode) === 'fallback' ? 'selected' : ''}>Simple alternative (proposée dans les modales Money Fusion / Chariow)</option>
      </select></div>
    <label class="row small mb8" style="gap:8px;cursor:pointer"><input type="checkbox" id="asFwEnabled" ${(S.settings.flutterwave || {}).enabled ? 'checked' : ''}> Activer Flutterwave (voie universelle des achats dans l’app) — si désactivé, repli historique Money Fusion + Chariow</label>
    <div class="grid g2">
      <div class="field"><label>Clé secrète <b>Flutterwave</b> <span class="xs faint">(FLWSECK-… — côté serveur uniquement)</span></label><input class="inp" id="asFwKey" type="password" value="${esc((S.settings.flutterwave || {}).apiKey || '')}" placeholder="FLWSECK-…" style="font-family:ui-monospace,monospace"></div>
      <div class="field"><label>Secret du webhook <b>Flutterwave</b> <span class="xs faint">(en-tête verifi-hash)</span></label><input class="inp" id="asFwSecret" value="${esc((S.settings.flutterwave || {}).webhookSecret || '')}" placeholder="votre secret" style="font-family:ui-monospace,monospace"></div>
    </div>
    <div class="banner info mb8">${icon('zap', 14)}<span class="small">Dans <b>Flutterwave Dashboard → Settings → API</b> : récupérez la clé secrète, puis définissez l’URL du webhook = <span class="kbd">https://VOTRE-DOMAINE/api/flutterwave/webhook</span> et copiez le <b>secret hash</b>. Le serveur vérifie <span class="kbd">verifi-hash</span>, re-vérifie chaque transaction (<span class="kbd">GET /v3/transactions/:id/verify</span>) et dédoublonne par <span class="kbd">tx_ref</span> : une vente ne peut jamais débloquer deux fois.</span></div>
    <div class="divider" style="margin:16px 0"></div>
    <div class="eyebrow mb8">Money Fusion — mobile money (repli historique, clés dédiées)</div>
    <div class="grid g2">
      <div class="field"><label>Identifiant marchand <b>Money Fusion</b></label><input class="inp" id="asMfKey" value="${esc((S.settings.moneyfusion || {}).merchantKey || '')}" placeholder="MF-…" style="font-family:ui-monospace,monospace"></div>
      <div class="field"><label>Clé privée <b>Money Fusion</b> <span class="xs faint">(côté serveur uniquement)</span></label><input class="inp" id="asMfSecret" type="password" value="${esc((S.settings.moneyfusion || {}).privateKey || '')}" placeholder="votre clé privée" style="font-family:ui-monospace,monospace"></div>
    </div>
    <div class="field"><label>Secret / clé du webhook <b>Money Fusion</b> <span class="xs faint">(vérification des notifications de paiement)</span></label>
      <input class="inp" id="asMfWebhook" type="password" value="${esc((S.settings.moneyfusion || {}).webhookSecret || '')}" placeholder="votre secret webhook" style="font-family:ui-monospace,monospace">
      <div class="hint">Le serveur vérifie chaque notification Money Fusion avec ce secret avant de débloquer une formation.</div></div>
    <div class="banner info mb8">${icon('globe', 14)}<span class="small">Dans la combinaison <b>Money Fusion + Chariow</b> : Money Fusion encaisse le mobile money dans <b>tous les pays qu’il couvre</b> (Côte d’Ivoire, Sénégal, Mali, Burkina Faso, Bénin, Togo, Niger, Guinée-Bissau, Guinée… 26+ pays d’Afrique selon sa documentation) ; <b>Chariow prend tous les autres pays</b> (cartes internationales, reste du monde).</span></div>
    <button class="btn btn-primary btn-sm mt16" onclick="saveAppScript()">${icon('check', 13)} Enregistrer ces intégrations</button>
    <div class="xs faint mt8">Vous pouvez modifier ces URLs à tout moment : elles sont utilisées immédiatement pour les e-mails, les invitations, les suspensions et la génération des certificats.</div>
  </div>

  <h3 style="font-size:14px;margin-top:22px" class="mb8">Intégrations</h3>
  <div class="grid g3">
    ${[['layers', 'Turso (base de données)', 'SQLite edge — 5 Go inclus, aucune limite d’utilisateurs', 'Confirmé'],
      ['image', 'Cloudflare R2', 'Fichiers protégés : PDF, livres audio, couvertures, vidéos', 'Confirmé'],
      ['grid', 'Google Sheets', 'Synchronisation automatique des données', (S.settings.sheets || {}).enabled ? 'Connecté' : 'À configurer'],
      ['bell', 'Notifications push', 'Notifications temps réel', 'Connecté'],
      ['sparkles', 'Assistant virtuel', 'Fournisseur actif : ' + (AI_PROVIDERS[aiActiveProvider()] || S.aiConfig.provider) + ' · bascule automatique selon les quotas journaliers', 'Connecté'],
      ['wallet', 'Paiement Chariow', '1er achat hors app (webhook Pulse) · Flutterwave dans l’app · Money Fusion en repli mobile money · frais à la charge de l’étudiant', 'Actif'],
      ['award', 'Certification', 'Validation humaine + Apps Script', 'Actif']].map(([ic, n, d, st]) => `
      <div class="card card-pad"><div class="row between"><span class="s-ico" style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--violet-soft);color:var(--violet)">${icon(ic, 16)}</span><span class="badge ${st === 'À configurer' || st === 'Planifié' || st === 'Plan retenu' ? 'b-gold' : 'b-green'}">${st}</span></div>
        <b style="font-size:13.5px" class="mt8">${n}</b><div class="xs muted mt4">${d}</div></div>`).join('')}
  </div>

  <h3 style="font-size:14px;margin-top:22px" class="mb8">Réseaux sociaux — contrôle des abonnements</h3>
  <div class="card card-pad mb16">
    <p class="xs muted mb8">Chaque étudiant qui confirme avoir rejoint une page officielle apparaît ici avec la date et l’heure. Les réseaux sociaux ne proposent aucune vérification automatique : c’est cette confirmation horodatée qui sert de contrôle.</p>
    ${adminSubsRows()}
  </div>

  <h3 style="font-size:14px;margin-top:22px" class="mb8" style="color:var(--red)">Zone sensible — données de démonstration</h3>
  <div class="card card-pad mb16">
    <div class="row between mt8"><span class="small"><b>Mode production</b><div class="xs muted">À activer au lancement : masque les comptes de démonstration de l'écran de connexion. Le compte Super Admin planté reste, lui, toujours disponible par e-mail + mot de passe.</div></span>
      <label class="switch"><input type="checkbox" ${S.settings.productionMode ? 'checked' : ''} onchange="setProductionMode(this.checked)"><i></i></label></div>
    <div class="row between mt8"><span class="small"><b>Test de vue chez le Manager</b><div class="xs muted">Désactivé par défaut. Une fois activé, le Manager peut tester toutes les vues — étudiant et tout le staff — sauf la vôtre : le fondateur n’apparaît jamais dans sa liste.</div></span>
      <label class="switch"><input type="checkbox" ${S.settings.managerViewAs ? 'checked' : ''} onchange="setManagerViewAs(this.checked)"><i></i></label></div>
    <div class="divider"></div>
    <b>Purger tous les comptes et contenus de test</b>
    <p class="xs muted mt4 mb8">Supprime définitivement : comptes de test (étudiants, coachs — sauf vous), formations de démonstration, ressources et fichiers joints, ventes, certificats, conversations, avis, notifications, réactions, commentaires et reports. Vos réglages de plateforme sont conservés. La plateforme repart entièrement vierge.</p>
    <button class="btn btn-danger btn-sm" onclick="confirmPurgeDemo()">${icon('refresh', 13)} Purger les données de démonstration</button>
  </div>

  <h3 style="font-size:14px;margin-top:22px" class="mb8">Synchronisation Google Sheets & clé API</h3>
  <div class="card card-pad mb16">
    <div class="row between mb8"><span class="small muted">Les données (étudiants, ventes, progression) sont synchronisées vers votre Google Sheets — pratique pour vos propres tableaux de suivi.</span>
      <label class="switch"><input type="checkbox" id="shEnabled" ${(S.settings.sheets || {}).enabled ? 'checked' : ''} onchange="toggleSheets(this.checked)"><i></i></label></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label>Clé API (Apps Script)</label>
        <input class="inp" id="shKey" value="${esc((S.settings.sheets || {}).apiKey || '')}" placeholder="cle-api-…" style="font-family:ui-monospace,monospace"></div>
      <div class="field"><label>ID du Google Sheets</label>
        <input class="inp" id="shSheet" value="${esc((S.settings.sheets || {}).sheetId || '')}" placeholder="Ex. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"></div>
    </div>
    <div class="field"><label>Fréquence de synchronisation</label>
      <select class="inp" id="shFreq" style="max-width:280px">
        ${[['hourly', 'Toutes les heures'], ['daily', 'Une fois par jour'], ['weekly', 'Une fois par semaine']].map(([v, l]) => `<option value="${v}" ${(S.settings.sheets || {}).freq === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
    <div class="row" style="gap:8px">
      <button class="btn btn-primary btn-sm" onclick="saveSheets()">${icon('check', 13)} Enregistrer</button>
      <button class="btn btn-sm" onclick="syncSheetsNow()">${icon('refresh', 13)} Synchroniser maintenant</button>
    </div>
    <div class="xs faint mt8">Dernière synchronisation : ${(S.settings.sheets || {}).lastSync ? new Date(S.settings.sheets.lastSync).toLocaleString('fr-FR') : 'jamais'}.</div>
  </div>

  <h3 style="font-size:14px;margin-top:22px" class="mb8">Espace Développeur — clés API</h3>
  <div class="card card-pad mb16">
    <div class="row between mb8"><div><b style="font-size:13.5px">Clés d’accès API</b>
      <div class="xs muted mt4">Créez des clés pour connecter des applications externes (paiements, Sheets, agents IA…). Chaque clé est journalisée et révocable.</div></div>
      <button class="btn btn-primary btn-sm" onclick="genApiKey()">${icon('key', 13)} Créer une clé</button></div>
    ${(S.apiKeys || []).length ? (S.apiKeys || []).map(k => `<div class="row between" style="padding:7px 0;border-bottom:1px solid var(--line)">
      <span class="small" style="font-family:ui-monospace,monospace">${k.revoked ? '<s>' + esc(k.key) + '</s>' : esc(k.key)}</span>
      <div class="row" style="gap:8px"><span class="xs faint">${new Date(k.at).toLocaleDateString('fr-FR')}</span>
      ${k.revoked ? '<span class="badge b-grey">Révoquée</span>' : `<button class="btn btn-sm btn-danger" onclick="revokeApiKey('${k.id}')">Révoquer</button>`}</div></div>`).join('') : '<div class="xs faint">Aucune clé créée pour l’instant.</div>'}
    <div class="xs faint mt8">Agent IA externe (API/MCP) : utilisez une clé ci-dessus comme jeton d’accès de l’agent — il ne répondra que sur les formations de l’étudiant connecté.</div>
  </div>

  ${u.role === 'admin' ? `
  <h3 style="font-size:14px;margin-top:22px" class="mb8">Transfert de propriété du campus</h3>
  <div class="card card-pad mb16" style="border-color:var(--gold-line)">
    <div class="banner gold mb8" style="padding:10px 12px">${icon('shield', 14)}<span class="small">Le Super Administrateur est <b>unique</b>. Le transfert exige votre mot de passe, puis une <b>confirmation par e-mail</b> du nouveau propriétaire avant d’être effectif. Toutes les données, intégrations et réglages sont transmis.</span></div>
    ${S.pendingTransfer ? `<div class="banner warn mb8">${icon('clock', 14)}<span class="small">Transfert en attente vers <b>${esc(S.pendingTransfer.to)}</b> — un e-mail de confirmation lui a été envoyé le ${new Date(S.pendingTransfer.at).toLocaleString('fr-FR')}.</span>
      <button class="btn btn-sm" style="margin-left:auto" onclick="cancelTransfer()">Annuler le transfert</button></div>` : `
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label>E-mail du nouveau propriétaire</label>
        <input class="inp" id="trEmail" type="email" placeholder="nouveau.proprietaire@exemple.com"></div>
      <div class="field"><label>Votre mot de passe Super Admin</label>
        <input class="inp" id="trPwd" type="password" placeholder="••••••••"></div>
    </div>
    <button class="btn btn-gold btn-sm" onclick="transferOwnership()">${icon('shield', 13)} Initier le transfert</button>`}
  </div>` : ''}`;
}

/* ---------------- RESSOURCES (livres, audios attribués aux étudiants) ---------------- */
function aResources(u) {
  const students = S.users.filter(x => x.role === 'student');
  const nameOf = id => { const st = getUser(id); return st ? st.name.split(' ')[0] : '?'; };
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Ressources pédagogiques</h1>
    <p>Livres (PDF) et livres audio attribués <b>par étudiant ou à tous les étudiants</b>. Saisissez le titre, téléversez le fichier (PDF ou pistes audio) et la couverture : l’étudiant voit la ressource prête à lire ou écouter.</p></div>
    <button class="btn btn-primary btn-sm" onclick="resourceModal()">${icon('plus', 14)} Ajouter une ressource</button></div>
  ${S.resources.length ? `<div class="grid grid-cards">${S.resources.map(r => `
    <div class="card card-pad">
      <div class="row">
        <div class="bk-cover" style="width:64px;height:64px;flex:none;border-radius:10px">${r.cover ? `<img src="${r.cover}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">` : icon(r.type === 'book' ? 'book' : 'headset', 22)}</div>
        <div class="wrap"><b>${esc(r.title)}</b>
          <div class="xs muted mt4">${r.type === 'book' ? `Livre · ${r.pages} pages${r.pdfName ? ' · ' + esc(r.pdfName) : ''}` : `Livre audio · ${r.audioCount || 'pistes'} piste(s)${r.duration ? ' · ' + esc(r.duration) : ''}`}</div>
          <div class="xs mt4">${r.assignedTo.length ? r.assignedTo.map(id => `<span class="badge b-grey" style="margin:1px">${esc(nameOf(id))}</span>`).join(' ') : '<span class="badge b-violet">Tous les étudiants</span>'}</div>
        </div>
      </div>
      <div class="row mt12" style="gap:6px">
        <button class="btn btn-sm" onclick="resourceModal('${r.id}')">${icon('edit', 13)} Modifier</button>
        <button class="btn btn-sm btn-danger" onclick="delResource('${r.id}')">${icon('trash', 13)}</button>
      </div>
    </div>`).join('')}</div>`
  : emptyState('doc', 'Aucune ressource', 'Ajoutez un livre PDF ou un livre audio, puis attribuez-le aux étudiants concernés.')}`;
}

let RES_TMP = { cover: null, pdfName: null, pdf: null, tracks: null };
function resourceModal(id) {
  const r = id ? S.resources.find(x => x.id === id) : null;
  RES_TMP = { cover: r ? r.cover : null, pdfName: r ? r.pdfName : null, pdf: r ? r.pdf : null, tracks: r ? r.tracks : null };
  const students = S.users.filter(x => x.role === 'student');
  const all = !r || !r.assignedTo.length;
  openModal({
    title: r ? 'Modifier la ressource' : 'Ajouter une ressource',
    body: `
      <div class="field"><label>Type</label>
        <select class="inp" id="rzType" onchange="resTypeChange()">
          <option value="book" ${!r || r.type === 'book' ? 'selected' : ''}>Livre (PDF)</option>
          <option value="audio" ${r && r.type === 'audio' ? 'selected' : ''}>Livre audio</option>
        </select></div>
      <div class="field"><label>Titre</label>
        <input class="inp" id="rzTitle" value="${r ? esc(r.title) : ''}" placeholder="Ex. L’Art de parler en public"></div>
      <div class="field" id="rzPdfBox" style="display:${!r || r.type === 'book' ? 'block' : 'none'}"><label>Fichier PDF</label>
        <input type="file" accept="application/pdf" class="inp" onchange="resPdf(this)">
        <div class="hint" id="rzPdfHint">${r && r.pdfName ? 'Fichier actuel : ' + esc(r.pdfName) : 'Choisissez le fichier PDF à téléverser.'}</div></div>
      <div class="field" id="rzAudioBox" style="display:${r && r.type === 'audio' ? 'block' : 'none'}"><label>Pistes audio</label>
        <input type="file" accept="audio/*" multiple class="inp" onchange="resAudios(this)">
        <div class="hint" id="rzAudioHint">${r && r.audioCount ? r.audioCount + ' piste(s) déjà ajoutée(s)' : 'Ajoutez un ou plusieurs fichiers audio : ils formeront le livre audio côté étudiant.'}</div></div>
      <div class="field"><label>Couverture (image)</label>
        <input type="file" accept="image/*" class="inp" onchange="resCover(this)">
        <div class="hint">Facultatif — sans couverture, un visuel élégant est généré.</div></div>
      <div class="field"><label>Attribution</label>
        <div class="row" style="gap:6px;margin-bottom:8px">
          <button type="button" class="btn btn-sm ${all ? 'btn-primary' : ''}" id="rzAll" onclick="resScope(true)">Tous les étudiants</button>
          <button type="button" class="btn btn-sm ${all ? '' : 'btn-primary'}" id="rzSome" onclick="resScope(false)">Par étudiant</button>
        </div>
        <div id="rzStuList" style="display:${all ? 'none' : 'block'};max-height:180px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:10px">
          ${students.map(st => `<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;cursor:pointer;font-size:13px">
            <input type="checkbox" class="rz-stu" value="${st.id}" ${r && r.assignedTo.includes(st.id) ? 'checked' : ''}> ${esc(st.name)} <span class="xs faint">(${esc(st.email)})</span></label>`).join('') || '<div class="xs muted">Aucun étudiant inscrit pour l’instant.</div>'}
        </div>
        <div class="hint">« Par étudiant » : cochez chaque étudiant qui doit recevoir cette ressource.</div></div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveResource('${id || ''}')">${icon('check', 14)} Enregistrer</button>`
  });
}
function resTypeChange() {
  const t = document.getElementById('rzType').value;
  document.getElementById('rzPdfBox').style.display = t === 'book' ? 'block' : 'none';
  document.getElementById('rzAudioBox').style.display = t === 'audio' ? 'block' : 'none';
}
function resScope(all) {
  document.getElementById('rzStuList').style.display = all ? 'none' : 'block';
  document.getElementById('rzAll').className = 'btn btn-sm ' + (all ? 'btn-primary' : '');
  document.getElementById('rzSome').className = 'btn btn-sm ' + (all ? '' : 'btn-primary');
}
function resPdf(inp) {
  const f = inp.files[0]; if (!f) return;
  if (!f.name.toLowerCase().endsWith('.pdf')) return toast('Le fichier doit être un PDF', 'err', 'doc');
  if (f.size > 4 * 1024 * 1024) return toast('PDF trop lourd pour la démo (4 Mo max). En production : stockage R2.', 'err', 'doc');
  const rd = new FileReader();
  rd.onload = e => {
    RES_TMP.pdf = e.target.result; RES_TMP.pdfName = f.name;
    document.getElementById('rzPdfHint').innerHTML = 'Fichier prêt : <b>' + esc(f.name) + '</b> ✓';
    const ti = document.getElementById('rzTitle');
    if (!ti.value.trim()) ti.value = f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    toast('PDF ajouté ✓', 'ok', 'doc');
  };
  rd.readAsDataURL(f);
}
function resAudios(inp) {
  const files = Array.from(inp.files); if (!files.length) return;
  const tooBig = files.find(f => f.size > 6 * 1024 * 1024);
  if (tooBig) return toast('Piste trop lourde pour la démo (6 Mo max par piste). En production : R2.', 'err', 'headset');
  const tracks = [];
  let done = 0;
  files.forEach((f, i) => {
    const rd = new FileReader();
    rd.onload = e => {
      tracks[i] = { name: f.name.replace(/\.[a-z0-9]+$/i, ''), url: e.target.result };
      if (++done === files.length) {
        RES_TMP.tracks = tracks.filter(Boolean);
        RES_TMP.audioCount = RES_TMP.tracks.length;
        document.getElementById('rzAudioHint').innerHTML = '<b>' + RES_TMP.tracks.length + ' piste(s)</b> prête(s), dans l’ordre ✓';
        toast(RES_TMP.tracks.length + ' piste(s) audio ajoutée(s) ✓', 'ok', 'headset');
      }
    };
    rd.readAsDataURL(f);
  });
}
function resCover(inp) {
  const f = inp.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = e => { RES_TMP.cover = e.target.result; toast('Couverture prête ✓', 'ok', 'image'); };
  rd.readAsDataURL(f);
}
function saveResource(id) {
  const title = document.getElementById('rzTitle').value.trim();
  if (!title) return toast('Titre requis', 'err');
  const type = document.getElementById('rzType').value;
  const forAll = document.getElementById('rzStuList').style.display === 'none';
  const assigned = forAll ? [] : Array.from(document.querySelectorAll('.rz-stu:checked')).map(c => c.value);
  if (!forAll && !assigned.length) return toast('Cochez au moins un étudiant, ou choisissez « Tous les étudiants »', 'err');
  if (type === 'book' && !RES_TMP.pdfName && !id) return toast('Ajoutez le fichier PDF avant d’enregistrer', 'err', 'doc');
  if (id) {
    const r = S.resources.find(x => x.id === id);
    Object.assign(r, { title, type, assignedTo: assigned, cover: RES_TMP.cover || r.cover, pdfName: RES_TMP.pdfName || r.pdfName, pdf: RES_TMP.pdf || r.pdf, tracks: RES_TMP.tracks || r.tracks, audioCount: (RES_TMP.tracks || r.tracks || []).length || r.audioCount });
  } else {
    S.resources.push({ id: uid(), type, title, pages: type === 'book' ? 24 : undefined, duration: type === 'audio' ? '12:00' : undefined, cover: RES_TMP.cover, pdfName: RES_TMP.pdfName, pdf: RES_TMP.pdf, tracks: RES_TMP.tracks, audioCount: (RES_TMP.tracks || []).length || RES_TMP.audioCount, assignedTo: assigned, trainingId: null });
  }
  assigned.forEach(uidv => notify(uidv, 'info', 'Nouvelle ressource disponible', `« ${title} » a été ajouté(e) à vos ressources.`));
  recordAudit('resource_' + (id ? 'update' : 'create'), { title, type });
  save(); closeModal(); render();
  toast(id ? 'Ressource mise à jour' : 'Ressource ajoutée', 'ok', 'doc');
}
function delResource(id) {
  const r = S.resources.find(x => x.id === id); if (!r) return;
  confirmModal(`Supprimer « ${esc(r.title)} » ?`, 'La ressource disparaîtra immédiatement du campus des étudiants concernés.', 'Supprimer', true).then(v => {
    if (!v) return;
    S.resources = S.resources.filter(x => x.id !== id);
    save(); render(); toast('Ressource supprimée', '', 'trash');
  });
}

/* ---------------- E-MAILS : modèles + tests d'envoi ---------------- */
const MAIL_TEMPLATES = [
  ['bienvenue', 'Bienvenue à Davar Académie 🎓', 'Votre compte est prêt : découvrez votre campus et votre première formation.'],
  ['invitation-staff', 'Invitation à rejoindre l’équipe (valable 7 jours)', 'Un lien de configuration unique, valable 7 jours.'],
  ['grace-etudiant', 'Accès gracieux offert (lien valable 3 jours)', 'Un étudiant bénéficie d’un accès gratuit offert par l’académie.'],
  ['reset-mdp', 'Réinitialisation de votre mot de passe', 'Lien à usage unique, valable 30 minutes.'],
  ['suspension', 'Votre compte est suspendu', 'Notification de suspension avec contact du support.'],
  ['reactivation', 'Votre compte est réactivé ✓', 'L’accès au campus est de nouveau actif.'],
  ['certificat-pret', 'Votre certificat est prêt 🏅', 'Émis après validation humaine, avec lien de vérification.'],
  ['demande-certificat', 'Votre demande de certificat est reçue', 'Accusé de réception avant vérification manuelle.'],
  ['paiement-confirme', 'Paiement confirmé : formation activée', 'La formation est débloquée sur le compte existant.'],
  ['motivation', 'Votre dose de motivation du dimanche ✨', 'Message de motivation hebdomadaire (push + e-mail).']
];
function aEmails(u) {
  const sent = S.auditLog.filter(a => a.action === 'mail' || a.action === 'mail_test').slice(0, 12);
  const live = !!S.settings.appscript.mailUrl;
  return `
  <div class="page-head"><div><h1 style="font-size:19px">E-mails</h1>
    <p>Tous les e-mails envoyés par la plateforme : bienvenue, invitations, révocations, certificats… Testez chaque modèle avant la mise en production.</p></div>
    <span class="badge ${live ? 'b-green' : 'b-gold'}">${live ? icon('checkCircle', 12) + ' Envoi réel configuré (Apps Script)' : icon('clock', 12) + ' Mode simulation — renseignez l’URL dans Configuration'}</span></div>
  ${live ? '' : `<div class="banner info mb16" style="text-align:left">${icon('mail', 14)}<span class="small"><b>Pourquoi les e-mails de test n’arrivent pas encore :</b> tant que l’URL de votre Apps Script (Configuration → Intégrations) n’est pas renseignée, la plateforme <b>journalise</b> les e-mails sans les expédier. Collez l’URL de votre Web App Apps Script (guide : <span class="kbd">config/email-routing.md</span>) et chaque test partira réellement depuis vos adresses @davarcampus.co.</span></div>`}

  <div class="card card-pad mb16">
    <div class="eyebrow mb8">Tester un modèle</div>
    <div class="row mb8" style="gap:8px;flex-wrap:wrap">
      <input class="inp" id="mailTo" value="${esc(u.email)}" style="min-width:260px" placeholder="destinataire@exemple.com">
      <div class="xs muted wrap">L’e-mail de test part à l’adresse ci-contre — mettez la vôtre pour vérifier la réception.</div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px">
      ${MAIL_TEMPLATES.map(([id, subject, desc]) => `
      <div class="card" style="padding:12px 14px;border:1px solid var(--line)">
        <b style="font-size:13px">${esc(subject)}</b>
        <div class="xs muted mt4 mb8">${esc(desc)}</div>
        <button class="btn btn-sm" onclick="testMail('${id}')">${icon('send', 13)} Envoyer un test</button>
      </div>`).join('')}
    </div>
  </div>

  <div class="card card-pad mb16">
    <div class="eyebrow mb8">E-mail libre</div>
    <div class="row mb8" style="gap:8px;flex-wrap:wrap">
      <input class="inp" id="freeTo" placeholder="destinataire@exemple.com" style="min-width:220px">
      <input class="inp wrap" id="freeSubject" placeholder="Objet de l’e-mail" style="min-width:280px">
    </div>
    <div class="field"><label>Message</label>
      <textarea class="inp" id="freeBody" rows="5" placeholder="Écrivez ici le contenu de votre e-mail…"></textarea></div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <select class="inp" id="freeFrom" style="max-width:300px">
        ${[['infos@davarcampus.co', 'Infos (renseignements)'], ['support@davarcampus.co', 'Support (aide)'], ['contact@davarcampus.co', 'Contact (partenariats)'], ['direction@davarcampus.co', 'Direction (officiel)']].map(([v, l]) => `<option value="${v}">${l} — ${v}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-sm" onclick="freeMail()">${icon('send', 13)} Envoyer l’e-mail</button>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Derniers e-mails envoyés</h3></div>
    ${sent.length ? `<table class="tbl"><thead><tr><th>Destinataire</th><th>Objet</th><th>Type</th><th>Date</th></tr></thead><tbody>
      ${sent.map(a => `<tr><td class="xs">${esc(a.payload.to)}</td><td class="xs muted">${esc(a.payload.subject)}</td>
        <td>${a.action === 'mail_test' ? '<span class="badge b-violet">test</span>' : '<span class="badge b-grey">production</span>'}</td>
        <td class="xs muted">${new Date(a.at).toLocaleString('fr-FR')}</td></tr>`).join('')}
    </tbody></table>` : '<div style="padding:16px" class="xs muted">Aucun e-mail envoyé pour l’instant.</div>'}
  </div>`;
}
function testMail(tplId) {
  const to = document.getElementById('mailTo').value.trim();
  if (!to || !to.includes('@')) return toast('Adresse de destination invalide', 'err', 'mail');
  const tpl = MAIL_TEMPLATES.find(t => t[0] === tplId);
  recordAudit('mail_test', { to, subject: '[TEST] ' + tpl[1] });
  const url = S.settings.appscript.mailUrl;
  if (url) { try { fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ to, subject: '[TEST] ' + tpl[1], body: tpl[2] }) }).catch(() => { }); } catch (e) { } }
  save(); render();
  toast(url ? `E-mail de test envoyé à ${esc(to)} ✓` : `Simulé : « ${esc(tpl[1])} » → ${esc(to)}`, url ? 'ok' : 'gold', 'mail');
}
function freeMail() {
  const to = document.getElementById('freeTo').value.trim();
  const subject = document.getElementById('freeSubject').value.trim();
  const body = (document.getElementById('freeBody') || {}).value || '';
  const from = (document.getElementById('freeFrom') || {}).value || 'infos@davarcampus.co';
  if (!to || !to.includes('@')) return toast('Adresse de destination invalide', 'err', 'mail');
  if (!subject) return toast('Objet requis', 'err');
  if (!body.trim()) return toast('Écrivez d’abord le message de l’e-mail.', 'err', 'edit');
  sendMailSim(to, subject, { body, from });
  save(); render();
  toast(S.settings.appscript.mailUrl ? `E-mail envoyé à ${esc(to)} ✓` : `E-mail journalisé (mode simulation) — renseignez l’URL Apps Script dans Configuration pour l’envoi réel.`, S.settings.appscript.mailUrl ? 'ok' : 'gold', 'mail');
}

/* ---------------- GOOGLE SHEETS + TRANSFERT DE PROPRIÉTÉ ---------------- */
function toggleSheets(on) {
  S.settings.sheets = Object.assign({ enabled: false, apiKey: '', sheetId: '', freq: 'daily' }, S.settings.sheets || {}, { enabled: on });
  save(); render();
}
function saveSheets() {
  S.settings.sheets = Object.assign({ enabled: false, apiKey: '', sheetId: '', freq: 'daily' }, S.settings.sheets || {}, {
    apiKey: document.getElementById('shKey').value.trim(),
    sheetId: document.getElementById('shSheet').value.trim(),
    freq: document.getElementById('shFreq').value
  });
  save(); render(); toast('Synchronisation Google Sheets enregistrée', 'ok', 'grid');
}
function syncSheetsNow() {
  const sh = S.settings.sheets || {};
  if (!sh.apiKey || !sh.sheetId) return toast('Renseignez la clé API et l’ID du Google Sheets avant de synchroniser.', 'err', 'grid');
  S.settings.sheets.lastSync = Date.now();
  recordAudit('sheets_sync', { sheetId: sh.sheetId, rows: S.users.filter(x => x.role === 'student').length + S.sales.length });
  save(); render();
  toast('Google Sheets synchronisé : étudiants, ventes, progression, certifications et avis envoyés ✓', 'ok', 'grid');
}
function transferOwnership() {
  const email = document.getElementById('trEmail').value.trim().toLowerCase();
  const pwd = document.getElementById('trPwd').value || '';
  const me = getUser(S.session.userId);
  if (!email || !email.includes('@')) return toast('E-mail du nouveau propriétaire invalide.', 'err', 'alert');
  if (email === me.email) return toast('Vous êtes déjà propriétaire du campus.', 'err');
  if (me.password && me.password !== pwd) return toast('Mot de passe Super Admin incorrect.', 'err', 'lock');
  if (!me.password && pwd.length < 4) return toast('Saisissez votre mot de passe.', 'err', 'lock');
  confirmModal('Transférer la propriété du campus ?', `Le compte ${esc(email)} deviendra l’unique Super Administrateur après confirmation par e-mail. Vous resterez membre de l’équipe avec le rôle Manager.`, 'Initier le transfert', true).then(v => {
    if (!v) return;
    S.pendingTransfer = { to: email, at: Date.now(), from: me.email };
    sendFlow('ownership', email);
    recordAudit('ownership_transfer_init', { to: email });
    save(); render(); toast('E-mail de confirmation envoyé au nouveau propriétaire. Le transfert sera effectif après sa confirmation.', 'gold', 'shield');
  });
}
function cancelTransfer() {
  recordAudit('ownership_transfer_cancel', { to: S.pendingTransfer && S.pendingTransfer.to });
  S.pendingTransfer = null; save(); render(); toast('Transfert annulé.', '', 'x');
}

/* ---------------- EXPORTS (protégés par mot de passe + périodes) ---------------- */
function aExports(u) {
  const first = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Exports</h1>
    <p>Exportez vos données au format CSV (compatible Excel / Google Sheets). Chaque export est <b>protégé par votre mot de passe Super Admin</b> et journalisé.</p></div></div>
  <div class="card card-pad mb16">
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">
      <div class="field"><label>Jeu de données</label>
        <select class="inp" id="exData">
          <option value="tout">TOUT — toutes les données de la période</option>
          <option value="etudiants">Étudiants (comptes + formations)</option>
          <option value="ventes">Ventes & factures</option>
          <option value="certifications">Certifications</option>
          <option value="progression">Progression détaillée</option>
          <option value="recompenses">Récompenses attribuées</option>
          <option value="avis">Avis des étudiants</option>
          <option value="emails">Journal des e-mails</option>
        </select></div>
      <div class="field"><label>Du</label><input class="inp" type="date" id="exFrom" value="${first}"></div>
      <div class="field"><label>Au</label><input class="inp" type="date" id="exTo" value="${today}"></div>
      <div class="field"><label>Mot de passe Super Admin</label><input class="inp" type="password" id="exPwd" placeholder="••••••••"></div>
    </div>
    <button class="btn btn-primary mt8" onclick="runExport()">${icon('download', 15)} Générer le fichier CSV</button>
    <div class="row mt8" style="gap:8px;flex-wrap:wrap">
      <input class="inp" id="exMailTo" placeholder="Envoyer le fichier à : destinataire@exemple.com" style="min-width:280px">
      <button class="btn btn-sm" onclick="mailExport()" ${EXPORT_READY ? '' : 'disabled style="opacity:.45;cursor:not-allowed"'}>${icon('mail', 13)} Envoyer le CSV par e-mail</button>
    </div>
    <div class="xs faint mt8">Le téléchargement s’enregistre directement sur l’appareil. <b>L’envoi ne s’active qu’après « Générer le fichier CSV »</b> — un envoi par génération, et le fichier doit être régénéré si vous quittez cette page. L’envoi passe par vos adresses @davarcampus.co (Apps Script).</div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Historique des exports</h3></div>
    ${S.auditLog.filter(a => a.action === 'export').length ? `<table class="tbl"><thead><tr><th>Jeu de données</th><th>Période</th><th>Lignes</th><th>Par</th><th>Date</th></tr></thead><tbody>
      ${S.auditLog.filter(a => a.action === 'export').slice(0, 20).map(a => `<tr><td class="xs"><b>${esc(a.payload.data)}</b></td><td class="xs muted">${esc(a.payload.from)} → ${esc(a.payload.to)}</td><td class="xs">${a.payload.rows}</td><td class="xs muted">${esc(getUser(a.actor) ? getUser(a.actor).name : a.actor)}</td><td class="xs muted">${new Date(a.at).toLocaleString('fr-FR')}</td></tr>`).join('')}
    </tbody></table>` : '<div style="padding:16px" class="xs muted">Aucun export pour l’instant.</div>'}
  </div>`;
}
function csvQuote(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
function downloadCSV(name, rows) {
  const csv = '\uFEFF' + rows.map(r => r.map(csvQuote).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function buildExportRows(data, from, to) {
  const t0 = new Date(from).getTime(), t1 = new Date(to).getTime() + 86399000;
  const inRange = ts => ts >= t0 && ts <= t1;
  let rows = [], name = 'export';
  if (data === 'etudiants') {
    rows = [['Nom', 'E-mail', 'Téléphone', 'Statut', 'Inscrit le', 'Formations', 'Progression moyenne (%)', 'Certificats']];
    S.users.filter(x => x.role === 'student' && inRange(x.joined)).forEach(st => {
      const mine = myTrainings(st.id);
      const avg = mine.length ? Math.round(mine.reduce((a, t) => a + trainingProgress(st.id, t).pct, 0) / mine.length) : 0;
      rows.push([st.name, st.email, st.phone || '', st.status === 'suspended' ? 'suspendu' : 'actif', new Date(st.joined).toLocaleDateString('fr-FR'), mine.map(t => t.title).join(' | '), avg, S.certs.filter(c => c.userId === st.id).length]);
    });
    name = 'etudiants';
  } else if (data === 'ventes') {
    rows = [['Facture', 'Étudiant', 'Formation', 'Montant', 'Frais', 'Méthode', 'Statut', 'Date']];
    S.sales.filter(s => inRange(s.at)).forEach(s => { const t = getTraining(s.trainingId); const st = getUser(s.userId);
      rows.push(['FAC-' + s.id.slice(-6).toUpperCase(), st ? st.name : '', t ? t.title : '', s.amount, s.fee || 0, s.method, s.status, new Date(s.at).toLocaleDateString('fr-FR')]); });
    name = 'ventes_factures';
  } else if (data === 'certifications') {
    rows = [['Code', 'Étudiant', 'Formation', 'Émis le', 'Statut']];
    S.certs.filter(c => inRange(c.issuedAt || c.at)).forEach(c => { const t = getTraining(c.trainingId); const st = getUser(c.userId);
      rows.push([c.code, st ? st.name : '', t ? t.title : '', new Date(c.issuedAt || c.at).toLocaleDateString('fr-FR'), c.status]); });
    name = 'certifications';
  } else if (data === 'progression') {
    rows = [['Étudiant', 'Formation', 'Progression (%)', 'Modules terminés', 'Dernière activité']];
    S.users.filter(x => x.role === 'student').forEach(st => myTrainings(st.id).forEach(t => {
      const pr = trainingProgress(st.id, t);
      rows.push([st.name, t.title, pr.pct, pr.done || '', S.pedLast[st.id] ? new Date(S.pedLast[st.id]).toLocaleDateString('fr-FR') : '']);
    }));
    name = 'progression';
  } else if (data === 'recompenses') {
    rows = [['Étudiant', 'Distinction', 'Date', 'Source', 'Mode']];
    S.rewards.filter(r => inRange(r.at)).forEach(r => { const st = getUser(r.userId); const d = REWARD_DEFS[r.badgeId];
      rows.push([st ? st.name : '', d ? d.name : r.badgeId, new Date(r.at).toLocaleDateString('fr-FR'), r.source || '', r.mode]); });
    name = 'recompenses';
  } else if (data === 'avis') {
    rows = [['Étudiant', 'Cible', 'Mots', 'Audio transcrit', 'Statut', 'Mis en avant', 'Avis']];
    S.reviews.filter(rv => inRange(rv.at)).forEach(rv => { const st = getUser(rv.userId); const t = rv.trainingId ? getTraining(rv.trainingId) : null;
      rows.push([st ? st.name : '', rv.targetType === 'platform' ? 'Plateforme' : (t ? t.title : 'Formation'), rv.words, rv.audio ? 'oui' : 'non', rv.status === 'published' ? 'publié' : 'en validation', rv.spotlight ? 'oui' : 'non', rv.text]); });
    name = 'avis';
  } else {
    rows = [['Destinataire', 'Objet', 'Type', 'Date']];
    S.auditLog.filter(a => (a.action === 'mail' || a.action === 'mail_test') && inRange(a.at)).forEach(a =>
      rows.push([a.payload.to, a.payload.subject, a.action === 'mail_test' ? 'test' : 'production', new Date(a.at).toLocaleDateString('fr-FR')]));
    name = 'emails';
  }
  return { rows, name };
}
const EXPORT_SETS = ['etudiants', 'ventes', 'certifications', 'progression', 'recompenses', 'avis', 'emails'];
function exportPwdOK() {
  const pwd = document.getElementById('exPwd').value || '';
  const me = getUser(S.session.userId);
  if (me.password && me.password !== pwd) { toast('Mot de passe incorrect — export refusé.', 'err', 'lock'); return false; }
  if (!me.password && pwd.length < 4) { toast('Saisissez votre mot de passe pour déverrouiller l’export.', 'err', 'lock'); return false; }
  return true;
}
/* Fichier prêt à envoyer : activé par « Générer », consommé par l’envoi, détruit en quittant la page Exports */
let EXPORT_READY = null;
function runExport() {
  const data = document.getElementById('exData').value;
  const from = document.getElementById('exFrom').value, to = document.getElementById('exTo').value;
  if (!exportPwdOK()) return;
  if (data === 'tout') {
    let n = 0;
    EXPORT_SETS.forEach((d, i) => {
      const r = buildExportRows(d, from, to);
      if (r.rows.length > 1) { n++; setTimeout(() => downloadCSV(`davar_${r.name}_${from}_${to}.csv`, r.rows), (i + 1) * 450); }
    });
    if (!n) return toast('Aucune donnée sur cette période.', 'err', 'calendar');
    recordAudit('export', { data: 'tout', from, to, rows: n + ' fichiers' });
    EXPORT_READY = { data, from, to, at: Date.now() };
    save(); render();
    toast(`Export complet : ${n} fichier(s) CSV téléchargé(s) sur cet appareil ✓ — vous pouvez maintenant l’envoyer à un destinataire.`, 'ok', 'download');
    return;
  }
  const r = buildExportRows(data, from, to);
  if (r.rows.length <= 1) return toast('Aucune donnée sur cette période.', 'err', 'calendar');
  downloadCSV(`davar_${r.name}_${from}_${to}.csv`, r.rows);
  recordAudit('export', { data, from, to, rows: r.rows.length - 1 });
  EXPORT_READY = { data, from, to, at: Date.now() };
  save(); render();
  toast(`Export généré : ${r.rows.length - 1} ligne(s) ✓ — vous pouvez maintenant l’envoyer à un destinataire.`, 'ok', 'download');
}
/* Envoyer le CSV généré par e-mail (adresse expéditeur de rôle, court message d'accompagnement) */
function mailExport() {
  if (!EXPORT_READY) return toast('Générez d’abord le fichier CSV — l’envoi n’est possible qu’après une génération.', 'err', 'download');
  const data = EXPORT_READY.data;
  const from = EXPORT_READY.from, to = EXPORT_READY.to;
  if (!exportPwdOK()) return;
  const toMail = document.getElementById('exMailTo').value.trim();
  if (!toMail || !toMail.includes('@')) return toast('Adresse du destinataire invalide.', 'err', 'mail');
  const sets = data === 'tout' ? EXPORT_SETS : [data];
  let content = '', lines = 0;
  sets.forEach(d => {
    const r = buildExportRows(d, from, to);
    if (r.rows.length > 1) { content += (content ? '\r\n\r\n' : '') + '### ' + r.name + '\r\n' + r.rows.map(x => x.map(csvQuote).join(';')).join('\r\n'); lines += r.rows.length - 1; }
  });
  if (!lines) return toast('Aucune donnée sur cette période.', 'err', 'calendar');
  const me = getUser(S.session.userId);
  sendMailSim(toMail, `Vos données Davar Académie (${from} → ${to})`, {
    body: 'Bonjour,\n\nVoici le fichier de données demandé (' + (data === 'tout' ? 'toutes les données' : data) + ') pour la période du ' + from + ' au ' + to + '.\n\nCordialement,\n' + me.name + ' — Davar Académie',
    from: 'infos@davarcampus.co',
    csv: { name: `davar_${data}_${from}_${to}.csv`, content }
  });
  EXPORT_READY = null;   /* un seul envoi par fichier généré */
  save(); render();
  toast(S.settings.appscript.mailUrl ? `Fichier envoyé à ${esc(toMail)} ✓ — régénérez un fichier pour un nouvel envoi.` : 'E-mail journalisé (mode simulation) — URL Apps Script requise pour l’envoi réel. Régénérez un fichier pour un nouvel envoi.', S.settings.appscript.mailUrl ? 'ok' : 'gold', 'mail');
}


/* ---------------- CYCLE DE VIE DES COMPTS (1 an max, traces conservées) ---------------- */
/* Délégation : le cycle de vie des comptes est géré par le
   DAVAR DATA LIFECYCLE & PURGE ENGINE (décision unique et coordonnée). */
function purgeExpiredAccounts() {
  if (typeof lcAccountLifecycle === 'function') {
    const r = lcAccountLifecycle();
    save();
    return (r.pending || 0) + (r.executed || 0);
  }
  return 0;
}
function saveTtl() {
  const v = parseInt(document.getElementById('ttlDays').value, 10) || 365;
  S.accountTtlDays = Math.max(30, v);
  lcCfg().accountGraceMonths = Math.max(1, Math.round(S.accountTtlDays / 30));
  save(); render(); toast(`Durée de conservation : ${S.accountTtlDays} jours après la fin de la dernière formation, sans nouvelle acquisition.`, 'ok', 'clock');
}

/* ---------------- AVIS : modération + spotlight ---------------- */
function aAvis(u) {
  const all = S.reviews.slice();
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Avis des étudiants</h1>
    <p>Avis obligatoires : plateforme après 2 semaines, formation après 1 mois. 1000 mots maximum, écrit ou audio transcrit. Les avis mis en avant (✦) apparaissent dans le catalogue.</p></div></div>
  ${all.length ? all.map(r => { const st = getUser(r.userId); const t = r.trainingId ? getTraining(r.trainingId) : null; return `
    <div class="card card-pad mb8">
      <div class="row between">
        <div class="row">${st ? avatarHTML(st, 'sm') : ''}<div><b class="small">${st ? esc(st.name) : '—'}</b>
          <div class="xs muted">${r.targetType === 'platform' ? 'Plateforme DAVAR' : esc(t ? t.title : 'Formation')} · ${r.words} mots ${r.audio ? '· audio transcrit' : ''} · ${new Date(r.at).toLocaleDateString('fr-FR')}</div></div></div>
        <div class="row" style="gap:6px">
          ${r.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="reviewSet('${r.id}','published')">${icon('check', 13)} Publier</button>` : `<button class="btn btn-sm" onclick="reviewSet('${r.id}','pending')">${icon('eye', 13)} Retirer</button>`}
          <button class="btn btn-sm ${r.spotlight ? 'btn-gold' : ''}" onclick="reviewSpotlight('${r.id}')" title="Mettre en avant dans le catalogue">${icon('star', 13)} ✦</button>
          <button class="btn btn-sm btn-danger" onclick="reviewDelete('${r.id}')">${icon('trash', 13)}</button>
        </div>
      </div>
      <p class="small muted mt8" style="white-space:pre-wrap">${esc(r.text)}</p>
    </div>`; }).join('') : emptyState('star', 'Aucun avis pour l’instant', 'Les premiers avis arrivent après deux semaines de campus.')}`;
}
function reviewSet(id, status) {
  const r = S.reviews.find(x => x.id === id); if (!r) return;
  r.status = status; if (status !== 'published') r.spotlight = false;
  save(); render(); toast(status === 'published' ? 'Avis publié ✓' : 'Avis retiré.', 'ok', 'star');
}
function reviewSpotlight(id) {
  const r = S.reviews.find(x => x.id === id); if (!r) return;
  if (r.status !== 'published') return toast('Publiez d’abord cet avis pour pouvoir le mettre en avant.', 'err', 'star');
  r.spotlight = !r.spotlight;
  save(); render(); toast(r.spotlight ? 'Avis mis en avant dans le catalogue ✦' : 'Mise en avant retirée.', 'gold', 'star');
}
function reviewDelete(id) {
  confirmModal('Supprimer cet avis ?', 'L’avis sera définitivement supprimé.', 'Supprimer', true).then(v => {
    if (!v) return;
    S.reviews = S.reviews.filter(x => x.id !== id);
    save(); render(); toast('Avis supprimé.', '', 'trash');
  });
}

/* ---------------- PALETTES & ESPACE DÉVELOPPEUR ---------------- */
/* Chaque palette redéfinit TOUTE l'identité : principale (ex-violet), secondaire, premium (ex-or). */
const PALETTES = {
  violet:   { label: 'Violet & Or (signature DAVAR)', p: '#6D28D9', s: '#8B5CF6', a: '#C9A24B' },
  indigo:   { label: 'Indigo & Or',                   p: '#4338CA', s: '#6366F1', a: '#C9A24B' },
  foret:    { label: 'Vert forêt & Or',               p: '#166534', s: '#22A05A', a: '#C9A24B' },
  bordeaux: { label: 'Bordeaux & Or',                 p: '#9F1239', s: '#E11D48', a: '#C9A24B' },
  ocean:    { label: 'Bleu océan & Cuivre',           p: '#0E5A8A', s: '#1E88C7', a: '#B87333' },
  prune:    { label: 'Prune & Argent',                p: '#6B21A8', s: '#A855F7', a: '#9CA3AF' },
  olive:    { label: 'Olive & Terracotta',            p: '#4D5D2A', s: '#7A8B3F', a: '#C4652E' },
  nuit:     { label: 'Encre & Émeraude',              p: '#1F2937', s: '#374151', a: '#10B981' }
};
/* Brouillon de palette : RIEN n’est appliqué ni sauvegardé tant que « Enregistrer » n’est pas pressé. */
let PAL_DRAFT = null, PALC_DRAFT = null;
const palDraft = () => PAL_DRAFT || S.palette || 'violet';
const palcDraft = () => PALC_DRAFT || S.paletteCustom || {};
function selectPal(k) {
  PAL_DRAFT = k; render();
  toast(k === 'custom' ? 'Composez votre palette, puis appuyez sur « Enregistrer » pour l’appliquer.' : 'Palette sélectionnée : ' + PALETTES[k].label + ' — appuyez sur « Enregistrer » pour l’appliquer.', '', 'sparkles');
}
function palRgb(hex) { const h = String(hex).replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function palToHex(rgb) { return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function palMix(a, b, pct) { const A = palRgb(a), B = palRgb(b); return palToHex(A.map((v, i) => v + (B[i] - v) * pct / 100)); }
function palLum(hex) {
  const h = String(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function palShade(hex, pct) { return palMix(hex, pct < 0 ? '#000000' : '#FFFFFF', Math.abs(pct)); }
function savePalCustom(isGradToggle) {
  const ins = document.querySelectorAll('.pal-picker input[type="color"]');
  const base = palcDraft();
  const grad = isGradToggle ? !(base.grad || false) : (base.grad || false);
  PALC_DRAFT = { p: ins[0] ? ins[0].value : '#6D28D9', s: ins[1] ? ins[1].value : '#8B5CF6', a: ins[2] ? ins[2].value : '#C9A24B', grad };
  PAL_DRAFT = 'custom'; render();
}
/* « Enregistrer » de la Configuration : SEUL point de sauvegarde (plateforme + palette) */
function saveSettingsAll() {
  const pf = document.getElementById('setPlatform'); if (pf) S.settings.platform = pf.value;
  if (PAL_DRAFT) {
    S.palette = PAL_DRAFT;
    if (PAL_DRAFT === 'custom') S.paletteCustom = Object.assign({}, S.paletteCustom || {}, PALC_DRAFT || {});
    applyPalette();
  }
  PAL_DRAFT = null; PALC_DRAFT = null;
  save(); render(); toast('Paramètres enregistrés ✓', 'ok', 'check');
}
function applyPalette() {
  const root = document.documentElement;
  root.setAttribute('data-palette', S.palette || 'violet');
  ['--violet', '--violet2', '--violet-deep', '--violet-soft', '--violet-line', '--gold', '--gold2', '--gold-soft', '--gold-line', '--grad', '--grad-dark',
    '--ink', '--ink2', '--ink3', '--bg', '--card', '--line', '--nav-bg'].forEach(v => root.style.removeProperty(v));
  if (S.palette === 'custom' && S.paletteCustom) {
    const c = S.paletteCustom;
    const P = c.p || '#6D28D9', SX = c.s || '#8B5CF6', A = c.a || '#C9A24B';
    const dark = root.getAttribute('data-theme') === 'dark';
    root.style.setProperty('--violet', P);
    root.style.setProperty('--violet2', SX);
    root.style.setProperty('--violet-deep', palShade(P, -25));
    root.style.setProperty('--violet-soft', dark ? palShade(P, -82) : palMix(P, '#FFFFFF', 88));
    root.style.setProperty('--violet-line', dark ? palShade(P, -62) : palMix(P, '#FFFFFF', 72));
    root.style.setProperty('--gold', A);
    root.style.setProperty('--gold2', palMix(A, '#FFFFFF', 25));
    root.style.setProperty('--gold-soft', dark ? palShade(A, -80) : palMix(A, '#FFFFFF', 88));
    root.style.setProperty('--gold-line', dark ? palShade(A, -60) : palMix(A, '#FFFFFF', 70));
    /* Encres du menu de navigation : toujours la palette choisie, lisibles en clair comme en sombre */
    root.style.setProperty('--ink', palShade(P, -88));
    root.style.setProperty('--ink2', palShade(P, -80));
    root.style.setProperty('--ink3', palShade(P, -70));
    /* Menu de navigation : toujours la couleur PRINCIPALE (assombrie si elle est trop claire pour du texte blanc) */
    root.style.setProperty('--nav-bg', palLum(P) > 0.45 ? palShade(P, -35) : P);
    /* Mode clair : fond blanc profond, cartes à contour principal */
    if (!dark) {
      root.style.setProperty('--bg', '#FFFFFF');
      root.style.setProperty('--card', '#FFFFFF');
      root.style.setProperty('--line', palMix('#FFFFFF', P, 18));
    }
    root.style.setProperty('--grad', `linear-gradient(135deg, ${palShade(P, -18)} 0%, ${P} 55%, ${SX} 100%)`);
    root.style.setProperty('--grad-dark', c.grad
      ? `linear-gradient(160deg, ${palShade(P, -80)} 0%, ${palShade(P, -60)} 60%, ${palShade(SX, -45)} 100%)`
      : 'linear-gradient(160deg,#0A0A0C 0%,#131316 60%,#1B1B21 100%)');
  }
}
function setManagerViewAs(v) {
  S.settings.managerViewAs = !!v; save();
  recordAudit('settings', { managerViewAs: !!v });
  render();
  toast(v ? 'Test de vue ACTIVÉ chez le Manager : toutes les vues sauf la vôtre.' : 'Test de vue désactivé chez le Manager.', v ? 'ok' : 'gold', 'eye');
}
function setProductionMode(v) {
  S.settings.productionMode = !!v; save(); render();
  toast(v ? 'Mode production ACTIVÉ : comptes de démonstration masqués à la connexion.' : 'Mode pré-production : comptes de démonstration visibles pour les tests.', v ? 'ok' : 'gold', 'shield');
  recordAudit('production_mode', { on: !!v });
}
function genApiKey() {
  const rnd = () => Math.random().toString(36).slice(2, 10);
  const key = 'davar_live_' + rnd() + rnd().slice(0, 4);
  S.apiKeys = S.apiKeys || [];
  S.apiKeys.unshift({ id: uid(), key, at: Date.now(), revoked: false });
  recordAudit('api_key_created', { key: key.slice(0, 16) + '…' });
  save(); render(); toast('Clé API créée — copiez-la maintenant, elle ne sera plus montrée en clair.', 'gold', 'key');
}
function revokeApiKey(id) {
  const k = (S.apiKeys || []).find(x => x.id === id); if (!k) return;
  confirmModal('Révoquer cette clé API ?', 'Les applications qui l’utilisent perdront immédiatement l’accès.', 'Révoquer', true).then(v => {
    if (!v) return;
    k.revoked = true; recordAudit('api_key_revoked', { key: k.key.slice(0, 16) + '…' });
    save(); render(); toast('Clé révoquée.', '', 'x');
  });
}

/* ---------------- ENRICHISSEMENT SILENCIEUX D'UN MODULE ---------------- */
function enrichModal(tid, cid, mid) {
  const m = getTraining(tid).chapters.find(c => c.id === cid).modules.find(x => x.id === mid);
  openModal({ title: 'Enrichir — ' + esc(m.title), body: `
    <div class="eyebrow mb8">Vidéos complémentaires (${m.extraVideos.length})</div>
    ${m.extraVideos.map((v, i) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)">
      <span class="small">${icon('video', 12)} <b>${esc(v.title)}</b> <span class="xs faint">${v.duration} · ${v.ratio}</span></span>
      <button class="icon-btn" onclick="delExtraVideo('${tid}','${cid}','${mid}',${i})">${icon('trash', 13)}</button></div>`).join('') || '<div class="xs faint">Aucune pour l’instant.</div>'}
    <div class="grid" style="grid-template-columns:2fr 1fr 1fr 2fr;gap:8px;margin-top:10px">
      <div class="field"><label>Titre</label><input class="inp" id="xvTitle"></div>
      <div class="field"><label>Durée</label><input class="inp" id="xvDur" value="5:00"></div>
      <div class="field"><label>Format</label><select class="inp" id="xvRatio">${['16:9','9:16','4:3','1:1'].map(r => `<option>${r}</option>`).join('')}</select></div>
      <div class="field"><label>URL vidéo</label><input class="inp" id="xvUrl" placeholder="https://…"></div>
    </div>
    <button class="btn btn-sm" onclick="addExtraVideo('${tid}','${cid}','${mid}')">${icon('plus', 13)} Ajouter la vidéo complémentaire</button>
    <div class="eyebrow mb8 mt16">Ressources (${m.resources.length})</div>
    ${m.resources.map((rs, i) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)">
      <span class="small">${icon('file', 12)} <b>${esc(rs.name)}</b> <span class="xs faint">${rs.type} · ${rs.size}</span></span>
      <button class="icon-btn" onclick="delModuleResource('${tid}','${cid}','${mid}',${i})">${icon('trash', 13)}</button></div>`).join('') || '<div class="xs faint">Aucune pour l’instant.</div>'}
    <div class="grid" style="grid-template-columns:2fr 1fr 1fr 2fr;gap:8px;margin-top:10px">
      <div class="field"><label>Nom</label><input class="inp" id="rsName" placeholder="Ex. Checklist (PDF)"></div>
      <div class="field"><label>Type</label><select class="inp" id="rsType"><option value="pdf">PDF</option><option value="doc">Document</option><option value="img">Image</option><option value="video">Vidéo</option></select></div>
      <div class="field"><label>Taille</label><input class="inp" id="rsSize" placeholder="1,2 Mo"></div>
      <div class="field"><label>URL (vidéo : YouTube / R2)</label><input class="inp" id="rsUrl" placeholder="https://…"></div>
    </div>
    <button class="btn btn-sm" onclick="addModuleResource('${tid}','${cid}','${mid}')">${icon('plus', 13)} Ajouter la ressource</button>
    <div class="hint mt8">Ces ajouts sont <b>silencieux</b> : aucune notification envoyée, aucune progression réinitialisée. Les étudiants déjà passés ne sont pas impactés ; les suivants trouvent le contenu enrichi.</div>`,
    foot: `<button class="btn btn-primary" onclick="closeModal()">Terminé</button>` });
}
function addExtraVideo(tid, cid, mid, i) {
  const title = document.getElementById('xvTitle').value.trim(); if (!title) return toast('Titre requis', 'err');
  const m = getTraining(tid).chapters.find(c => c.id === cid).modules.find(x => x.id === mid);
  m.extraVideos.push({ title, duration: document.getElementById('xvDur').value || '5:00', ratio: document.getElementById('xvRatio').value, url: document.getElementById('xvUrl').value.trim() });
  save('trainings'); render(); toast('Vidéo complémentaire ajoutée — en direct chez les étudiants', 'ok', 'video'); enrichModal(tid, cid, mid);
}
function delExtraVideo(tid, cid, mid, i) {
  const m = getTraining(tid).chapters.find(c => c.id === cid).modules.find(x => x.id === mid);
  m.extraVideos.splice(i, 1); save('trainings'); render(); enrichModal(tid, cid, mid);
}
function addModuleResource(tid, cid, mid) {
  const name = document.getElementById('rsName').value.trim(); if (!name) return toast('Nom requis', 'err');
  const m = getTraining(tid).chapters.find(c => c.id === cid).modules.find(x => x.id === mid);
  m.resources.push({ name, type: document.getElementById('rsType').value, size: document.getElementById('rsSize').value || '—', url: document.getElementById('rsUrl').value.trim() });
  save('trainings'); render(); toast('Ressource ajoutée — en direct chez les étudiants', 'ok', 'doc'); enrichModal(tid, cid, mid);
}
function delModuleResource(tid, cid, mid, i) {
  const m = getTraining(tid).chapters.find(c => c.id === cid).modules.find(x => x.id === mid);
  m.resources.splice(i, 1); save('trainings'); render(); enrichModal(tid, cid, mid);
}

/* ---------------- CRÉATEUR D'EXERCICE / ÉVALUATION ---------------- */
function qRowHTML(n, q) {
  q = q || {};
  return `<div class="qrow" style="border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:10px">
    <div class="row between"><b class="xs">Question ${n}</b><button class="icon-btn" onclick="this.closest('.qrow').remove();reNumberQ()">${icon('trash', 13)}</button></div>
    <div class="field mt4"><input class="inp q-txt" placeholder="Intitulé de la question" value="${esc(q.text || '')}"></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">
      ${[1, 2, 3, 4].map(i => `<div class="row" style="gap:6px"><input type="radio" name="qc-${n}-${Math.random().toString(36).slice(2, 7)}" value="${i - 1}" ${(q.correct || 0) === i - 1 ? 'checked' : i === 1 && !q.correct ? 'checked' : ''}><input class="inp q-opt" placeholder="Réponse ${i}" value="${esc((q.options || [])[i - 1] || '')}"></div>`).join('')}
    </div><div class="xs faint mt4">Cochez la bonne réponse.</div></div>`;
}
function addQRow() { const box = document.getElementById('qRows'); const d = document.createElement('div'); d.innerHTML = qRowHTML(box.children.length + 1); box.appendChild(d.firstChild); }
function reNumberQ() { [...document.getElementById('qRows').children].forEach((r, i) => { r.querySelector('b').textContent = 'Question ' + (i + 1); }); }
function readQuestions() {
  const qs = [];
  [...document.getElementById('qRows').children].forEach(r => {
    const txt = r.querySelector('.q-txt').value.trim();
    const opts = [...r.querySelectorAll('.q-opt')].map(o => o.value.trim()).filter(Boolean);
    const checked = r.querySelector('input[type=radio]:checked');
    if (txt && opts.length >= 2) qs.push({ text: txt, options: opts, correct: checked ? +checked.value : 0 });
  });
  return qs;
}
function exerciseModal(tid, cid) {
  const ch = getTraining(tid).chapters.find(c => c.id === cid);
  openModal({ title: 'Exercice du chapitre — non bloquant', body: `
    <div class="field"><label>Titre de l’exercice</label><input class="inp" id="exTitle" value="${ch.exercise ? esc(ch.exercise.title) : ''}" placeholder="Ex. Mise en pratique"></div>
    <div id="qRows">${(ch.exercise ? ch.exercise.questions : []).map((qq, i) => qRowHTML(i + 1, qq)).join('')}</div>
    <button class="btn btn-sm" onclick="addQRow()">${icon('plus', 13)} Ajouter une question</button>
    <div class="hint mt8">L’exercice fait pratiquer sans bloquer : la progression de l’étudiant n’en dépend jamais.</div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="saveExercise('${tid}','${cid}')">${icon('clipboard', 13)} Enregistrer l’exercice</button>` });
  if (!document.getElementById('qRows').children.length) addQRow();
}
function saveExercise(tid, cid) {
  const title = document.getElementById('exTitle').value.trim(); if (!title) return toast('Titre requis', 'err');
  const questions = readQuestions(); if (!questions.length) return toast('Ajoutez au moins une question complète.', 'err');
  const ch = getTraining(tid).chapters.find(c => c.id === cid);
  ch.exercise = { id: (ch.exercise || {}).id || uid(), title, questions };
  save('trainings'); closeModal(); render(); toast('Exercice enregistré — visible en direct, progression intacte', 'ok', 'clipboard');
}
function evalModal(tid, cid) {
  const ch = getTraining(tid).chapters.find(c => c.id === cid);
  const a = ch.assessment;
  const fmtLabels = { video: 'Vidéo', audio: 'Audio', image: 'Photo', doc: 'Document' };
  const curFmts = a && a.type === 'submission' && Array.isArray(a.formats) && a.formats.length ? a.formats : ['video', 'audio', 'image', 'doc'];
  openModal({ title: 'Évaluation du chapitre — bloquante', body: `
    <div class="field"><label>Titre de l’évaluation</label><input class="inp" id="evTitle" value="${a ? esc(a.title) : ''}" placeholder="Ex. Contrôle des acquis"></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label>Type</label><select class="inp" id="evType" onchange="evTypeToggle()">
        <option value="quiz" ${!a || a.type === 'quiz' ? 'selected' : ''}>Quiz noté — QCM (score minimum)</option>
        <option value="submission" ${a && a.type === 'submission' ? 'selected' : ''}>Travail à soumettre — fichier (validation humaine)</option></select></div>
      <div class="field" id="evMinWrap"><label>Score minimum (%)</label><input class="inp" id="evMin" type="number" value="${a && a.minScore ? a.minScore : 70}"></div></div>
    <div id="evQuiz">
      <div id="qRows">${a && a.questions ? a.questions.map((qq, i) => qRowHTML(i + 1, qq)).join('') : ''}</div>
      <button class="btn btn-sm" onclick="addQRow()">${icon('plus', 13)} Ajouter une question</button>
    </div>
    <div id="evSub" style="display:none">
      <div class="field"><label>Consignes pour l’étudiant</label><textarea class="inp" id="evIntro" placeholder="Ex. Enregistrez une vidéo de 3 minutes appliquant les techniques du chapitre…">${a && a.intro ? esc(a.intro) : ''}</textarea></div>
      <div class="field"><label>Formats que l’étudiant peut envoyer</label>
        <div class="row" style="gap:14px;flex-wrap:wrap">
          ${['video', 'audio', 'image', 'doc'].map(k => `<label class="role-chk"><input type="checkbox" class="evFmt" value="${k}" ${curFmts.includes(k) ? 'checked' : ''}> ${fmtLabels[k]}</label>`).join('')}
        </div>
        <div class="hint">L’étudiant verra ces formats sur sa page de soumission. Limites : audio 20 Mo · vidéo 128 Mo · document 10 Mo.</div>
      </div>
    </div>
    <div class="hint mt8">Évaluation bloquante : l’étudiant doit la réussir pour poursuivre. Un échec ou un travail non conforme est toujours accompagné d’une explication.</div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="saveEval('${tid}','${cid}')">${icon('target', 13)} Enregistrer l’évaluation</button>` });
  if (!document.getElementById('qRows').children.length) addQRow();
  evTypeToggle();
}
function evTypeToggle() {
  const isQuiz = document.getElementById('evType').value === 'quiz';
  document.getElementById('evQuiz').style.display = isQuiz ? '' : 'none';
  document.getElementById('evSub').style.display = isQuiz ? 'none' : '';
  document.getElementById('evMinWrap').style.display = isQuiz ? '' : 'none';
}
function saveEval(tid, cid) {
  const title = document.getElementById('evTitle').value.trim(); if (!title) return toast('Titre requis', 'err');
  const type = document.getElementById('evType').value;
  const ch = getTraining(tid).chapters.find(c => c.id === cid);
  if (type === 'quiz') {
    const questions = readQuestions(); if (!questions.length) return toast('Ajoutez au moins une question complète.', 'err');
    ch.assessment = { id: (ch.assessment || {}).id || uid(), type: 'quiz', title, minScore: +document.getElementById('evMin').value || 70, questions };
  } else {
    const fmts = [...document.querySelectorAll('.evFmt:checked')].map(x => x.value);
    if (!fmts.length) return toast('Cochez au moins un format que l’étudiant peut envoyer.', 'err');
    const labels = { video: 'Vidéo', audio: 'Audio', image: 'Photo', doc: 'Document' };
    ch.assessment = { id: (ch.assessment || {}).id || uid(), type: 'submission', title, minScore: null, formats: fmts, accepts: fmts.map(k => labels[k]).join(' · '), intro: document.getElementById('evIntro').value.trim() || 'Déposez votre travail pour validation par un coach.' };
  }
  save('trainings'); closeModal(); render(); toast('Évaluation enregistrée — visible en direct', 'ok', 'target');
}

/* ============================================================
   DAVAR DATA LIFECYCLE & PURGE ENGINE — SUPERVISION ADMIN
   ============================================================ */
function aLifecycle(u) {
  const st = lcEngineState();
  const cfg = lcCfg();
  const card = (n, lbl, ic, extra) => `<div class="card card-pad" style="text-align:center"><div class="s-ico" style="width:38px;height:38px;border-radius:12px;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;background:var(--violet-soft);color:var(--violet)">${icon(ic, 18)}</div>
    <b style="font-size:20px">${n}</b><div class="xs muted">${lbl}</div>${extra || ''}</div>`;
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Cycle de vie des données</h1>
    <p><b>${LIFECYCLE.name} v${LIFECYCLE.version}</b> — le Campus ne conserve une donnée que tant qu’une finalité légitime le justifie. Purge de contrôle exécutée automatiquement toutes les 12 h ; dernière exécution : ${cfg.lastRun ? new Date(cfg.lastRun).toLocaleString('fr-FR') : 'jamais'}.</p></div>
    <div class="row" style="gap:8px"><button class="btn btn-primary btn-sm" onclick="runLifecycleNow()">${icon('refresh', 13)} Exécuter la purge de contrôle</button></div></div>
    ${videoBudgetHTML()}

  <div class="grid g4 mb16">
    ${card(st.files, 'Fichiers suivis (' + lcSize(st.fileBytes) + ')', 'doc')}
    ${card(st.drafts, 'Uploads non soumis (24 h)', 'clock')}
    ${card(st.orphansCandidates, 'Orphelins détectés', 'alert')}
    ${card(st.pendingAccounts, 'Comptes en quarantaine', 'shield')}
  </div>
  <div class="grid g4 mb16">
    ${card(st.aiThreads, 'Conversations IA (90 j)', 'sparkles')}
    ${card(st.coachThreads, 'Conversations coach (12 mois)', 'message', st.heldThreads ? '<div class="xs gold">' + st.heldThreads + ' conservée(s) pour exception</div>' : '')}
    ${card(st.oldNotifs, 'Notifications lues >48 h', 'bell')}
    ${card(st.certs, 'Certificats (politique ' + cfg.certRetentionYears + ' ans)', 'award')}
  </div>
  <div class="grid g4 mb16">
    ${card(S.auditLog.filter(a => a.action === 'login_failed' || a.action === 'login_lock').length, 'Alertes sécurité (connexions)', 'shield')}
    ${card(S.files.length, 'Fichiers au registre', 'doc')}
    ${card(Object.keys(S.anonymStats.completionsByTraining || {}).length, 'Formations suivies (stats anonymes)', 'chart')}
    ${card(S.apiKeys ? S.apiKeys.filter(k => !k.revoked).length : 0, 'Clés API actives', 'key')}
  </div>

  ${S.purgePending.length ? `<h3 style="font-size:14px" class="mb8">Quarantaine avant purge (§22)</h3>
  <div class="card card-pad mb16" style="border-color:var(--gold-line)">
    ${S.purgePending.map(p => { const stu = getUser(p.userId); return `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div>${stu ? avatarHTML(stu, 'sm') : ''}<b class="small" style="margin-left:8px">${stu ? esc(stu.name) : p.userId}</b>
        <div class="xs muted">${esc(p.reason)} — purge dans ${Math.max(0, cfg.quarantineDays - Math.floor((Date.now() - p.at) / DAY))} jour(s)</div></div>
      <div class="row" style="gap:6px">
        <button class="btn btn-sm" onclick="cancelPurge('${p.userId}')">${icon('x', 13)} Exception (annuler)</button>
        <button class="btn btn-sm btn-danger" onclick="forcePurge('${p.userId}')">Purger maintenant</button>
      </div></div>`; }).join('')}
    <div class="xs faint mt8">Avant chaque purge : vérification automatique (nouvelle formation, paiement en cours, certification, litige, obligation). Les certificats et statistiques anonymisées survivent au compte.</div>
  </div>` : ''}

  <div class="grid g2" style="align-items:start">
    <div>
      <h3 style="font-size:14px" class="mb8">Politiques de conservation (matrice officielle)</h3>
      <div class="card" style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Donnée</th><th>Politique</th></tr></thead>
        <tbody>${LIFECYCLE.classes.map(([d, p]) => `<tr><td class="small"><b>${d}</b></td><td class="xs muted">${p}</td></tr>`).join('')}</tbody></table></div>
      <h3 style="font-size:14px;margin-top:18px" class="mb8">Couches de stockage contrôlées</h3>
      <div class="card" style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Couche</th><th>Règle</th></tr></thead>
        <tbody>${LIFECYCLE.layers.map(([d, p]) => `<tr><td class="small"><b>${d}</b></td><td class="xs muted">${p}</td></tr>`).join('')}</tbody></table></div>
    </div>
    <div>
      <h3 style="font-size:14px" class="mb8">Paramètres du moteur</h3>
      <div class="card card-pad mb16">
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
          <div class="field"><label>Limite audio</label><input class="inp" value="${lcSize(cfg.limits.audio)}" disabled></div>
          <div class="field"><label>Limite vidéo</label><input class="inp" value="${lcSize(cfg.limits.video)}" disabled></div>
          <div class="field"><label>Limite document</label><input class="inp" value="${lcSize(cfg.limits.doc)}" disabled></div>
          <div class="field"><label>Rétention certificats (années)</label><input class="inp" id="lcCertYears" type="number" value="${cfg.certRetentionYears}"></div>
        </div>
        <div class="field"><label>Formats document acceptés (configurables)</label><input class="inp" id="lcDocExt" value="${esc(cfg.docExt.join(', '))}"></div>
        <div class="xs faint">Les limites de taille sont fixées par la spécification propriétaire et verrouillées. Formats et durées ci-dessus restent configurables.</div>
        <button class="btn btn-primary btn-sm mt8" onclick="saveLifecycleCfg()">${icon('check', 13)} Enregistrer</button>
      </div>
      <h3 style="font-size:14px" class="mb8">Journal de purge (trace minimale)</h3>
      <div class="card" style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Date</th><th>Type</th><th>Nombre</th><th>Résultat</th></tr></thead>
        <tbody>${S.purgeLog.slice(0, 30).map(l => `<tr><td class="xs muted">${new Date(l.at).toLocaleString('fr-FR')}</td><td class="xs"><b>${esc(l.type)}</b></td><td class="xs">${l.count}</td><td class="xs muted">${esc(l.result)}${l.detail ? ' — ' + esc(l.detail) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="xs faint">Aucune opération pour l’instant.</td></tr>'}</tbody></table></div>
    </div>
  </div>`;
}
/* Budget vidéo R2 : on SURVEILLE le gratuit (10 Go), on ne limite jamais la qualité choisie.
   Estimation par défaut 400 kbps ; si m.videoMB est renseigné (poids réel encodé), il prime. */
function videoBudget() {
  const MB_PER_SEC = 0.05;   /* 400 kbps */
  const dur = d => { const p = String(d || '0:00').split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
  let sec = 0, mb = 0;
  (S.trainings || []).forEach(t => (t.chapters || []).forEach(ch => (ch.modules || []).forEach(m => {
    const s = dur(m.duration); sec += s; mb += m.videoMB ? +m.videoMB : s * MB_PER_SEC;
    (m.extraVideos || []).forEach(ev => { const e = dur(ev.duration); sec += e; mb += ev.videoMB ? +ev.videoMB : e * MB_PER_SEC; });
  })));
  const gb = mb / 1000;
  return { gb: Math.round(gb * 100) / 100, hours: Math.round(sec / 3600 * 10) / 10, cap: 10, hoursCap: Math.floor(10 * 1000 / MB_PER_SEC / 3600) };
}
function videoBudgetHTML() {
  const b = videoBudget();
  const pct = Math.min(100, Math.round(b.gb / b.cap * 100));
  const over = b.gb > b.cap;
  return `<div class="card card-pad mb8">
    <div class="row between"><b class="small">${icon('video', 14)} Budget vidéo R2 (10 Go gratuits)</b>
      <span class="badge ${over ? 'b-red' : 'b-green'}">${b.gb} Go / ${b.cap} Go</span></div>
    <div style="height:8px;border-radius:99px;background:var(--line);margin:10px 0 6px"><div style="height:8px;border-radius:99px;width:${pct}%;background:${over ? 'var(--red)' : 'var(--gold)'}"></div></div>
    <p class="xs muted">Catalogue actuel : ${b.hours} h de vidéo. Aucune limite de qualité ne vous est imposée : renseignez le poids réel (videoMB) si vous encodez plus haut, la jauge suivra.
    Au-delà des 10 Go : AV1 (≈ −50 % à qualité égale), archivage froid des cohortes retirées (0,01 $/Go), YouTube non répertorié réservé aux contenus gratuits. On protège les quotas, on ne les consomme pas.</p>
  </div>`;
}
function runLifecycleNow() {
  const r = runLifecycleEngine(true);
  save(); render();
  toast(`Purge de contrôle terminée : ${r.files || 0} fichier(s), ${r.abandoned || 0} abandonné(s), ${r.orphans || 0} orphelin(s), ${r.convAI || 0} conv. IA, ${r.convCoach || 0} conv. coach, ${r.notifs || 0} notifications, ${r.tokens || 0} jetons, ${r.logs || 0} logs, ${r.pending || 0} mise(s) en quarantaine, ${r.executed || 0} purge(s), ${r.cancelled || 0} annulation(s).`, 'ok', 'refresh');
}
function saveLifecycleCfg() {
  const cfg = lcCfg();
  cfg.certRetentionYears = Math.max(1, +document.getElementById('lcCertYears').value || cfg.certRetentionYears);
  cfg.docExt = document.getElementById('lcDocExt').value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  save(); render(); toast('Paramètres du moteur enregistrés ✓', 'ok', 'sliders');
}
function cancelPurge(userId) {
  const st = getUser(userId);
  S.purgePending = S.purgePending.filter(p => p.userId !== userId);
  if (st) st.hold = true;   /* exception documentée : le compte est protégé */
  lcLog('COMPTE', 1, 'PURGE_CANCELLED', 'exception enregistrée');
  save(); render(); toast('Purge annulée — exception enregistrée sur le compte.', 'gold', 'shield');
}
function forcePurge(userId) {
  confirmModal('Purger maintenant les données personnelles ?', 'Nom, e-mail, téléphone, photo, profil et progression seront supprimés. Les certificats et statistiques anonymisées sont conservés.', 'Purger', true).then(v => {
    if (!v) return;
    execPurge(userId);
  });
}
function execPurge(userId) {
  const stu = getUser(userId); if (!stu) return;
  const d = secSwarmPurge(stu);   /* couche 9 : 3 agents votent avant l'action destructive */
  if (d.decision === 'block') { toast('Essaim de sécurité : purge refusée (' + d.allow + '/3 agents favorables).', 'err', 'shield'); return; }
  lcExecuteAccountPurge(userId);
  S.purgePending = S.purgePending.filter(p => p.userId !== userId);
  save(); render(); toast('Purge exécutée et vérifiée ✓', '', 'trash');
}

/* ---------------- Contrôle des abonnements sociaux + purge des données de démonstration ---------------- */
function adminSubsRows() {
  const rows = [];
  Object.keys(S.socialSubs || {}).forEach(uid => {
    const u = getUser(uid); const subs = S.socialSubs[uid] || {};
    Object.keys(subs).forEach(sid => {
      const soc = (S.settings.socials || []).find(x => x.id === sid);
      const v = subs[sid]; const at = (v && v.at) ? new Date(v.at) : null;
      rows.push(`<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line);gap:10px">
        <span class="small"><b>${esc(u ? u.name : uid)}</b> · ${esc(soc ? soc.platform : sid)}</span>
        <span class="xs muted" style="white-space:nowrap">${at ? 'Confirmé le ' + fmtDate(at.toISOString().slice(0, 10)) + ' à ' + at.toTimeString().slice(0, 5) : 'Confirmé (données antérieures)'}</span></div>`);
    });
  });
  return rows.length ? rows.join('') : '<div class="xs faint">Aucune confirmation d’abonnement pour l’instant.</div>';
}
function confirmPurgeDemo() {
  confirmModal('Purger toutes les données de démonstration ?', 'Tous les comptes de test, formations, ressources, fichiers, ventes et échanges seront définitivement supprimés. Vos réglages de plateforme sont conservés. Cette action est irréversible.', 'Purger définitivement', true).then(v => { if (v) doPurgeDemo(); });
}
function doPurgeDemo() {
  const me = S.session.userId;
  /* Les comptes test (un par rôle) restent : ils servent aux vues test du Super Admin et du Manager */
  S.users = S.users.filter(u => u.id === me || u.id.indexOf('u-test-') === 0);
  S.team = (S.team || []).filter(m => S.users.some(x => x.email === m.email));
  ['enrollments', 'sales', 'certs', 'certRequests', 'supportThreads', 'invites', 'rewards', 'reviews',
   'trainings', 'resources', 'files', 'mfPayments', 'fwPayments', 'notifs', 'reactions', 'comments',
   'reports', 'auditLog', 'fileBlobs'].forEach(k => { if (Array.isArray(S[k])) S[k] = []; });
  S.socialSubs = {}; S.audioPos = {}; S.readPos = {};
  ['ped', 'reviewAsked', 'reminderCycle', 'returnCount', 'retryFlag', 'pendingReveal'].forEach(k => { if (S[k] !== undefined) delete S[k]; });
  if (S.analytics && typeof S.analytics === 'object') Object.keys(S.analytics).forEach(k => { S.analytics[k] = Array.isArray(S.analytics[k]) ? [] : 0; });
  save();
  toast('Purge terminée : plateforme vierge, prête pour le lancement réel ✓', 'ok', 'check');
  go('');
}
