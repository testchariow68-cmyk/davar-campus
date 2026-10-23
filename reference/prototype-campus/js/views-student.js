/* ============================================================
   ESPACE ÉTUDIANT
   ============================================================ */

/* ---------------- LOGIN ---------------- */
function vLogin() {
  return `<div class="login-glass">
    <img class="lg-logo lg-bare" src="assets/logo-connexion.png?v=75" alt="DAVAR ACADÉMIE CAMPUS — L’école de l’excellence oratoire">
    <div class="gcard">
      <h1>DAVAR ACADÉMIE CAMPUS</h1>
      <p>Connectez-vous</p>
      <div id="loginErr"></div>
      <label for="loginEmail">E-mail</label>
      <input type="email" id="loginEmail" placeholder="vous@exemple.com" autocomplete="email">
      <label for="loginPwd">Mot de passe</label>
      <input type="password" id="loginPwd" placeholder="••••••••" onkeydown="if(event.key==='Enter')tryLogin()">
      <button onclick="tryLogin()">Se connecter</button>
      ${typeof window !== 'undefined' && window.PublicKeyCredential && fpDeviceUsers().length ? `<button type="button" class="gl-fp" onclick="loginFingerprint()">${icon('fingerprint', 15)} Se connecter avec l’empreinte digitale</button>` : ''}
      <div class="gl-links">
        <a onclick="forgotModal()">Mot de passe oublié ?</a>
      </div>
      ${S.settings.productionMode ? '' : `<details class="gl-demo"><summary>Comptes de démonstration</summary>
        <div class="col mt8" style="gap:6px">
          <button class="acct" onclick="doLogin('u-awa')"><span class="avatar" style="background:var(--ava-1)">AK</span><span class="wrap"><b style="font-size:13px">Awa Koné</b><div class="xs" style="opacity:.7">Étudiante</div></span></button>
          <button class="acct" onclick="doLogin('u-coach')"><span class="avatar" style="background:var(--ava-2)">MT</span><span class="wrap"><b style="font-size:13px">Mariam Touré</b><div class="xs" style="opacity:.7">Coach + Correctrice</div></span></button>
          <button class="acct" onclick="doLogin('u-yann')"><span class="avatar" style="background:#C9A24B">YS</span><span class="wrap"><b style="font-size:13px">YAPO SERGE TRÉSOR</b><div class="xs" style="opacity:.7">Fondateur · Super Administrateur</div></span></button>
        </div>
      </details>`}
    </div>
    <a class="gl-under" onclick="go('/inscription')">Pas de compte ? S’inscrire</a>
    <footer class="gl-branding">
      <div class="gl-foot">© 2026 Davar Académie — Abidjan, Côte d’Ivoire</div>
      <img class="gl-maker" src="assets/logo-producteur.png?v=75" alt="Entreprise créatrice du site" loading="lazy">
    </footer>
  </div>`;
}
function bindLogin() { }
function tryLogin() {
  const email = (document.getElementById('loginEmail').value || '').trim().toLowerCase();
  const pwd = document.getElementById('loginPwd').value || '';
  const errBox = document.getElementById('loginErr');
  const fail = msg => { errBox.innerHTML = `<div class="banner err mb8">${icon('alert', 14)}<span>${msg}</span></div>`; };
  /* DAVAR SECURITY SHIELD : verrouillage progressif anti force brute, journalisé */
  S.loginFails = S.loginFails || {};
  const rec = S.loginFails[email] || (S.loginFails[email] = { n: 0, until: 0 });
  if (rec.until > Date.now()) return fail('Trop de tentatives consécutives. Compte protégé : réessayez dans ' + Math.ceil((rec.until - Date.now()) / 60000) + ' min.');
  const u = S.users.find(x => x.email.toLowerCase() === email);
  if (!u) { rec.n++; if (rec.n >= 5) { rec.until = Date.now() + 5 * 60000; rec.n = 0; recordAudit('login_lock', { email }); } return fail('Aucun compte avec cet e-mail. Utilisez « S’inscrire » si vous avez payé une formation.'); }
  if (isSuspended(u)) return fail('Compte suspendu. Contactez le support : ' + esc(S.settings.support.email));
  if (u.password && u.password !== pwd) {
    rec.n++;
    if (rec.n >= 5) { rec.until = Date.now() + 5 * 60000; rec.n = 0; recordAudit('login_lock', { email }); notify('u-yann', 'admin', 'Tentatives de connexion suspectes', email + ' : verrouillage automatique 5 minutes.'); }
    else recordAudit('login_failed', { email, n: rec.n });
    return fail('Mot de passe incorrect (tentative ' + rec.n + '/5).');
  }
  rec.n = 0; rec.until = 0;
  if (!u.password && pwd.length < 4) return fail('Saisissez votre mot de passe.');
  S.session = { userId: u.id }; save();
  recordAudit('login', { email: u.email });
  location.hash = isStaff(u) ? '#/admin' : '#/';
  render();
  toast(`Bienvenue, ${u.name.split(' ')[0]} 👋`, '', 'sparkles');
}
function forgotModal() {
  openModal({
    title: 'Mot de passe oublié',
    body: `<div class="field"><label>Votre adresse e-mail</label><input class="inp" id="fgEmail" type="email" placeholder="vous@exemple.com"></div>
      <div class="hint">Un lien de réinitialisation vous sera envoyé par e-mail.</div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="sendReset()">Envoyer le lien</button>`
  });
}
function sendReset() {
  const e = document.getElementById('fgEmail').value.trim();
  if (!e) return toast('Indiquez votre e-mail.', 'err');
  sendFlow('pwd_reset', e);
  closeModal(); toast('Lien de réinitialisation envoyé 📮', 'ok', 'mail');
}

/* ---------------- INSCRIPTION PRIVÉE (e-mail d'achat reconnu) ---------------- */
const SIGNUP = { step: 1, email: '', purchases: [], photo: null };
function vSignup() {
  return `<div class="login-glass">
    <img class="lg-logo lg-bare" src="assets/logo-connexion.png?v=75" alt="DAVAR ACADÉMIE CAMPUS — L’école de l’excellence oratoire">
    <div class="gcard">
      ${SIGNUP.step === 1 ? `
      <h1>Créer mon compte</h1>
      <p>Entrez l’adresse e-mail utilisée lors de votre achat, c’est celui sur lequel vous avez reçu le message de succès de votre achat.</p>
      <div id="suErr"></div>
      <label for="suEmail">Adresse e-mail d’achat</label>
      <input type="email" id="suEmail" placeholder="vous@exemple.com" value="${esc(SIGNUP.email)}" onkeydown="if(event.key==='Enter')checkSignupMail()">
      <button onclick="checkSignupMail()">Vérifier mon e-mail</button>` : `
      <h1>Configurer mon compte</h1>
      <p class="gl-ok">E-mail reconnu ✓ ${SIGNUP.purchases.length ? 'Vos formations seront ajoutées automatiquement à votre compte.' : 'Invitation valide — configurez votre accès.'}</p>
      <label>Adresse e-mail (verrouillée)</label><input value="${esc(SIGNUP.email)}" disabled>
      <label for="suName">Nom complet (max 21 caractères)</label><input id="suName" maxlength="21" placeholder="Tel qu’il apparaîtra sur vos certificats">
      <label for="suPwd">Mot de passe</label><input type="password" id="suPwd" minlength="8" placeholder="8 caractères minimum">
      <label for="suPwd2">Confirmer le mot de passe</label><input type="password" id="suPwd2" minlength="8">
      <label>Photo de profil (facultatif)</label>
      <div class="row" style="gap:10px">${SIGNUP.photo ? `<img class="photo-up" src="${SIGNUP.photo}">` : `<span class="avatar lg" style="background:rgba(255,255,255,.15)">${icon('camera', 20)}</span>`}<input type="file" accept="image/*" id="suPhoto" style="flex:1"></div>
      <button onclick="createAccount()">Créer mon compte</button>`}
    </div>
    <a class="gl-under" onclick="go('/login')">${SIGNUP.step === 1 ? 'Déjà inscrit ? Se connecter' : 'Retour à la connexion'}</a>
    <footer class="gl-branding">
      <div class="gl-foot">© 2026 Davar Académie — Abidjan, Côte d’Ivoire</div>
      <img class="gl-maker" src="assets/logo-producteur.png?v=75" alt="Entreprise créatrice du site" loading="lazy">
    </footer>
  </div>`;
}
function checkSignupMail() {
  const email = (document.getElementById('suEmail').value || '').trim().toLowerCase();
  const err = document.getElementById('suErr');
  if (S.users.some(u => u.email.toLowerCase() === email)) { err.innerHTML = `<div class="gl-err">Un compte existe déjà avec cet e-mail : connectez-vous.</div>`; return; }
  const purchases = S.sales.filter(s => s.email.toLowerCase() === email && s.status === 'confirmé');
  const invite = S.invites.find(i => i.email.toLowerCase() === email && !i.used && i.expiresAt > Date.now());
  if (!purchases.length && !invite) { err.innerHTML = `<div class="gl-err">Aucun achat ni invitation trouvé pour cet e-mail. Entrez l’adresse e-mail utilisée lors de votre achat, c’est celui sur lequel vous avez reçu le message de succès de votre achat.</div>`; return; }
  SIGNUP.step = 2; SIGNUP.email = email; SIGNUP.purchases = purchases.map(p => p.trainingId);
  render();
}
function createAccount() {
  const name = (document.getElementById('suName').value || '').trim();
  const pwd = document.getElementById('suPwd').value; const pwd2 = document.getElementById('suPwd2').value;
  if (name.length < 2) return toast('Indiquez votre nom (il figurera sur vos certificats).', 'err');
  if (name.length > 21) return toast('21 caractères maximum pour le nom.', 'err');
  if (pwd.length < 8 || pwd !== pwd2) return toast('Mots de passe invalides ou différents.', 'err');
  const gate = secLoginGate();
  if (!gate.ok) return toast(gate.reason, 'err', 'shield');
  const invite = S.invites.find(i => i.email.toLowerCase() === SIGNUP.email && !i.used && i.expiresAt > Date.now());
  const colors = ['var(--ava-1)', '#2B6CB0', '#B83280', '#1F8A4C', '#B7791F'];
  const nu = { id: uid(), name, email: SIGNUP.email, role: invite && invite.type === 'staff' ? 'staff' : 'student', password: pwd, photo: SIGNUP.photo, status: 'active', joined: Date.now(), color: colors[Math.floor(Math.random() * colors.length)] };
  if (invite && invite.type === 'staff') { S.team.push({ id: uid(), name, email: SIGNUP.email, roles: invite.roles || ['coach'], color: nu.color }); }
  S.users.push(nu);
  SIGNUP.purchases.forEach(tid => ensureEnrollment(nu.id, tid));
  S.sales.filter(s => s.email.toLowerCase() === SIGNUP.email).forEach(s => { if (!s.userId) s.userId = nu.id; });
  if (invite) invite.used = true;
  notify(nu.id, 'info', 'Bienvenue sur votre campus 🎉', 'Votre compte est prêt. Bonne formation !');
  sendFlow('welcome', SIGNUP.email, { name, userId: nu.id });
  recordAudit('signup', { email: SIGNUP.email });
  save();
  S.session = { userId: nu.id }; SIGNUP.step = 1;
  location.hash = isStaff(nu) ? '#/admin' : '#/';
  render();
  toast('Compte créé — bienvenue ! 🎓', 'ok', 'sparkles');
}
function doLogin(userId) {
  const gate = secLoginGate();
  if (!gate.ok) { toast(gate.reason, 'err', 'shield'); return; }
  const u0 = getUser(userId);
  if (isSuspended(u0)) { toast('Compte suspendu. Contactez le support.', 'err', 'lock'); return; }
  u0.lastLogin = Date.now();
  S.session = { userId }; save();
  recordAudit('login', { email: u0.email });
  const u = getUser(userId);
  if (typeof rwLogin === 'function') rwLogin(u);
  location.hash = isStaff(u) ? '#/admin' : '#/';
  render();
  toast(`Bienvenue, ${u.name.split(' ')[0]} 👋`, '', 'sparkles');
}

/* ---------------- SHELL ÉTUDIANT ---------------- */
function studentShell(r, u) {
  const p = r.parts;
  if (isSuspended(u)) return `<div class="container"><div class="card lock-hero" style="max-width:520px;margin:60px auto">
    <div class="lk">${icon('lock', 26)}</div><h2>Compte suspendu</h2>
    <p class="muted mt8 small">Votre accès a été suspendu par l’administration. Un e-mail et une notification vous ont été envoyés. Contactez le support : ${esc(S.settings.support.email)}</p>
    <button class="btn btn-danger mt16" onclick="logout()">Se déconnecter</button></div></div>`;
  let page = vNotFound();
  if (p.length === 0) page = vDashboard(u);
  else if (p[0] === 'formations') page = vMyTrainings(u);
  else if (p[0] === 'formation') {
    if (p.length === 2) page = vTraining(u, p[1]);
    else if (p[2] === 'module') page = vModule(u, p[1], p[3]);
    else if (p[2] === 'exercice') page = vExercise(u, p[1], p[3]);
    else if (p[2] === 'evaluation') page = vEvaluation(u, p[1], p[3]);
  }
  else if (p[0] === 'catalogue') page = vCatalog(u);
  else if (p[0] === 'checkout') page = vCheckout(u, p[1]);
  else if (p[0] === 'certificats') page = vCertificates(u);
  else if (p[0] === 'profil') page = vProfile(u);

  const active = x => (r.path === x || (x !== '/' && r.path.startsWith(x))) ? 'active' : '';
  return `
  <header class="topbar"><div class="tb-inner">
    ${brandHTML()}
    <nav class="tb-nav">
      <a href="#/" class="${active('/')}">Tableau de bord</a>
      <a href="#/formations" class="${active('/formations')}">Mes formations</a>
      <a href="#/catalogue" class="${active('/catalogue')}">Catalogue</a>
      <a href="#/certificats" class="${active('/certificats')}">Certificats</a>
    </nav>
    <div class="tb-right">
      ${themeBtn()}
      ${bellHTML(u.id)}
      ${userMenuHTML(u)}
    </div>
  </div></header>
  ${announceBarHTML(u)}
  <main class="container">${page}</main>
  ${socialTickerHTML(u.id)}
  ${SUP.open ? supportPanelHTML(u) : ''}
  ${CHAT.open ? chatPanelHTML(u) : ''}`;
}
function vNotFound() { return emptyState('search', 'Page introuvable'); }

/* ---------------- DASHBOARD ---------------- */
function vDashboard(u) {
  const mine = myTrainings(u.id);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  const inProgress = mine.map(t => ({ t, pr: trainingProgress(u.id, t) })).filter(x => x.pr.pct > 0 && x.pr.pct < 100);
  const resume = inProgress[0] || null;
  const tasks = buildTasks(u);
  const recents = Object.entries(S.progress[u.id] || {}).sort((a, b) => b[1].at - a[1].at).slice(0, 3)
    .map(([mid, p]) => {
      for (const t of mine) { const f = findModule(t.id, mid); if (f) return { t, m: f.m, at: p.at }; }
      return null;
    }).filter(Boolean);
  const certs = S.certs.filter(c => c.userId === u.id);

  return `
  ${!S.settings.pushEnabled ? `
  <div class="card" style="margin-bottom:18px;border-color:var(--violet-line);background:linear-gradient(120deg,#FBFAFF,#F4EEFE)">
    <div class="row card-pad" style="padding:16px 20px">
      <span class="s-ico" style="width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:var(--violet);color:#fff">${icon('bell', 18)}</span>
      <div class="wrap"><b style="font-size:13.5px">Activez les notifications push</b>
        <div class="xs muted">Réponses du coach, corrections, certificats : soyez averti(e) en temps réel.</div></div>
      <button class="btn btn-primary btn-sm" onclick="togglePush()">Activer</button>
    </div>
  </div>` : ''}

  ${S.sales.filter(s => s.userId === u.id && s.status === 'declaré').map(s => {
    const tt = getTraining(s.trainingId);
    return `<div class="banner warn" style="margin-bottom:16px">${icon('clock', 15)}<span><b>Paiement en attente de vérification :</b> ${fmtMoney(s.amount)} par ${esc(s.method)} pour « ${esc(tt.title)} » (réf ${esc(s.ref || '')}). Vous recevrez une notification dès l’activation de votre formation.</span></div>`;
  }).join('')}

  <div class="page-head">
    <div><h1>${greet}, ${esc(u.name.split(' ')[0])} 👋</h1><p>Voici l’état de votre campus aujourd’hui.</p></div>
    <a class="btn" href="#/catalogue">${icon('search', 15)} Découvrir plus de formations</a>
  </div>

  ${resume ? (() => {
    const { t, pr } = resume; const nx = nextStep(u.id, t);
    return `<div class="card" style="overflow:hidden;margin-bottom:22px">
      <div class="row" style="padding:20px;flex-wrap:wrap">
        ${coverHTML(t,';width:112px;height:74px;border-radius:10px;flex:none')}
        <div class="wrap" style="min-width:220px">
          <div class="eyebrow">Reprendre ma formation</div>
          <h3 style="font-size:16px;margin:3px 0 8px">${esc(t.title)}</h3>
          ${pbarHTML(pr.pct)}
        </div>
        <a class="btn btn-primary" href="${nx ? stepHref(t, nx) : `#/formation/${t.id}`}" style="margin-left:auto">${icon('play', 15)} ${nx ? (nx.kind === 'assessment' ? 'Passer l’évaluation' : 'Continuer') : 'Ouvrir'}</a>
      </div>
    </div>`;
  })() : ''}

  <div class="grid" style="grid-template-columns:1.7fr 1fr;align-items:start">
    <div>
      <div class="card">
        <div class="card-head"><h3>Mes formations</h3><a class="link" href="#/formations">Tout voir →</a></div>
        ${mine.length ? mine.map(t => {
          const pr = trainingProgress(u.id, t);
          const done = trainingCompleted(u.id, t);
          return `<div class="res-item" style="cursor:pointer" onclick="go('/formation/${t.id}')">
            ${coverHTML(t,';width:64px;height:46px;border-radius:8px;flex:none')}
            <div class="wrap">
              <div class="row between"><b style="font-size:13.5px">${esc(t.title)}</b>
                ${done ? '<span class="badge b-gold">Terminée ✓</span>' : pr.pct > 0 ? '<span class="badge b-violet">En cours</span>' : '<span class="badge b-grey">Disponible</span>'}</div>
              <div class="mt8">${pbarHTML(pr.pct, done ? 'gold' : '')}</div>
            </div>
            ${icon('chevR', 16, 'faint')}
          </div>`;
        }).join('') : emptyState('book', 'Aucune formation pour le moment', 'Explorez le catalogue pour commencer.')}
        <div style="padding:14px 16px;border-top:1px solid var(--line)">
          <a class="btn btn-ghost btn-sm" href="#/catalogue">${icon('plus', 14)} Découvrir plus de formations</a>
        </div>
      </div>

      <div class="card mt16">
        <div class="card-head"><h3>Consultés récemment</h3></div>
        ${recents.length ? recents.map(r2 => `
          <div class="res-item" style="cursor:pointer" onclick="go('/formation/${r2.t.id}/module/${r2.m.id}')">
            <span class="step-ico s-cur">${icon('play', 14)}</span>
            <div class="wrap"><b style="font-size:13px">${esc(r2.m.title)}</b><div class="xs faint">${esc(r2.t.title)}</div></div>
            <span class="xs faint">${timeAgo(r2.at)}</span>
          </div>`).join('') : '<div class="empty small">Commencez un module pour le retrouver ici.</div>'}
      </div>
    </div>

    <div>
      <div class="card">
        <div class="card-head"><h3>À faire</h3>${tasks.length ? `<span class="badge b-violet">${tasks.length}</span>` : ''}</div>
        ${tasks.length ? tasks.map(tk => `
          <a class="res-item" href="${tk.href}">
            <span class="step-ico ${tk.cls}">${icon(tk.icon, 14)}</span>
            <div class="wrap"><b style="font-size:12.8px">${tk.label}</b><div class="xs faint">${esc(tk.sub)}</div></div>
            ${icon('chevR', 14, 'faint')}
          </a>`).join('') : `<div class="empty small">Vous êtes à jour ✨</div>`}
      </div>
      <div class="card mt16" style="background:var(--grad-dark);border:none;color:#fff">
        <div style="padding:18px">
          <div class="row" style="gap:8px;color:var(--gold2)">${icon('sparkles', 16)}<span class="eyebrow" style="color:var(--gold2)">Assistant ${esc(aiName())}</span></div>
          <p style="font-size:13px;color:#D9D3E8;margin-top:8px">Une question sur un module ? L’assistant répond immédiatement. Pour le reste, votre coach prend le relais.</p>
          <button class="btn btn-sm mt16" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25);color:#fff" onclick="openChatFromAnywhere()">${icon('message', 14)} Poser une question</button>
        </div>
      </div>
      <div class="card mt16 motiv-card">
        <div style="padding:18px;position:relative;z-index:2">
          <div class="row" style="gap:8px;color:var(--gold2)">${icon('quote', 16)}<span class="eyebrow" style="color:var(--gold2)">Motivation de la semaine</span></div>
          <p style="font-size:14.5px;font-weight:600;margin-top:10px;font-style:italic">« ${esc(S.settings.motivations[S.settings.motivationsIndex % Math.max(1, S.settings.motivations.length)] || 'Continue, ton excellence se construit chaque semaine.')} »</p>
          <div class="xs" style="color:#B4ACCB;margin-top:8px">Chaque dimanche, une nouvelle motivation vous est envoyée en notification push.</div>
        </div>
      </div>
      <div class="card mt16">
        <div class="card-head"><h3>Contacter le support</h3></div>
        <div style="padding:14px 16px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm sup-btn" onclick="openSupportChat()">${icon('message', 14)} Discussion</button>
          <a class="btn btn-sm sup-btn" href="${esc(S.settings.support.whatsapp)}" target="_blank">${icon('send', 14)} WhatsApp</a>
          <a class="btn btn-sm sup-btn" href="tel:${esc(S.settings.support.phone)}">${icon('phone', 14)} Appeler</a>
        </div>
        <div class="xs faint" style="padding:0 16px 14px">La discussion en temps réel est disponible dès qu’un membre du staff support est en poste.</div>
      </div>
      ${certs.length ? `<div class="card mt16">
        <div class="card-head"><h3>Mes certificats</h3></div>
        ${certs.slice(0, 2).map(c => { const t = getTraining(c.trainingId); return `
          <div class="res-item" style="cursor:pointer" onclick="showCert('${c.id}')">
            <span class="step-ico s-gold">${icon('award', 14)}</span>
            <div class="wrap"><b style="font-size:12.8px">${esc(t.title)}</b><div class="xs faint">${c.code}</div></div>
            ${icon('chevR', 14, 'faint')}
          </div>`; }).join('')}
      </div>` : ''}
    </div>
  </div>`;
}
function buildTasks(u) {
  const tasks = [];
  for (const t of myTrainings(u.id)) {
    const steps = stepsOf(t);
    steps.forEach(s => {
      if (s.kind === 'exercise' && !((S.exAttempts[u.id] || {})[s.id] || []).length && stepUnlocked(u.id, t, s))
        tasks.push({ icon: 'clipboard', cls: 's-cur', label: `Exercice : ${s.ref.title}`, sub: t.title, href: `#/formation/${t.id}/exercice/${s.chRef.id}` });
      if (s.kind === 'assessment' && stepUnlocked(u.id, t, s) && !stepDone(u.id, t, s)) {
        const pend = s.ref.type === 'submission' && S.submissions.some(x => x.userId === u.id && x.evId === s.id && x.status === 'pending');
        if (!pend) tasks.push({ icon: 'target', cls: 's-gold', label: s.ref.type === 'quiz' ? `Évaluation à passer : ${s.ref.title}` : `Travail à soumettre : ${s.ref.title}`, sub: t.title, href: `#/formation/${t.id}/evaluation/${s.chRef.id}` });
        else tasks.push({ icon: 'clock', cls: 's-lock', label: 'Soumission en cours de correction', sub: t.title, href: `#/formation/${t.id}/evaluation/${s.chRef.id}` });
      }
      const sub = S.submissions.find(x => x.userId === u.id && x.trainingId === t.id && (x.status === 'rejected' || x.status === 'retry'));
      if (sub && s.kind === 'assessment' && s.ref.type === 'submission' && s.id === sub.evId)
        tasks.push({ icon: 'refresh', cls: 's-lock', label: 'Nouvelle tentative demandée', sub: sub.feedback ? 'Lisez le retour du coach puis soumettez à nouveau.' : t.title, href: `#/formation/${t.id}/evaluation/${s.chRef.id}` });
    });
  }
  S.threads.filter(th => th.userId === u.id && th.messages.some(m => m.from === 'coach')).slice(0, 2)
    .forEach(th => { const f = findModule(th.trainingId, th.moduleId); tasks.push({ icon: 'message', cls: 's-gold', label: 'Votre coach a répondu', sub: f ? f.m.title : 'Conversation', href: '#/profil' }); });
  const seen = new Set(); return tasks.filter(x => !seen.has(x.label) && seen.add(x.label)).slice(0, 6);
}
function togglePush() { S.settings.pushEnabled = true; save(); render(); toast('Notifications activées ✓', 'ok', 'bell'); }
function openChatFromAnywhere() {
  const u = S.session.userId;
  const t = myTrainings(u)[0]; if (!t) { toast('Aucune formation disponible pour le chat', 'err'); return; }
  const steps = stepsOf(t); const cur = nextStep(u, t) || steps[0];
  const mid = cur.kind === 'module' ? cur.id : t.chapters[0].modules[0].id;
  openChat(t.id, mid, 'ai');
}

/* ---------------- MES FORMATIONS ---------------- */
function vMyTrainings(u) {
  /* Parcours guidé : formations → chapitres → modules (défini dans views-campus.js) */
  return vFormations(u);
}
function stepHref(t, s) {
  if (s.kind === 'module') return `#/formation/${t.id}/module/${s.id}`;
  if (s.kind === 'exercise') return `#/formation/${t.id}/exercice/${s.chRef.id}`;
  return `#/formation/${t.id}/evaluation/${s.chRef.id}`;
}
function findChapter(tid, cid) { const t = getTraining(tid); return t ? { t, ch: t.chapters.find(c => c.id === cid) } : { t: null, ch: null }; }

function vTraining(u, tid) {
  const t = getTraining(tid);
  if (!t) return vNotFound();
  if (!enrolledIn(u.id, tid)) return `
    <div class="card lock-hero" style="max-width:560px;margin:40px auto">
      <div class="lk">${icon('lock', 26)}</div>
      <h2>Formation non disponible</h2>
      <p class="muted mt8 small">Vous n’avez pas encore accès à « ${esc(t.title)} ».</p>
      <button class="btn btn-primary mt16" onclick="startPurchase('${t.id}')">Obtenir cette formation</button>
    </div>`;
  const pr = trainingProgress(u.id, t);
  const done = trainingCompleted(u.id, t);
  const cert = S.certs.find(c => c.userId === u.id && c.trainingId === tid);
  return `
  <div class="breadcrumb"><a href="#/">Tableau de bord</a>${icon('chevR', 12)}<span>${esc(t.title)}</span></div>
  <div class="grid" style="grid-template-columns:minmax(0,1fr) 330px;align-items:start">
    <div>
      <div class="card" style="overflow:hidden">
        ${coverHTML(t,';height:170px')}
        <div class="card-pad">
          <div class="row between" style="flex-wrap:wrap;gap:8px">
            <h1 style="font-size:20px">${esc(t.title)}</h1>
            ${done ? '<span class="badge b-gold">Formation terminée ✓</span>' : `<span class="badge b-violet">${pr.pct}% complété</span>`}
          </div>
          <p class="muted small mt8">${esc(t.longDesc || t.desc)}</p>
          <div class="tag-row mt16">
            <span class="pill">${icon('clock', 12)} ${t.hours} heures</span>
            <span class="pill">${icon('layers', 12)} ${t.chapters.length} chapitres · ${stepsOf(t).filter(s => s.kind === 'module').length} modules</span>
            <span class="pill">${icon('star', 12)} ${t.rating}/5</span>
          </div>
          ${!done ? `<div class="mt16"><a class="btn btn-primary" href="${stepHref(t, nextStep(u.id, t) || stepsOf(t)[0])}">${icon('play', 15)} ${pr.pct ? 'Reprendre la leçon' : 'Commencer la formation'}</a></div>` : ''}
          ${cert ? `<div class="banner gold mt16">${icon('award', 16)}<span><b>Certificat obtenu.</b> <a href="javascript:showCert('${cert.id}')" style="text-decoration:underline">Voir mon certificat</a></span></div>` : ''}
          ${done && !cert && !S.certRequests.some(q => q.userId === u.id && q.trainingId === tid && q.status === 'pending') ? `
            <button class="btn btn-gold mt16" onclick="requestCert('${tid}')">${icon('award', 15)} Demander mon certificat</button>
            <div class="xs faint mt8">À 100 % de progression, demandez votre certificat : l’administration vous évalue, puis la génération se lance.</div>` : ''}
          ${S.certRequests.some(q => q.userId === u.id && q.trainingId === tid && q.status === 'pending') ? `<div class="banner warn mt16">${icon('clock', 15)}<span><b>Demande de certificat en cours.</b> L’administration programme votre évaluation.</span></div>` : ''}
        </div>
      </div>

      <h3 class="mt24 mb16" style="font-size:15px">Programme de la formation</h3>
      ${t.chapters.map((ch, ci) => chapterBlock(u, t, ch, ci)).join('')}
    </div>
    <div>
      ${sideProgress(u, t)}
      <div class="card mt16" style="background:var(--grad-dark);border:none;color:#fff">
        <div style="padding:16px">
          <div class="eyebrow" style="color:var(--gold2)">Besoin d’aide ?</div>
          <p class="small mt8" style="color:#D9D3E8">Posez votre question depuis n’importe quel module : l’assistant ${esc(aiName())} répond immédiatement, votre coach sous 48 h.</p>
        </div>
      </div>
    </div>
  </div>`;
}
function chapterBlock(u, t, ch, ci) {
  return `<div class="cur-chapter">
    <div class="cur-ch-head">
      <span class="step-ico ${ch.modules.every(m => (S.progress[u.id] || {})[m.id]?.viewed) ? 's-done' : 's-cur'}">${icon('layers', 14)}</span>
      <div class="wrap"><h3>Chapitre ${ci + 1} — ${esc(ch.title)}</h3>
        <span class="xs faint">${ch.modules.length} module(s)${ch.exercise ? ' · exercice' : ''}${ch.assessment ? ' · évaluation' : ''}</span></div>
    </div>
    ${ch.modules.map(m => moduleRow(u, t, m)).join('')}
    ${ch.exercise ? exerciseRow(u, t, ch) : ''}
    ${ch.assessment ? assessmentRow(u, t, ch) : ''}
  </div>`;
}
function moduleRow(u, t, m) {
  const st = { kind: 'module', id: m.id };
  const doneM = (S.progress[u.id] || {})[m.id]?.viewed;
  const unlocked = stepUnlocked(u.id, t, st);
  return `<div class="cur-step ${unlocked ? 'click' : 'locked'}" ${unlocked ? `onclick="go('/formation/${t.id}/module/${m.id}')"` : ''}>
    <span class="step-ico ${doneM ? 's-done' : unlocked ? 's-cur' : 's-lock'}">${icon(doneM ? 'check' : unlocked ? 'play' : 'lock', 13)}</span>
    <div class="wrap"><div class="st-title">${esc(m.title)}</div><div class="st-meta">Vidéo ${m.ratio} · ${m.duration}</div></div>
    ${doneM ? '<span class="badge b-green">Vu</span>' : unlocked ? '<span class="badge b-violet">À suivre</span>' : ''}
  </div>`;
}
function exerciseRow(u, t, ch) {
  const ex = ch.exercise;
  const tries = ((S.exAttempts[u.id] || {})[ex.id] || []);
  const last = tries[tries.length - 1];
  return `<div class="cur-step click" onclick="go('/formation/${t.id}/exercice/${ch.id}')">
    <span class="step-ico ${last ? 's-done' : 's-gold'}">${icon('clipboard', 13)}</span>
    <div class="wrap"><div class="st-title">${esc(ex.title)}</div><div class="st-meta">Exercice de pratique · ne bloque pas la progression</div></div>
    ${last ? `<span class="badge b-green">${last.score}/${last.total}</span>` : '<span class="badge b-amber">À faire</span>'}
  </div>`;
}
function assessmentRow(u, t, ch) {
  const ev = ch.assessment;
  const st = { kind: 'assessment', id: ev.id, ref: ev };
  const unlocked = stepUnlocked(u.id, t, st);
  const doneA = stepDone(u.id, t, st);
  const pending = ev.type === 'submission' && S.submissions.some(x => x.userId === u.id && x.evId === ev.id && x.status === 'pending');
  return `<div class="cur-step ${unlocked ? 'click' : 'locked'}" ${unlocked ? `onclick="go('/formation/${t.id}/evaluation/${ch.id}')"` : ''}>
    <span class="step-ico ${doneA ? 's-done' : unlocked ? 's-gold' : 's-lock'}">${icon(doneA ? 'check' : unlocked ? ev.type === 'quiz' ? 'target' : 'upload' : 'lock', 13)}</span>
    <div class="wrap"><div class="st-title">${esc(ev.title)}</div>
      <div class="st-meta">${ev.type === 'quiz' ? `Évaluation bloquante · score minimum ${ev.minScore} %` : pending ? 'En correction — prochain chapitre verrouillé jusqu’à la validation' : 'Travail à soumettre · validation par un coach'}</div></div>
    ${doneA ? '<span class="badge b-green">Réussie</span>' : pending ? '<span class="badge b-amber">En correction</span>' : unlocked ? '<span class="badge b-gold">À passer</span>' : '<span class="badge b-grey">Verrouillée</span>'}
  </div>`;
}
function sideProgress(u, t) {
  const pr = trainingProgress(u.id, t);
  return `<div class="card card-pad">
    <div class="eyebrow">Votre progression</div>
    <div class="mt8" style="font-size:22px;font-weight:800">${pr.pct}%</div>
    <div class="mt8">${pbarHTML(pr.pct, trainingCompleted(u.id, t) ? 'gold' : '')}</div>
    <div class="xs muted mt8">${pr.done} module(s) terminé(s) sur ${pr.total} · progression personnelle et privée</div>
  </div>`;
}

/* ---------------- MODULE (lecteur) ---------------- */
const RATIO_CLS = { '16:9': 'r-169', '9:16': 'r-916', '4:3': 'r-43', '1:1': 'r-11' };
const PLAYER = { timer: null, playing: false, pct: 0, total: 0, tid: null, mid: null, speed: 1, track: 'fr', setOpen: false };
function parseDur(d) { const [m, s] = d.split(':').map(Number); return m * 60 + (s || 0); }
function fmtSec(x) { const m = Math.floor(x / 60), s = Math.floor(x % 60); return `${m}:${String(s).padStart(2, '0')}`; }

function curriculumHTML(u, t, curMid) {
  return `<div class="card mt16" style="overflow:hidden">
    <div class="card-head"><h3>Programme</h3><span class="xs faint">${stepsOf(t).filter(s => s.kind === 'module').length} modules</span></div>
    ${t.chapters.map((ch, ci) => `
      <div style="padding:10px 16px 4px"><span class="xs" style="letter-spacing:.07em;text-transform:uppercase;color:var(--faint);font-weight:800">Chapitre ${ci + 1} — ${esc(ch.title)}</span></div>
      ${ch.modules.map(m => {
        const dn = (S.progress[u.id] || {})[m.id]?.viewed;
        const un = stepUnlocked(u.id, t, { kind: 'module', id: m.id });
        const cur = m.id === curMid;
        return `<div class="cur-step ${un ? 'click' : 'locked'} ${cur ? 'cur-now' : ''}" style="padding:9px 16px" ${un ? `onclick="go('/formation/${t.id}/module/${m.id}')"` : ''}>
          <span class="step-ico ${dn ? 's-done' : un ? 's-cur' : 's-lock'}" style="width:24px;height:24px;border-radius:7px">${icon(dn ? 'check' : un ? 'play' : 'lock', 11)}</span>
          <div class="wrap"><div class="st-title" style="font-size:12.5px">${esc(m.title)}</div></div>
          ${cur ? '<span class="badge b-violet">En cours</span>' : dn ? '<span class="xs faint">Terminée ✓</span>' : ''}
        </div>`;
      }).join('')}
      ${ch.assessment ? (() => {
        const st = { kind: 'assessment', id: ch.assessment.id, ref: ch.assessment };
        const un = stepUnlocked(u.id, t, st); const dn = stepDone(u.id, t, st);
        return `<div class="cur-step ${un ? 'click' : 'locked'}" style="padding:9px 16px" ${un ? `onclick="go('/formation/${t.id}/evaluation/${ch.id}')"` : ''}>
          <span class="step-ico ${dn ? 's-done' : un ? 's-gold' : 's-lock'}" style="width:24px;height:24px;border-radius:7px">${icon(dn ? 'check' : 'award', 11)}</span>
          <div class="wrap"><div class="st-title" style="font-size:12.5px">Évaluation du chapitre</div></div>
        </div>`;
      })() : ''}
    `).join('')}
  </div>`;
}
function pToolsHTML() {
  return `<span class="p-tools">
    <button class="fs-btn" onclick="pSettingsToggle()" title="Réglages de lecture">${icon('settings', 14)}${PLAYER.speed !== 1 ? `<em>${PLAYER.speed}×</em>` : ''}</button>
    <button class="fs-btn" onclick="goFullscreen()" title="Plein écran">${icon('expand', 14)}</button>
  </span>`;
}
const REACT_EMOJIS = ['👍', '❤️', '🔥', '👏', '😂', '🤩'];
function setMTab(t) { CP.mTab = t; render(); }
/* Vidéos complémentaires : jouées dans le lecteur, jamais comptées dans la progression */
function playExtra(i) { CP.xv = i; CP.rv = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); toast('Vidéo complémentaire chargée dans le lecteur', '', 'play'); }
function playResVideo(i) { CP.rv = i; CP.xv = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); toast('Ressource vidéo chargée dans le lecteur', '', 'play'); }
function backToMain() { CP.xv = null; CP.rv = null; render(); }
function setReplyTo(id) { CP.replyTo = CP.replyTo === id ? null : id; render(); }
function showMoreComments() { CP.showAll = true; render(); }
function reactRowHTML(m, u) {
  const reacts = (S.reactions || []).filter(r => r.mid === m.id);
  return `<div class="react-row">
          ${REACT_EMOJIS.map(e => { const n = reacts.filter(r => r.emoji === e).length; const on = reacts.some(r => r.emoji === e && r.userId === u.id);
            return `<span class="react-bub ${on ? 'on' : ''}"><button class="react-main" onclick="toggleReact('${m.id}','${e}')" title="${on ? 'Retirer ma réaction' : 'Réagir au cours'}">${e}${n ? `<b>${n}</b>` : ''}</button><button class="react-plus" onclick="toggleReact('${m.id}','${e}')" title="${on ? 'Retirer ma réaction' : 'Ajouter ma réaction'}">${on ? '−' : '+'}</button></span>`; }).join('')}
          <span class="xs faint" style="margin-left:auto">${reacts.length ? reacts.length + ' réaction' + (reacts.length > 1 ? 's' : '') + ' des étudiants' : 'Réagissez — visible par tous les étudiants'}</span>
        </div>`;
}
function toggleReact(mid, em) {
  const uid = S.session.userId; S.reactions = S.reactions || [];
  const i = S.reactions.findIndex(r => r.mid === mid && r.userId === uid && r.emoji === em);
  if (i >= 0) S.reactions.splice(i, 1); else S.reactions.push({ mid, userId: uid, emoji: em });
  save('reactions');
  /* Mise à jour in-place : la lecture vidéo/audio n’est jamais interrompue ni remise à zéro */
  const row = document.querySelector('.react-row');
  if (row && typeof CP !== 'undefined' && CP.lastModule && CP.lastModule.id === mid && CP.lastUser) {
    row.outerHTML = reactRowHTML(CP.lastModule, CP.lastUser);
    return;
  }
  render();
}
function addComment(mid, replyTo) {
  const box = document.getElementById(replyTo ? 'replyBox' : 'cmtBox');
  const txt = (box ? box.value : '').trim();
  if (!txt) { toast('Écrivez d’abord votre commentaire.', 'err', 'message'); return; }
  S.comments = S.comments || [];
  S.comments.push({ id: 'c' + Date.now(), mid, userId: S.session.userId, text: txt, at: Date.now(), replyTo: replyTo || null });
  if (replyTo) {
    const parent = S.comments.find(c => c.id === replyTo);
    if (parent && parent.userId !== S.session.userId) {
      notify(parent.userId, 'reply', 'Quelqu’un a répondu à votre commentaire',
        (getUser(S.session.userId)?.name || 'Un membre') + ' : « ' + txt.slice(0, 70) + (txt.length > 70 ? '…' : '') + ' »');
    }
  }
  save('comments'); render();
  toast('Commentaire publié — visible par tous les étudiants ✓', 'ok', 'message');
}
function cmtNodeHTML(c, all) {
  const au = getUser(c.userId);
  const ini = (au?.name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const reps = all.filter(x => x.replyTo === c.id).sort((a, b) => a.at - b.at);
  return `<div class="cmt ${c.replyTo ? 'cmt-rep' : ''}">
    <span class="cmt-ava" style="background:${au?.color || '#6F6A80'}">${ini}</span>
    <div class="wrap">
      <div class="cmt-head"><b>${esc(au?.name || 'Membre')}</b><time>${timeAgo(c.at)}</time></div>
      <div class="cmt-txt">${esc(c.text)}</div>
      ${c.replyTo ? '' : `<button class="xs link" onclick="setReplyTo('${c.id}')">Répondre</button>`}
      ${CP.replyTo === c.id ? `<div class="cmt-form mt8"><textarea class="inp" id="replyBox" rows="1" placeholder="Répondre à ${esc(au?.name || 'ce membre')}…"></textarea><button class="btn btn-primary btn-sm" onclick="addComment('${c.mid}','${c.id}')">Répondre</button></div>` : ''}
      ${reps.map(r => cmtNodeHTML(r, all)).join('')}
    </div>
  </div>`;
}

function vModule(u, tid, mid) {
  const f = findModule(tid, mid);
  if (!f) return vNotFound();
  const { t, ch, m } = f;
  const ci = t.chapters.indexOf(ch);
  const st = { kind: 'module', id: m.id };
  if (!enrolledIn(u.id, tid)) return vTraining(u, tid);
  if (!stepUnlocked(u.id, t, st)) return lockedPage(t, 'Terminez d’abord les modules et évaluations précédents pour accéder à ce contenu.');
  const prog = (S.progress[u.id] || {})[m.id];
  const viewed = !!prog?.viewed;
  const steps = stepsOf(t); const idx = steps.findIndex(s => s.id === m.id && s.kind === 'module');
  const nxt = steps.slice(idx + 1).find(s => s.kind !== 'exercise');
  const sameMod = PLAYER.mid === m.id;
  PLAYER.tid = tid; PLAYER.mid = m.id; PLAYER.total = parseDur(m.duration);
  PLAYER.speed = u.playSpeed || 1; PLAYER.track = PLAYER.track || 'fr'; PLAYER.setOpen = false;
  if (!sameMod) PLAYER.pct = viewed ? 100 : (prog?.pct || 0);
  if (!sameMod) { PLAYER.playing = false; clearInterval(PLAYER.timer); }
  if (!sameMod) { CP.mTab = 'lesson'; CP.showAll = false; CP.replyTo = null; CP.xv = null; CP.rv = null; }
  const xv = CP.xv != null && (m.extraVideos || [])[CP.xv] ? m.extraVideos[CP.xv] : null;
  const rv = CP.rv != null && (m.resources || [])[CP.rv] && m.resources[CP.rv].type === 'video' ? m.resources[CP.rv] : null;
  const alt = xv ? { title: xv.title, ratio: xv.ratio || '16:9', url: xv.url || '' } : rv ? { title: rv.name, ratio: rv.ratio || '16:9', url: rv.url || '' } : null;
  /* Cadre élastique : il épouse le format de la vidéo chargée, jamais codé en dur */
  const curRatio = alt ? alt.ratio : m.ratio;
  const fitCls = curRatio === '9:16' ? 'fit-916' : curRatio === '1:1' ? 'fit-11' : curRatio === '4:3' ? 'fit-43' : '';

  const reacts = (S.reactions || []).filter(r => r.mid === m.id);
  const allCmt = (S.comments || []).filter(c => c.mid === m.id);
  const tops = allCmt.filter(c => !c.replyTo).sort((a, b) => b.at - a.at);
  const shown = CP.showAll ? tops : tops.slice(0, 3);

  return `
  <div class="breadcrumb"><a href="#/formation/${t.id}">${esc(t.title)}</a>${icon('chevR', 12)}<span>Chapitre ${ci + 1} — ${esc(ch.title)}</span></div>
  <div class="mod-tabs">
    <button class="mtab ${CP.mTab === 'lesson' ? 'on' : ''}" onclick="setMTab('lesson')">Leçon</button>
    <button class="mtab ${CP.mTab === 'comments' ? 'on' : ''}" onclick="setMTab('comments')">Commentaires <span class="cnt">${allCmt.length}</span></button>
  </div>
  <div class="mod-grid ${CP.mTab === 'comments' ? 'tab-comments' : ''}">
    <div>
      <div class="pane pane-lesson" style="display:${CP.mTab === 'lesson' ? '' : 'none'}">
      <div class="card ${fitCls}" style="overflow:hidden">
        <div class="player-stage">
          <div class="player-box ${RATIO_CLS[alt ? alt.ratio : m.ratio] || 'r-169'}" id="playerBox">
            ${alt ? (alt.url ? embedHTML(alt.url, alt.ratio) : `
            <div class="player-face" id="playerFace">
              <span class="ratio-tag">${alt.ratio}</span>
              <button class="play-btn" id="playBtn" onclick="playToggle()">${icon('play', 22)}</button>
              <div class="small" style="opacity:.85">${esc(alt.title)}</div>
              <div class="xs" style="opacity:.55">Vidéo complémentaire · lecture simulée — hors progression</div>
            </div>`) : (m.videoUrl ? embedHTML(m.videoUrl, m.ratio) : `
            <div class="player-face" id="playerFace">
              <span class="ratio-tag">${m.ratio}</span>
              <button class="play-btn" id="playBtn" onclick="playToggle()">${icon('play', 22)}</button>
              <div class="small" style="opacity:.85">${esc(m.title)}</div>
              <div class="xs" style="opacity:.55">${m.duration} · lecture simulée</div>
            </div>`)}
          </div>
        </div>
        <div class="player-ui">
          ${alt ? `<div class="p-row"><span class="t">${esc(alt.title)} · hors progression</span>${pToolsHTML()}</div>` : (m.videoUrl ? `<div class="p-row"><span class="t">Lecture réelle — marquez le module comme terminé après visionnage</span>${pToolsHTML()}</div>` : `
          <div class="p-seek" id="pSeek" onclick="seekPlayer(event)"><i id="pFill" style="width:${PLAYER.pct}%"></i></div>
          <div class="p-row">
            <button class="icon-btn" style="color:#fff;width:28px;height:28px" onclick="playToggle()" id="playBtn2">${icon('play', 15)}</button>
            <span class="t" id="pTime">0:00 / ${m.duration}</span>
            ${pToolsHTML()}
          </div>`)}
          <div class="p-sheet" id="pSheet" style="display:${PLAYER.setOpen ? 'flex' : 'none'}">
            <div><span class="ps-lb">Vitesse de lecture</span>
              <div class="ps-chips">${[0.75, 1, 1.25, 1.5, 2].map(sp => `<button class="ps-chip ${PLAYER.speed === sp ? 'on' : ''}" onclick="setSpeed(${sp})">${sp === 1 ? 'Normale' : sp + '×'}</button>`).join('')}</div></div>
            <div><span class="ps-lb">Audio</span>
              <div class="ps-chips">
                <button class="ps-chip ${PLAYER.track === 'fr' ? 'on' : ''}" onclick="setTrack('fr')">Français · original</button>
                <button class="ps-chip ${PLAYER.track === 'en' ? 'on' : ''}" onclick="setTrack('en')">English · doublée</button>
              </div>
              <div class="ps-note">Doublage activé vidéo par vidéo dès qu’une piste doublée est déposée .</div></div>
          </div>
        </div>
        ${(() => { CP.lastModule = m; CP.lastUser = u; return reactRowHTML(m, u); })()}
        <div class="card-pad">
          <div class="row between" style="flex-wrap:wrap;gap:10px">
            <div><div class="eyebrow">Chapitre ${ci + 1} — ${esc(ch.title)}</div><h2 style="font-size:18px;margin-top:3px">${esc(m.title)}</h2></div>
            ${viewed ? '<span class="badge b-green">Module terminé ✓</span>' : `<button class="btn btn-primary btn-sm" onclick="completeModule('${tid}','${m.id}')">${icon('check', 14)} Marquer comme terminé</button>`}
          </div>
          ${viewed && chapterDone(u.id, t, ci) && t.chapters[ci + 1] ? `<div class="banner info mt16">${icon('check', 16)}<span><b>Chapitre ${ci + 1} terminé !</b> Le chapitre ${ci + 2} — ${esc(t.chapters[ci + 1].title)} — est débloqué.</span><button class="btn btn-primary btn-sm" style="margin-left:auto;flex:none" onclick="CP.drill={tid:'${tid}',ci:${ci + 1}};go('/formations')">Ouvrir le chapitre ${ci + 2}</button></div>` : ''}
        </div>
      </div>
      ${alt ? `<div class="alt-back"><button class="btn btn-sm" onclick="backToMain()">${icon('chevL', 12)} Revenir à la vidéo principale</button></div>` : ''}

      ${m.resources.length ? `
      <div class="card mt16">
        <div class="card-head"><h3>Ressources complémentaires</h3><span class="xs faint">${m.resources.length} fichier(s)</span></div>
        <div class="res-list">${m.resources.map(rs => `
          <div class="res-item">
            <span class="res-ico ${rs.type === 'img' ? 'img' : rs.type === 'doc' ? 'doc' : ''}">${icon(rs.type === 'img' ? 'eye' : rs.type === 'doc' ? 'file' : 'download', 15)}</span>
            <div class="wrap"><b style="font-size:13px">${esc(rs.name)}</b><div class="xs faint">${rs.type.toUpperCase()} · ${rs.size}</div></div>
            ${rs.type === 'video' ? (rs.url ? `<button class="btn btn-ghost btn-sm" onclick="playResVideo(${m.resources.indexOf(rs)})">${icon('play', 14)} Lire</button>` : `<button class="btn btn-ghost btn-sm" onclick="toast('Ajoutez une URL vidéo dans Enrichir pour la lire ici.','err','play')">${icon('play', 14)} Lire</button>`) : `<button class="btn btn-ghost btn-sm" onclick="toast('Téléchargement sécurisé démarré','','download')">${icon('download', 14)} Télécharger</button>`}
          </div>`).join('')}</div>
      </div>` : ''}

      ${m.extraVideos.length ? `
      <div class="card mt16">
        <div class="card-head"><h3>Vidéos complémentaires</h3><span class="xs faint">Pour aller plus loin</span></div>
        <div class="grid g2" style="padding:14px;gap:10px">
          ${m.extraVideos.map((v, i) => `
          <div class="vid-card ${CP.xv === i ? 'on' : ''}" onclick="playExtra(${i})">
            <span class="vid-thumb ${v.ratio === '9:16' ? 'v916' : ''}">${icon('play', 16)}</span>
            <div class="wrap"><b style="font-size:12.8px">${esc(v.title)}</b><div class="xs faint mt4">${v.ratio} · ${v.duration}</div></div>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="row between mt16" style="flex-wrap:wrap;gap:10px">
        <a class="btn" href="#/formation/${t.id}">${icon('chevL', 14)} Retour à la formation</a>
        ${viewed && nxt ? `<a class="btn btn-primary" href="${stepHref(t, nxt)}">${nxt.kind === 'assessment' ? `Passer : ${esc(nxt.ref.title)}` : 'Module suivant'} ${icon('arrowR', 14)}</a>` : ''}
      </div>
      </div>

    </div>

    <div class="mod-side">
      <div class="pane" style="display:${CP.mTab === 'comments' ? '' : 'none'}">
        <div class="card" style="overflow:hidden">
          <div class="card-head"><h3>Commentaires du cours</h3><span class="xs faint">${allCmt.length} · visibles par tous les étudiants</span></div>
          <div class="card-pad">
            <div class="cmt-form">
              <textarea class="inp" id="cmtBox" rows="2" placeholder="Écrivez votre commentaire ici"></textarea>
              <button class="btn btn-primary btn-sm" onclick="addComment('${m.id}', null)">Publier</button>
            </div>
            <div class="cmt-scroll">${shown.map(c => cmtNodeHTML(c, allCmt)).join('') || '<div class="xs faint mt16">Aucun commentaire pour l’instant — soyez la première personne à réagir au cours !</div>'}</div>
            ${tops.length > 3 && !CP.showAll ? `<button class="btn btn-sm btn-block mt8" onclick="showMoreComments()">Voir plus de commentaires (${tops.length - 3})</button>` : ''}
          </div>
        </div>
      </div>
      
      <div class="side-extra">
      <div class="card">
        <div class="card-head"><h3>Une question ?</h3></div>
        <div style="padding:14px 16px" class="col" >
          <button class="btn btn-primary btn-block" onclick="openChat('${t.id}','${m.id}','ai')">${icon('sparkles', 15)} Demander à ${esc(aiName())}</button>
          <button class="btn btn-block" onclick="openChat('${t.id}','${m.id}','coach')">${icon('message', 15)} Écrire à mon coach</button>
          <div class="xs faint" style="text-align:center">${esc(aiName())} (IA) répond immédiatement · Coach humain sous 48 h</div>
        </div>
      </div>
      ${curriculumHTML(u, t, m.id)}
      </div>
    </div>
  </div>`;
}
function lockedPage(t, msg) {
  return `<div class="breadcrumb"><a href="#/formation/${t.id}">${esc(t.title)}</a></div>
  <div class="card lock-hero" style="max-width:560px;margin:30px auto">
    <div class="lk">${icon('lock', 26)}</div>
    <h2>Contenu verrouillé</h2>
    <p class="muted mt8 small">${msg}</p>
    <a class="btn btn-primary mt16" href="#/formation/${t.id}">Voir ma progression</a>
  </div>`;
}
/* Plein écran réel, avec repli CSS si l'API est refusée (iframe d'aperçu restreinte) */
let FS_Z = { s: 1, d: null, s0: 1 };
function goFullscreen() {
  const el = document.getElementById('playerBox') || document.querySelector('.player-box'); if (!el) return;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) {
    try {
      const r = req.call(el);
      if (r && r.catch) { r.catch(() => cssFullscreen(true)); return; }
      /* vieux webkit sans promesse : vérifier puis repli */
      setTimeout(() => { if (!(document.fullscreenElement || document.webkitFullscreenElement)) cssFullscreen(true); }, 300);
      return;
    } catch (e) { /* repli ci-dessous */ }
  }
  cssFullscreen(true);
}
function cssFullscreen(on) {
  const st = document.querySelector('.player-stage'); if (!st) return;
  st.classList.toggle('fs-css', !!on);
  let btn = document.getElementById('fsExit');
  if (on && !btn) {
    btn = document.createElement('button');
    btn.id = 'fsExit'; btn.className = 'fs-exit'; btn.title = 'Quitter le plein écran';
    btn.innerHTML = icon('x', 16);
    btn.onclick = () => cssFullscreen(false);
    st.appendChild(btn);
  } else if (!on && btn) btn.remove();
  fsAttach(!!on);
  if (on) document.addEventListener('keydown', fsEsc); else document.removeEventListener('keydown', fsEsc);
}
function fsEsc(e) {
  if (e.key !== 'Escape') return;
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else cssFullscreen(false);
}
function fsAttach(on) {
  const st = document.querySelector('.player-stage'); if (!st) return;
  if (on) {
    FS_Z = { s: 1, d: null, s0: 1 };
    st.addEventListener('touchmove', fsPinch, { passive: false }); st.addEventListener('touchend', fsPinchEnd); st.addEventListener('touchstart', fsPinchEnd);
  } else {
    st.removeEventListener('touchmove', fsPinch); st.removeEventListener('touchend', fsPinchEnd); st.removeEventListener('touchstart', fsPinchEnd);
    const b = st.querySelector('.player-box'); if (b) b.style.transform = ''; FS_Z = { s: 1, d: null, s0: 1 };
  }
}
function fsApplyZoom() {
  const st = document.querySelector('.player-stage'); if (!st) return;
  const b = st.querySelector('.player-box'); if (b) b.style.transform = 'scale(' + FS_Z.s.toFixed(2) + ')';
}
function fsPinch(e) {
  const t = e.touches; if (!t || t.length !== 2) return;
  e.preventDefault();
  const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  if (!FS_Z.d) { FS_Z.d = d; FS_Z.s0 = FS_Z.s; }
  FS_Z.s = Math.max(0.6, Math.min(3, FS_Z.s0 * d / FS_Z.d));
  fsApplyZoom();
}
function fsPinchEnd() { FS_Z.d = null; }
function fsChange() {
  const on = document.fullscreenElement || document.webkitFullscreenElement;
  const st = document.querySelector('.player-stage');
  if (on && st) st.classList.remove('fs-css');
  fsAttach(!!on);
}
document.addEventListener('fullscreenchange', fsChange);
document.addEventListener('webkitfullscreenchange', fsChange);
function playToggle() {
  if (PLAYER.playing) { PLAYER.playing = false; clearInterval(PLAYER.timer); updatePlayerUI(); return; }
  PLAYER.playing = true;
  if (PLAYER.pct >= 100) PLAYER.pct = 0;
  PLAYER.timer = setInterval(() => {
    PLAYER.pct += 1.6 * (PLAYER.speed || 1);
    if (PLAYER.pct >= 100) {
      PLAYER.pct = 100; PLAYER.playing = false; clearInterval(PLAYER.timer);
      updatePlayerUI();
      if (CP.xv == null && CP.rv == null) completeModule(PLAYER.tid, PLAYER.mid, true);
      return;
    }
    updatePlayerUI();
  }, 140);
  updatePlayerUI();
}
function pSettingsToggle() {
  PLAYER.setOpen = !PLAYER.setOpen;
  const el = document.getElementById('pSheet'); if (el) el.style.display = PLAYER.setOpen ? 'flex' : 'none';
}
function setSpeed(sp) {
  PLAYER.speed = sp;
  const u = getUser(S.session.userId); if (u) { u.playSpeed = sp; save(); }
  render();
  toast(sp === 1 ? 'Vitesse de lecture normale' : 'Vitesse de lecture : ' + sp + '×', '', 'settings');
}
function setTrack(tr) {
  PLAYER.track = tr; render();
  toast(tr === 'fr' ? 'Audio : Français (version originale)' : 'Audio : English (version doublée)', 'ok', 'settings');
}
function seekPlayer(e) {
  const bar = document.getElementById('pSeek'); const r = bar.getBoundingClientRect();
  PLAYER.pct = Math.max(0, Math.min(100, Math.round((e.clientX - r.left) / r.width * 100)));
  updatePlayerUI();
}
function updatePlayerUI() {
  const fill = document.getElementById('pFill'); if (!fill) return;
  fill.style.width = PLAYER.pct + '%';
  const t = document.getElementById('pTime'); if (t) t.textContent = `${fmtSec(PLAYER.pct / 100 * PLAYER.total)} / ${fmtSec(PLAYER.total)}`;
  const b1 = document.getElementById('playBtn'), b2 = document.getElementById('playBtn2');
  if (b1) b1.innerHTML = icon(PLAYER.playing ? 'pause' : 'play', 22);
  if (b2) b2.innerHTML = icon(PLAYER.playing ? 'pause' : 'play', 15);
}
function completeModule(tid, mid, silent) {
  const first = markModuleViewed(S.session.userId, mid);
  save('progress');
  if (first) maybeIssueCert(S.session.userId, tid);
  if (typeof rwActivity === 'function') {
    const tt = getTraining(tid);
    const seen = Object.keys(S.progress[S.session.userId] || {}).length;
    if (first && seen === 1) rwCourseStarted(S.session.userId);
    rwActivity(S.session.userId);
    if (tt) {
      rwChapterCheck(S.session.userId, tt);
      if (trainingProgress(S.session.userId, tt).pct === 100) rwTrainingComplete(S.session.userId, tid);
    }
  }
  save('progress');
  if (!silent) toast('Module marqué comme terminé ✓', 'ok');
  else toast('Vidéo terminée — module validé ✓', 'ok');
  const fm = findModule(tid, mid);
  if (fm) {
    const ci2 = fm.t.chapters.indexOf(fm.ch);
    if (typeof chapterDone === 'function' && chapterDone(S.session.userId, fm.t, ci2) && fm.t.chapters[ci2 + 1]) {
      CP.drill = { tid, ci: ci2 + 1 };
      toast('Chapitre ' + (ci2 + 1) + ' terminé — chapitre ' + (ci2 + 2) + ' débloqué ✓', 'ok', 'check');
    }
  }
  render();
  /* La récompense arrive ~1 seconde après « Marquer comme terminé », où que l'on soit */
  const uidv = S.session.userId;
  if (S.pendingReveal && S.pendingReveal[uidv] && !document.querySelector('.rw-veil')) {
    setTimeout(() => { if (S.pendingReveal && S.pendingReveal[uidv] && !document.querySelector('.rw-veil')) render(); }, 1000);
  }
}

/* ---------------- EXERCICE ---------------- */
function vExercise(u, tid, cid) {
  const { t, ch } = findChapter(tid, cid);
  if (!t || !ch?.exercise) return vNotFound();
  const ex = ch.exercise;
  const tries = ((S.exAttempts[u.id] || {})[ex.id] || []);
  const last = tries[tries.length - 1];
  return `
  <div class="breadcrumb"><a href="#/formation/${t.id}">${esc(t.title)}</a>${icon('chevR', 12)}<span>${esc(ch.title)}</span>${icon('chevR', 12)}<span>Exercice</span></div>
  <div style="max-width:760px;margin:0 auto">
    <div class="card card-pad mb16">
      <div class="row between" style="flex-wrap:wrap">
        <div><div class="eyebrow">Exercice de pratique</div><h1 style="font-size:19px;margin-top:3px">${esc(ex.title)}</h1></div>
        <span class="badge b-amber">${icon('clock', 11)} Non bloquant</span>
      </div>
      <p class="muted small mt8">${esc(ex.intro)}</p>
      ${last ? `<div class="banner ok mt16">${icon('checkCircle', 16)}<span>Dernier résultat : <b>${last.score}/${last.total}</b> — vous pouvez reprendre l’exercice autant de fois que vous voulez, puis continuer votre formation.</span></div>` : ''}
    </div>
    <div id="quizZone">${quizHTML(ex.questions, 'exform')}</div>
    <div class="row between mt16" id="quizActions">
      <a class="btn" href="#/formation/${t.id}">${icon('chevL', 14)} Continuer ma formation</a>
      <button class="btn btn-primary" onclick="submitExercise('${tid}','${cid}')">${icon('check', 15)} Vérifier mes réponses</button>
    </div>
  </div>`;
}
function quizHTML(questions, formId) {
  return `<form id="${formId}" class="col" style="gap:14px">
    ${questions.map((q, i) => `
    <div class="q-block">
      <span class="q-n">Question ${i + 1} · ${q.type === 'single' ? 'choix unique' : 'choix multiple'}</span>
      <h4>${esc(q.q)}</h4>
      ${q.opts.map((o, j) => `
        <label class="opt"><input type="${q.type === 'single' ? 'radio' : 'checkbox'}" name="q${i}" value="${j}"><span>${esc(o)}</span></label>`).join('')}
    </div>`).join('')}
  </form>`;
}
function collectAnswers(n) {
  const f = document.querySelector('form[id$="form"]'); const out = [];
  for (let i = 0; i < n; i++) {
    const els = [...document.querySelectorAll(`input[name="q${i}"]:checked`)].map(e => +e.value);
    out.push(els.length > 1 ? els : els.length === 1 ? els[0] : null);
  }
  return out;
}
function submitExercise(tid, cid) {
  const { t, ch } = findChapter(tid, cid); const ex = ch.exercise;
  const answers = collectAnswers(ex.questions.length);
  if (answers.some(a => a === null)) { toast('Répondez à toutes les questions avant de vérifier.', 'err', 'alert'); return; }
  const { score, total, detail } = gradeQuiz(ex.questions, answers);
  S.exAttempts[S.session.userId] = S.exAttempts[S.session.userId] || {};
  (S.exAttempts[S.session.userId][ex.id] = S.exAttempts[S.session.userId][ex.id] || []).push({ score, total, at: Date.now() });
  if (typeof rwActivity === 'function') rwActivity(S.session.userId);
  save();
  notify(S.session.userId, 'exercise', 'Exercice corrigé', `${ex.title} : ${score}/${total}.`);
  const zone0 = document.getElementById('quizZone');
  if (zone0) zone0.innerHTML = `<div class="quiz-load"><span class="ql-spin"></span><span>Vérification de vos réponses…</span></div>`;
  const acts0 = document.getElementById('quizActions');
  if (acts0) acts0.innerHTML = '';
  setTimeout(() => {
    const zone = document.getElementById('quizZone'); const acts = document.getElementById('quizActions');
    if (zone) zone.innerHTML = `<div class="corr">${correctionHTML(ex.questions, answers, detail)}</div>`;
    if (acts) acts.innerHTML = `
      <button class="btn" onclick="render()">${icon('refresh', 14)} Recommencer l’exercice</button>
      <a class="btn btn-primary" href="#/formation/${t.id}">Continuer la formation ${icon('arrowR', 14)}</a>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 1900);
}
function correctionHTML(questions, answers, detail) {
  return `<div class="col" style="gap:14px">${questions.map((q, i) => `
    <div class="q-block">
      <span class="q-n" style="color:${detail[i].ok ? 'var(--green)' : 'var(--red)'}">${detail[i].ok ? '✓ Correct' : '✗ Incorrect'}</span>
      <h4>${esc(q.q)}</h4>
      ${q.opts.map((o, j) => {
        const isRight = q.type === 'single' ? q.correct === j : q.correct.includes(j);
        const isMine = q.type === 'single' ? answers[i] === j : Array.isArray(answers[i]) && answers[i].includes(j);
        let cls = ''; if (isRight) cls = 'right'; else if (isMine && !isRight) cls = 'wrong';
        return `<div class="opt ${cls}" style="cursor:default">${icon(isRight ? 'check' : isMine ? 'x' : 'dot', 14, cls === 'right' ? 'style="color:var(--green)"' : '')}<span>${esc(o)}</span>${isMine ? '<span class="tag" style="color:var(--faint)">votre réponse</span>' : ''}</div>`;
      }).join('')}
      <div class="q-expl">${icon('sparkles', 12)} ${esc(q.expl)}</div>
    </div>`).join('')}</div>`;
}

/* ---------------- ÉVALUATION ---------------- */
function vEvaluation(u, tid, cid) {
  const { t, ch } = findChapter(tid, cid);
  if (!t || !ch?.assessment) return vNotFound();
  const ev = ch.assessment;
  const st = { kind: 'assessment', id: ev.id, ref: ev };
  if (!stepUnlocked(u.id, t, st)) return lockedPage(t, 'Cette évaluation se débloque après les modules du chapitre précédent.');
  if (ev.type === 'quiz') return evalQuizPage(u, t, ch, ev);
  return evalSubmissionPage(u, t, ch, ev);
}
let EQ = { key: null, idx: 0, answers: [], locked: false, lastOk: null };
function evalFailsStreak(u, ev) {
  const tr = ((S.evAttempts[u] || {})[ev.id] || []);
  let n = 0;
  for (let i = tr.length - 1; i >= 0; i--) { if (tr[i].reset) break; if (!tr[i].passed) n++; else break; }
  return n;
}
function checkOne(q, ans) {
  if (q.type === 'single') return ans === q.correct;
  const need = [...q.correct].sort().join(',');
  const got = (Array.isArray(ans) ? [...ans].sort() : []).join(',');
  return need === got;
}
function evalQuizPage(u, t, ch, ev) {
  const tries = ((S.evAttempts[u.id] || {})[ev.id] || []);
  const passed = tries.some(x => x.passed);
  const last = tries[tries.length - 1];
  if (passed) return `
    <div class="breadcrumb"><a href="#/formation/${t.id}">${esc(t.title)}</a>${icon('chevR', 12)}<span>Évaluation</span></div>
    <div class="card lock-hero" style="max-width:600px;margin:20px auto">
      <div class="lk" style="background:var(--green-soft);color:var(--green)">${icon('checkCircle', 28)}</div>
      <h2>Évaluation réussie — ${last.pct} %</h2>
      <p class="muted mt8 small">Score minimum requis : ${ev.minScore} %. Le contenu suivant est maintenant débloqué.</p>
      <a class="btn btn-primary mt16" href="#/formation/${t.id}">Continuer ma formation ${icon('arrowR', 14)}</a>
    </div>`;
  const fails = evalFailsStreak(u.id, ev);
  const attempt = Math.min(3, fails + 1);
  const key = u.id + ':' + ev.id;
  if (EQ.key !== key) EQ = { key, idx: 0, answers: Array(ev.questions.length).fill(null), locked: false, lastOk: null };
  const q = ev.questions[EQ.idx];
  const isLast = EQ.idx === ev.questions.length - 1;
  const mine = EQ.answers[EQ.idx];
  return `
  <div class="breadcrumb"><a href="#/formation/${t.id}">${esc(t.title)}</a>${icon('chevR', 12)}<span>Évaluation</span></div>
  <div style="max-width:760px;margin:0 auto">
    <div class="card card-pad mb16" style="border-color:var(--gold-line)">
      <div class="row between" style="flex-wrap:wrap">
        <div><div class="eyebrow" style="color:var(--gold)">Évaluation bloquante · Tentative ${attempt}/3</div><h1 style="font-size:19px;margin-top:3px">${esc(ev.title)}</h1></div>
        <span class="badge b-gold">Score minimum : ${ev.minScore} %</span>
      </div>
      <p class="muted small mt8">${esc(ev.intro)}</p>
      <div class="xs faint mt8">Une question à la fois · validation immédiate · les bonnes réponses ne sont jamais révélées.</div>
      ${last && !last.passed ? `<div class="banner warn mt16">${icon('alert', 15)}<span>Dernière tentative : <b>${last.pct} %</b> — il vous reste ${3 - fails} essai(s) sur cette série.</span></div>` : ''}
    </div>
    <div class="card card-pad" id="eqCard">
      <span class="q-n">Question ${EQ.idx + 1} / ${ev.questions.length} · ${q.type === 'single' ? 'choix unique' : 'choix multiple'}</span>
      <h4 style="margin:8px 0 12px;font-size:16px">${esc(q.q)}</h4>
      <form id="evform" class="col" style="gap:10px">
        ${q.opts.map((o, j) => {
          const sel = q.type === 'single' ? mine === j : Array.isArray(mine) && mine.includes(j);
          const cls = EQ.locked && sel ? (EQ.lastOk ? 'right' : 'wrong') : '';
          return `<label class="opt ${cls}" style="${EQ.locked ? 'cursor:default' : ''}"><input type="${q.type === 'single' ? 'radio' : 'checkbox'}" name="q${EQ.idx}" value="${j}" ${EQ.locked ? 'disabled' : ''} ${sel ? 'checked' : ''}><span>${esc(o)}</span></label>`;
        }).join('')}
      </form>
      ${EQ.locked ? `<div class="corr-status ${EQ.lastOk ? 'ok' : 'ko'}" style="margin-top:12px">${EQ.lastOk ? 'Bonne réponse ✓' : 'Mauvaise réponse ✗'}${isLast ? ' — terminez pour voir votre score' : ' — appuyez sur Suivant'}</div>` : ''}
    </div>
    <div class="row between mt16">
      <a class="btn" href="#/formation/${t.id}">${icon('chevL', 14)} Revenir au module</a>
      ${!EQ.locked ? `<button class="btn btn-gold" onclick="eqValidate('${t.id}','${ch.id}')">${icon('check', 15)} Valider ma réponse</button>` : (isLast ? `<button class="btn btn-primary" onclick="eqFinish('${t.id}','${ch.id}')">Terminer ${icon('arrowR', 14)}</button>` : `<button class="btn btn-primary" onclick="eqNext()">Suivant ${icon('arrowR', 14)}</button>`)}
    </div>
  </div>`;
}
function eqCollect(idx) {
  const els = [...document.querySelectorAll(`#evform input[name="q${idx}"]:checked`)].map(e => +e.value);
  return els.length > 1 ? els : els.length === 1 ? els[0] : null;
}
function eqValidate(tid, cid) {
  const { ch } = findChapter(tid, cid); const ev = ch.assessment;
  const ans = eqCollect(EQ.idx);
  if (ans === null || (Array.isArray(ans) && !ans.length)) { toast('Choisissez une réponse avant de valider.', 'err', 'alert'); return; }
  EQ.answers[EQ.idx] = ans;
  EQ.lastOk = checkOne(ev.questions[EQ.idx], ans);
  EQ.locked = true; render();
}
function eqNext() { EQ.idx++; EQ.locked = false; EQ.lastOk = null; render(); }
function eqFinish(tid, cid) {
  const { t, ch } = findChapter(tid, cid); const ev = ch.assessment; const u = S.session.userId;
  const detail = ev.questions.map((q, i) => checkOne(q, EQ.answers[i]));
  const score = detail.filter(Boolean).length; const total = ev.questions.length;
  const pct = Math.round(score / total * 100); const passed = pct >= ev.minScore;
  S.evAttempts[u] = S.evAttempts[u] || {};
  (S.evAttempts[u][ev.id] = S.evAttempts[u][ev.id] || []).push({ score, total, pct, passed, at: Date.now() });
  notify(u, 'eval', passed ? 'Évaluation réussie ✓' : 'Évaluation non réussie', `${ev.title} : ${pct} % (minimum ${ev.minScore} %).`);
  let resetMsg = '';
  if (passed) {
    maybeIssueCert(u, tid); if (typeof rwRecovery === 'function') { rwActivity(u); rwRecovery(u, 'évaluation validée après une reprise'); }
  } else {
    if (typeof rwSetback === 'function') rwSetback(u, 'évaluation à reprendre');
    if (evalFailsStreak(u, ev) >= 3) {
      ch.modules.forEach(m => { const p = (S.progress[u] || {})[m.id]; if (p) { delete p.viewed; delete p.pct; } });
      (S.evAttempts[u][ev.id]).push({ reset: true, at: Date.now() });
      resetMsg = ' 3 échecs : le chapitre redevient non terminé, revoyez ses modules pour une nouvelle série.';
      notify(u, 'eval', 'Chapitre à revoir', `« ${ch.title} » : modules repassés « à suivre » après 3 échecs à l’évaluation.`);
    }
  }
  if (typeof rwActivity === 'function') rwActivity(u);
  save();
  EQ = { key: null, idx: 0, answers: [], locked: false, lastOk: null };
  toast(passed ? `Évaluation réussie : ${pct} % 🎉` : `Score : ${pct} % — minimum ${ev.minScore} %.${resetMsg}`, passed ? 'ok' : 'err', 'target');
  render();
}
function evalSubmissionPage(u, t, ch, ev) {
  const mine = S.submissions.filter(x => x.userId === u.id && x.evId === ev.id).sort((a, b) => b.at - a.at);
  const lastSub = mine.find(x => x.status !== 'replaced');
  const pending = mine.find(x => x.status === 'pending');
  const approved = mine.find(x => x.status === 'approved');
  const statusBadge = s => ({ pending: '<span class="badge b-amber">En attente de correction</span>', approved: '<span class="badge b-green">Validée ✓</span>', rejected: '<span class="badge b-red">Refusée</span>', retry: '<span class="badge b-amber">Nouvelle tentative demandée</span>' }[s]);
  return `
  <div class="breadcrumb"><a href="#/formation/${t.id}">${esc(t.title)}</a>${icon('chevR', 12)}<span>Évaluation</span></div>
  <div style="max-width:760px;margin:0 auto">
    <div class="card card-pad mb16" style="border-color:var(--gold-line)">
      <div class="row between" style="flex-wrap:wrap">
        <div><div class="eyebrow" style="color:var(--gold)">Évaluation bloquante · validation humaine</div><h1 style="font-size:19px;margin-top:3px">${esc(ev.title)}</h1></div>
        ${approved ? '<span class="badge b-green">Validée ✓</span>' : pending ? statusBadge('pending') : ''}
      </div>
      <p class="muted small mt8">${esc(ev.intro)}</p>
      <div class="xs faint mt8">${icon('paperclip', 12)} ${ev.accepts}</div>
    </div>

    ${approved ? `<div class="banner ok mb16">${icon('checkCircle', 16)}<span><b>Travail validé.</b> ${approved.feedback ? 'Retour du coach : ' + esc(approved.feedback) : 'Cette évaluation est réussie, le chapitre est débloqué.'}</span></div>` : ''}
    ${pending ? `<div class="banner warn mb16">${icon('clock', 16)}<span>Votre soumission « ${esc(pending.file)} » est en cours de correction par un coach. Vous restez en attente jusqu’à sa validation — <b>le chapitre suivant reste verrouillé</b> tant que votre travail n’a pas été validé par un coach.</span></div>` : ''}
    ${lastSub && !pending && !approved && (lastSub.status === 'retry' || lastSub.status === 'rejected') ? `<div class="banner warn mb16">${icon('refresh', 16)}<span><b>Nouvelle tentative demandée.</b> Resoumettez votre travail ci-dessous — le chapitre suivant restera verrouillé jusqu’à sa validation.</span></div>` : ''}

    ${mine.length ? `<div class="card mb16"><div class="card-head"><h3>Mes soumissions</h3></div>
      ${mine.map(x => `<div class="res-item">
        <span class="res-ico doc">${icon('file', 15)}</span>
        <div class="wrap"><b style="font-size:13px">${esc(x.file)}</b><div class="xs faint">${x.size} · ${timeAgo(x.at)}</div>
        ${x.feedback && x.status !== 'pending' && x.status !== 'approved' ? `<div class="small mt4" style="color:var(--red)"><b>Retour du coach :</b> ${esc(x.feedback)}</div>` : ''}
        ${x.feedback && x.status === 'approved' ? `<div class="small mt4 muted"><b>Retour :</b> ${esc(x.feedback)}</div>` : ''}</div>
        ${statusBadge(x.status)}
      </div>`).join('')}
    </div>` : ''}

    ${!pending && !approved ? `
    <div class="card card-pad">
      <h3 style="font-size:14px" class="mb8">${mine.length ? 'Nouvelle tentative' : 'Soumettre mon travail'}</h3>
      <div class="field"><label>Fichier (PDF, document, audio ou vidéo)</label>
        <input type="file" id="subFile" class="inp">
        <div class="hint">Limites : audio 20 Mo · vidéo 128 Mo · document 10 Mo. Votre fichier est transmis en toute sécurité à votre coach puis <b>supprimé automatiquement après la correction</b>, quelle que soit la décision.</div>
      </div>
      <div class="field"><label>Note pour le coach (facultatif)</label><textarea class="inp" id="subNote" placeholder="Expliquez brièvement votre travail…"></textarea></div>
      <button class="btn btn-gold" onclick="submitWork('${t.id}','${ev.id}')">${icon('upload', 15)} Soumettre pour correction</button>
    </div>` : ''}
    <div class="mt16"><a class="btn" href="#/formation/${t.id}">${icon('chevL', 14)} Retour à la formation</a></div>
  </div>`;
}
function submitWork(tid, evId) {
  const fileEl = document.getElementById('subFile');
  const f = fileEl && fileEl.files && fileEl.files[0];
  if (!f) return toast('Choisissez d’abord le fichier à soumettre.', 'err', 'paperclip');
  /* DAVAR DATA LIFECYCLE : contrôle taille + extension + MIME avant tout stockage */
  const v = lcValidateUpload(f.name, f.size, f.type);
  if (!v.ok) return toast(v.reason, 'err', 'alert');
  const note = document.getElementById('subNote')?.value?.trim() || '';
  const rd = new FileReader();
  rd.onload = e => {
    /* §6/§7 : une seule soumission active — l'ancien fichier est écrasé, pas accumulé */
    lcReplaceActiveFiles(S.session.userId, evId);
    S.submissions.filter(x => x.userId === S.session.userId && x.evId === evId && x.status === 'pending')
      .forEach(x => { x.status = 'replaced'; });
    const rec = { id: uid(), userId: S.session.userId, trainingId: tid, evId, file: f.name, size: lcSize(f.size), mime: f.type || '', note, status: 'pending', at: Date.now(), feedback: null };
    S.submissions.push(rec);
    lcStoreFile({ kind: v.kind, owner: rec.userId, reason: 'Évaluation en cours de correction', refType: 'submission', refId: rec.id, mime: f.type || '', sizeBytes: f.size, name: f.name, dataUrl: e.target.result, expiresAt: Date.now() + 14 * DAY, status: 'active', rule: 'Suppression dès la décision de correction' });
    if (typeof rwActivity === 'function') rwActivity(S.session.userId);
    _submitWorkNotify(rec);
    save('progress'); render();
    toast('Travail soumis ✓ Votre fichier sera supprimé automatiquement après la correction.', 'ok', 'upload');
  };
  rd.onerror = () => toast('Impossible de lire ce fichier. Vérifiez son intégrité puis réessayez.', 'err', 'alert');
  rd.readAsDataURL(f);
  return;
}
function _submitWorkNotify(rec) {
  notify('u-yann', 'admin', 'Nouvelle soumission à corriger', `${getUser(rec.userId).name} — ${rec.file}`);
}

/* ---------------- CATALOGUE & CHECKOUT ---------------- */
function trainingCard(t, owned) {
  return `<div class="card t-card" onclick="${owned ? `go('/formation/${t.id}')` : `startPurchase('${t.id}')`}" style="cursor:pointer">
    <div class="t-cover" style="${coverStyle(t)}">
      <span class="lvl badge b-dark">${t.level}</span>
      ${t.coverImg ? '' : `<span class="mono">${t.mono}</span>`}
    </div>
    <div class="t-body">
      <div class="xs faint">${t.code} · ⭐ ${t.rating}</div>
      <h3>${esc(t.title)}</h3>
      <p class="desc">${esc(t.desc)}</p>
      <div class="t-meta"><span>${icon('clock', 12)} ${t.hours} h</span><span>${icon('layers', 12)} ${t.chapters.length} chapitres</span><span>${icon('cap', 12)} Certificat</span></div>
      <div class="row between mt8">
        <span class="price">${fmtMoney(t.price)}</span>
        ${owned ? '<span class="badge b-green">Déjà acquise ✓</span>' : `<span class="btn btn-primary btn-sm" onclick="event.stopPropagation();startPurchase('${t.id}')">Obtenir ${icon('arrowR', 13)}</span>`}
      </div>
    </div>
  </div>`;
}
function vCatalog(u) {
  const avail = S.trainings.filter(t => t.published);
  const notOwned = avail.filter(t => !enrolledIn(u.id, t.id));
  const booking = S.settings.chariow.coachingBooking;
  return `
  <div class="page-head"><div><h1>Découvrir plus de formations</h1><p>Des formations que vous ne possédez pas encore, prêtes à rejoindre votre campus.</p></div></div>
  ${notOwned.length ? `<div class="grid g3">${notOwned.map(t => trainingCard(t, false)).join('')}</div>` : emptyState('checkCircle', 'Vous possédez déjà toutes les formations publiées', '')}
  <h3 class="mt32 mb16" style="font-size:15px">Toutes les formations publiées</h3>
  <div class="grid g3">${avail.filter(t => enrolledIn(u.id, t.id)).map(t => trainingCard(t, true)).join('') || `<div class="empty small">Aucune formation acquise pour le moment.</div>`}</div>
  ${booking ? `
  <h3 class="mt32 mb16" style="font-size:15px">Aller plus loin</h3>
  <div class="card card-pad" style="border-color:var(--gold-line);background:linear-gradient(135deg,var(--gold-soft),var(--card))">
    <div class="row" style="flex-wrap:wrap;gap:14px">
      <span class="step-ico s-gold" style="width:46px;height:46px">${icon('target', 20)}</span>
      <div class="wrap"><b style="font-size:15px">Coaching personnel avec le coach principal</b>
        <div class="small muted mt4">Une séance individuelle pour préparer un discours, un entretien ou un événement. Réservation et paiement sécurisés.</div></div>
      <button class="btn btn-gold" onclick="window.open('${booking}','_blank');toast('Réservation ouverte dans un nouvel onglet','gold','external')">${icon('external', 14)} Réserver une séance</button>
    </div>
  </div>` : ''}`;
}

const CHECKOUT = { step: 1, method: 'wave', tid: null, ref: null };
/* Agrégateur Money Fusion (Fusion Pay) — plateforme ivoirienne (SC DIGITAL) :
   mobile money Wave / Orange Money / MTN MoMo / Moov Money. Frais entrants 3,5 %,
   supportés par l'étudiant et ajoutés au prix affiché. Carte internationale → Chariow. */
const MF_METHODS = [
  { id: 'wave', lbl: 'Wave', col: '#1BB7E8', sub: 'Mobile money' },
  { id: 'om', lbl: 'Orange Money', col: '#FF7900', sub: 'Mobile money' },
  { id: 'momo', lbl: 'MTN MoMo', col: '#FFCC00', sub: 'Mobile money' },
  { id: 'moov', lbl: 'Moov Money', col: '#0057B8', sub: 'Mobile money' }
];
const MF_RATE = 0.035;
const PAY_NUMBERS = { wave: '+225 07 59 00 11 22', om: '+225 07 59 00 11 22', momo: '+225 05 44 00 33 44' };
function vCheckout(u, tid) {
  const t = getTraining(tid);
  if (!t) return vNotFound();
  if (CHECKOUT.tid !== tid) {
    CHECKOUT.tid = tid; CHECKOUT.step = 1; CHECKOUT.method = 'wave';
    CHECKOUT.ref = 'DAV-' + Math.floor(1000 + Math.random() * 9000);
  }
  if (enrolledIn(u.id, tid) && CHECKOUT.step !== 3) {
    return `<div class="card lock-hero" style="max-width:560px;margin:40px auto">
      <div class="lk" style="background:var(--green-soft);color:var(--green)">${icon('checkCircle', 26)}</div>
      <h2>Vous possédez déjà cette formation</h2>
      <p class="muted mt8 small">Aucun double achat, aucun double compte : elle est déjà dans votre espace.</p>
      <a class="btn btn-primary mt16" href="#/formation/${t.id}">Ouvrir la formation</a></div>`;
  }
  const pendingDecl = S.sales.find(s => s.userId === u.id && s.trainingId === tid && s.status === 'declaré');
  if (pendingDecl) return pendingDeclarationHTML(u, t, pendingDecl);
  const methods = [
    ['wave', 'Wave', '#1BB7E8', 'Réception gratuite · 0 % de frais'],
    ['om', 'Orange Money', '#FF7900', 'Réception gratuite · 0 % de frais'],
    ['momo', 'MTN MoMo', '#FFCC00', 'Réception gratuite · 0 % de frais']
  ];
  const payLbl = { wave: 'Wave', om: 'Orange Money', momo: 'MTN MoMo' }[CHECKOUT.method];
  return `
  <div style="max-width:920px;margin:0 auto">
    <div class="breadcrumb"><a href="#/catalogue">Catalogue</a>${icon('chevR', 12)}<span>Commande</span></div>
    <div class="steps-mini mb16">
      <b class="${CHECKOUT.step >= 1 ? 'on' : ''}">1 · Compte</b>${icon('chevR', 12)}
      <b class="${CHECKOUT.step >= 2 ? 'on' : ''}">2 · Paiement</b>${icon('chevR', 12)}
      <b class="${CHECKOUT.step >= 3 ? 'on' : ''}">3 · Confirmation</b>
    </div>
    <div class="grid" style="grid-template-columns:1.5fr 1fr;align-items:start">
      <div class="card card-pad">
        ${CHECKOUT.step === 1 ? `
          <h3 style="font-size:15px">Compte existant détecté</h3>
          <div class="banner info mt8 mb16">${icon('shieldCheck', 15)}<span>Vous êtes connecté(e) en tant que <b>${esc(u.name)}</b> (${esc(u.email)}). La formation sera ajoutée à <b>ce compte</b> — jamais de doublon de compte lors d’un nouvel achat.</span></div>
          <div class="field"><label>Téléphone pour le paiement</label><input class="inp" id="payPhone" value="${esc(u.phone || '')}"></div>
          <button class="btn btn-primary btn-lg btn-block" onclick="CHECKOUT.step=2;render()">Continuer vers le paiement ${icon('arrowR', 14)}</button>` : ''}
        ${CHECKOUT.step === 2 ? (fwHandles(payRouteFor(u)) ? `
          <div style="text-align:center;padding:8px 0">
            <div class="eyebrow">Paiement sécurisé — voie universelle</div>
            <h3 style="font-size:15px;margin-top:4px">Mobile money ou carte bancaire</h3>
            <p class="xs muted mt8">Wave, Orange Money, MTN MoMo, Moov Money (Côte d’Ivoire, Sénégal…) et cartes internationales : un seul paiement sécurisé pour tous, où que vous soyez.</p>
            <button class="btn btn-primary btn-lg mt16" onclick="openFlutterwave('${t.id}')">${icon('key', 15)} Payer ${fmtMoney(t.price)}</button>
          </div>` : (() => {
          if (payRouteFor(u) !== 'moneyfusion') return `
          <div class="card card-pad" style="text-align:center">
            <div class="eyebrow">Paiement sécurisé</div>
            <h3 style="font-size:15px;margin-top:4px">Compte rattaché à ${esc(u.country || 'un pays hors Afrique de l’Ouest')} ${esc(u.dial || '')}</h3>
            <p class="xs muted mt8">Paiement par carte bancaire internationale, sécurisé de bout en bout.</p>
            <button class="btn btn-primary btn-lg mt16" onclick="openChariow('${t.id}')">${icon('external', 15)} Payer par carte bancaire</button>
          </div>`;
          const selM = MF_METHODS.find(m => m.id === CHECKOUT.method) || MF_METHODS[0];
          const fee = Math.round(t.price * MF_RATE);
          const total = t.price + fee;
          return `
          <div class="row between" style="flex-wrap:wrap;gap:8px">
            <h3 style="font-size:15px">Paiement Mobile Money</h3>
            <span class="badge b-green">Paiement sécurisé · confirmation instantanée</span>
          </div>
          
          <p class="xs muted mt4">Wave, Orange Money, MTN MoMo et Moov Money en un seul paiement (Fusion Pay). Les frais de traitement (3,5 %) sont <b>supportés par l’étudiant</b> et ajoutés au prix.</p>

          <div class="eyebrow mt16 mb8">Choisissez votre opérateur · 3,5 %</div>
          ${MF_METHODS.map(m => `
            <div class="pay-opt ${CHECKOUT.method === m.id ? 'sel' : ''}" onclick="CHECKOUT.method='${m.id}';render()">
              <span class="pay-logo" style="background:${m.col};${m.id === 'momo' ? 'color:#191622' : ''}">${m.lbl.split(' ').map(w => w[0]).join('').slice(0, 2)}</span>
              <span class="wrap"><b style="font-size:13.5px">${m.lbl}</b><div class="xs muted">${m.sub} · Côte d’Ivoire, Sénégal, Mali, Bénin, Togo, Burkina</div></span>
              ${CHECKOUT.method === m.id ? icon('checkCircle', 18, '') : ''}
            </div>`).join('')}

          <div class="card mt16" style="background:#FBFAFE;border-color:var(--violet-line)">
            <div style="padding:14px 16px">
              <div class="row between small"><span class="muted">Formation</span><b>${fmtMoney(t.price)}</b></div>
              <div class="row between small mt8"><span class="muted">Frais de traitement (3,5 % — à votre charge)</span><b>${fmtMoney(fee)}</b></div>
              <div class="divider" style="margin:10px 0"></div>
              <div class="row between"><b>Total à payer</b><b class="price">${fmtMoney(total)}</b></div>
            </div>
          </div>
          <button class="btn btn-primary btn-lg btn-block mt16" id="payBtn" onclick="payViaMoneyFusion('${t.id}')">${icon('key', 15)} Payer ${fmtMoney(total)} par ${esc(selM.lbl)}</button>
          ${fwEnabled() && ((fwCfg().mode || 'fallback') === 'fallback') ? `<button class="btn btn-block mt8" onclick="openFlutterwave('${t.id}')">${icon('zap', 14)} Ou payer via Flutterwave (Wave, Orange, MTN, Moov + carte)</button>` : ''}
          <div class="xs faint mt8" style="text-align:center">Une demande de confirmation ${esc(selM.lbl)} sera envoyée au téléphone indiqué.<br>Confirmation instantanée : la formation est ajoutée à votre compte.</div>`;
        })()) : ''}
        ${CHECKOUT.step === 3 ? successPurchaseHTML(u, t) : ''}
      </div>
      <div class="card" style="overflow:hidden">
        ${coverHTML(t,';height:110px')}
        <div class="card-pad">
          <div class="eyebrow">Récapitulatif</div>
          <h3 style="font-size:14.5px;margin-top:4px">${esc(t.title)}</h3>
          <div class="divider"></div>
          <div class="row between small"><span class="muted">Formation</span><b>${fmtMoney(t.price)}</b></div>
          <div class="row between small mt8"><span class="muted">Accès</span><b>12 mois à partir de l’achat</b></div>
          <div class="row between small mt8"><span class="muted">Certificat</span><b>Inclus</b></div>
          <div class="divider"></div>
          <div class="row between"><b>Total</b><b class="price">${fmtMoney(t.price)}</b></div>
        </div>
      </div>
    </div>
  </div>`;
}
function successPurchaseHTML(u, t) {
  const sale = S.sales.find(s => s.userId === u.id && s.trainingId === t.id && s.status === 'confirmé');
  return `
    <div style="text-align:center;padding:10px 0">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--green-soft);color:var(--green);display:flex;align-items:center;justify-content:center;margin:0 auto">${icon('checkCircle', 30)}</div>
      <h2 style="font-size:19px;margin-top:14px">Achat confirmé 🎉</h2>
      <p class="muted small mt8">Paiement de <b>${fmtMoney(sale ? sale.amount + (sale.fee || 0) : t.price)}</b> confirmé par <b>${esc(payMethodLabel(sale))}</b>${sale?.fee ? ` (dont ${fmtMoney(sale.fee)} de frais de traitement à votre charge)` : ''}. La formation « ${esc(t.title)} » a été <b>ajoutée à votre compte existant</b> (${esc(u.email)}).</p>
      <div class="banner ok mt16" style="text-align:left">${icon('zap', 15)}<span class="small"><b>Paiement confirmé : votre formation est activée.</b><br>Aucun nouveau compte n’a été créé.</span></div>
      <div class="row mt24" style="justify-content:center;gap:10px;flex-wrap:wrap">
        <a class="btn btn-primary" href="#/formation/${t.id}">Commencer la formation ${icon('arrowR', 14)}</a>
        <button class="btn" onclick="downloadInvoice('${t.id}')">${icon('download', 14)} Facture PDF</button>
        <a class="btn" href="#/">Retour au tableau de bord</a>
      </div>
    </div>`;
}
function pendingDeclarationHTML(u, t, d) {
  return `
  <div style="max-width:620px;margin:0 auto">
    <div class="breadcrumb"><a href="#/catalogue">Catalogue</a>${icon('chevR', 12)}<span>Commande</span></div>
    <div class="card card-pad" style="text-align:center">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--amber-soft);color:var(--amber);display:flex;align-items:center;justify-content:center;margin:0 auto">${icon('clock', 28)}</div>
      <h2 style="font-size:19px;margin-top:14px">Paiement en attente de vérification</h2>
      <p class="muted small mt8">Vous avez déclaré un paiement de <b>${fmtMoney(d.amount)}</b> par ${esc(d.method)} pour « ${esc(t.title)} » (réf <span class="kbd">${d.ref || ''}</span> · n° ${esc(d.txn || '—')}).</p>
      <div class="banner info mt16" style="text-align:left">${icon('bell', 15)}<span class="small">L’équipe vérifie votre transfert. Dès confirmation, la formation est ajoutée à <b>ce compte</b> et vous recevez une notification push. Aucune action requise de votre part.</span></div>
      <div class="mt16"><a class="btn" href="#/">Retour au tableau de bord</a></div>
    </div>
  </div>`;
}
/* ===== Money Fusion — Fusion Pay : contrat officiel de l'API Web =====
   1) Demande de paiement : POST apiUrl  { totalPrice, article, personal_Info, numeroSend, nomclient, return_url, webhook_url }
      → { statut, token, message, url }   (apiUrl obtenue depuis le tableau de bord Money Fusion)
   2) Webhook POST /api/moneyfusion/webhook : événements payin.session.pending / .completed / .cancelled
      — plusieurs notifications possibles pour une même transaction → dédoublonnage par tokenPay + transition de statut
   3) Vérification serveur : GET https://pay.moneyfusion.net/paiementNotif/:token → data.statut paid|pending|failure|no paid
   Règle : jamais confiance au webhook seul — toujours re-vérifier, et un tokenPay ne crédite qu'une fois. */
const MF_API_URL = 'https://api.moneyfusion.net/api/create-payment'; /* à remplacer par l'URL du tableau de bord */
function mfCreatePayment(u, t, m, phone, total, fee, ref) {
  const paymentData = {
    totalPrice: total,
    article: [{ [t.title]: t.price, 'Frais de traitement': fee }],
    personal_Info: [{ userId: u.id, orderId: ref }],
    numeroSend: phone,
    nomclient: u.name,
    return_url: 'https://davarcampus.co/#/checkout/' + t.id,
    webhook_url: 'https://davarcampus.co/api/moneyfusion/webhook'
  };
  const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  const rec = { tokenPay: token, userId: u.id, trainingId: t.id, operator: m.lbl, moyen: m.id, phone, amount: total, fee, ref, event: 'created', statut: 'pending', gatewayPaid: false, processed: false, numeroTransaction: null, createdAt: Date.now(), payload: paymentData };
  S.mfPayments = S.mfPayments || []; S.mfPayments.push(rec); save();
  recordAudit('moneyfusion_payin', { api: MF_API_URL, tokenPay: token, moyen: m.id, total });
  return { statut: true, token, message: 'paiement en cours', url: 'https://payin.moneyfusion.net/payment/' + token + '/Marchand' };
}
function payViaMoneyFusion(tid) {
  const btn = document.getElementById('payBtn'); if (!btn) return;
  const u = getUser(S.session.userId); const t = getTraining(tid);
  const m = MF_METHODS.find(x => x.id === CHECKOUT.method) || MF_METHODS[0];
  const fee = Math.round(t.price * MF_RATE); const total = t.price + fee;
  const phone = (document.getElementById('payPhone')?.value || u.phone || '').trim();
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Demande de paiement…';
  const res = mfCreatePayment(u, t, m, phone, total, fee, CHECKOUT.ref);
  if (!res.statut) return toast('La demande de paiement a été refusée. Vérifiez votre solde puis réessayez.', 'err', 'alert');
  setTimeout(() => {
    btn.innerHTML = '<span class="spin"></span> Confirmez sur votre téléphone ' + esc(m.lbl) + '…';
    mfWebhook({ event: 'payin.session.pending', tokenPay: res.token, numeroSend: phone, nomclient: u.name, Montant: total });
  }, 900);
  setTimeout(() => {
    const rec = (S.mfPayments || []).find(p => p.tokenPay === res.token);
    rec.gatewayPaid = true; rec.numeroTransaction = 'TX-' + Math.floor(100000 + Math.random() * 899999);
    mfWebhook({ event: 'payin.session.completed', tokenPay: res.token, personal_Info: [{ userId: u.id, orderId: CHECKOUT.ref }], numeroSend: phone, nomclient: u.name, numeroTransaction: rec.numeroTransaction, Montant: total, frais: fee });
  }, 2100);
}
/* POST /api/moneyfusion/webhook (simulé) : notifications multiples possibles */
function mfWebhook(ev) {
  const rec = (S.mfPayments || []).find(p => p.tokenPay === ev.tokenPay);
  if (!rec) { recordAudit('moneyfusion_webhook', { rejected: 'tokenPay inconnu', tokenPay: ev.tokenPay }); return; }
  if (ev.event === 'payin.session.pending') {
    if (rec.event !== 'created' && rec.event !== 'pending') return; /* répétition ou événement déjà dépassé */
    rec.event = 'pending'; save(); return;
  }
  if (ev.event === 'payin.session.cancelled') {
    if (rec.processed) return;
    rec.statut = 'failure'; rec.event = 'cancelled'; save();
    notify(rec.userId, 'sale', 'Paiement annulé', `Le paiement ${rec.operator} de ${fmtMoney(rec.amount)} n’a pas abouti. Vous pouvez réessayer à tout moment.`);
    render(); return;
  }
  if (ev.event !== 'payin.session.completed') return;
  if (rec.processed) return; /* notification redondante : déjà crédité */
  const check = mfCheckPaymentStatus(rec.tokenPay); /* re-vérification API — jamais confiance au webhook seul */
  if (!check || !check.statut || check.data.statut !== 'paid') { recordAudit('moneyfusion_webhook', { rejected: 'vérification ≠ paid', tokenPay: rec.tokenPay }); return; }
  rec.processed = true; rec.statut = 'paid'; rec.event = 'completed';
  rec.fee = check.data.frais != null ? check.data.frais : rec.fee;
  rec.numeroTransaction = check.data.numeroTransaction || rec.numeroTransaction;
  rec.decidedAt = Date.now();
  const t = getTraining(rec.trainingId);
  ensureEnrollment(rec.userId, rec.trainingId);
  S.sales.unshift({ id: 'v-' + Math.floor(1000 + Math.random() * 9000), ref: rec.ref, userId: rec.userId, email: getUser(rec.userId).email, trainingId: rec.trainingId, amount: t.price, fee: rec.fee, method: 'Money Fusion · ' + rec.operator, zone: 'af', status: 'confirmé', txn: rec.numeroTransaction, at: Date.now() });
  notify(rec.userId, 'sale', 'Achat confirmé ✓', `« ${t.title} » a été ajoutée à votre compte.`);
  notify('u-yann', 'sale', 'Vente Money Fusion 💰', `${getUser(rec.userId).name} — ${t.title} (${fmtMoney(rec.amount)} via ${rec.operator} · frais ${fmtMoney(rec.fee)})`);
  sendFlow('purchase_ok', getUser(rec.userId).email, { title: t.title, userId: rec.userId });
  recordAudit('moneyfusion_webhook', { event: 'payin.session.completed', tokenPay: rec.tokenPay, txn: rec.numeroTransaction, moyen: check.data.moyen });
  save(); CHECKOUT.step = 3; render();
  toast('Paiement Mobile Money confirmé : formation débloquée 🎉', 'ok', 'unlock');
}
/* GET https://pay.moneyfusion.net/paiementNotif/:token — vérification côté serveur */
function mfCheckPaymentStatus(token) {
  const rec = (S.mfPayments || []).find(p => p.tokenPay === token);
  if (!rec) return null;
  return { statut: true, message: 'details paiement', data: { _id: rec.tokenPay, tokenPay: rec.tokenPay, numeroSend: rec.phone, nomclient: getUser(rec.userId) ? getUser(rec.userId).name : '', personal_Info: [{ userId: rec.userId, orderId: rec.ref }], numeroTransaction: rec.numeroTransaction, Montant: rec.amount, frais: rec.fee, statut: rec.gatewayPaid ? 'paid' : 'pending', moyen: rec.moyen, createdAt: new Date(rec.createdAt).toISOString() } };
}
/* Routage paiement : le 1er achat se fait EN DEHORS de l'app (Chariow) — c'est lui qui donne accès à la plateforme.
   Dans l'app, tous les achats sont donc des achats supplémentaires → Flutterwave, voie universelle pour tout le monde
   (mobile money Afrique de l'Ouest dont Wave + cartes internationales). payRouteFor ne sert plus que de repli
   historique si l'admin désactive Flutterwave. */
/* Zone couverte par Money Fusion (mobile money) : tous les pays qu'il couvre restent chez lui ;
   tous les autres pays partent chez Chariow. (Money Fusion : 26+ pays d'Afrique — ajuster ici si sa couverture évolue.) */
const WEST_AFRICA = ['Côte d’Ivoire', 'Sénégal', 'Mali', 'Burkina Faso', 'Bénin', 'Togo', 'Niger', 'Guinée-Bissau', 'Guinée'];
function payRouteFor(u) { return WEST_AFRICA.includes(u.country) ? 'moneyfusion' : 'chariow'; }
function hasBought(uidv) { return (S.enrollments || []).some(e => e.userId === uidv) || (S.sales || []).some(x => x.userId === uidv && x.status === 'confirmé'); }
function startPurchase(tid) {
  const u = getUser(S.session.userId);
  if (fwHandles(payRouteFor(u))) { openFlutterwave(tid); return; } /* voie universelle */
  /* Repli (Flutterwave désactivé par l'admin uniquement) : routage historique */
  if (!hasBought(u.id)) { openChariow(tid); toast('Redirection vers le paiement sécurisé de votre formation…', '', 'external'); return; }
  if (payRouteFor(u) === 'moneyfusion') { location.hash = '#/checkout/' + tid; render(); }
  else openChariow(tid);
}
/* ===== Facture professionnelle : PDF A4 avec logos + mentions comptables =====
   Le client ne voit jamais la passerelle (Money Fusion / Chariow) : seulement le moyen de paiement. */
function pdfSafe(t) { return String(t).replace(/[\u202F]/g, ' ').replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/[ç]/g, 'c').replace(/[ÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÎÏ]/g, 'I').replace(/[ÔÖ]/g, 'O').replace(/[ÙÛÜ]/g, 'U').replace(/[Ç]/g, 'C').replace(/[’‘]/g, "'").replace(/[«»]/g, '"').replace(/[—–]/g, '-').replace(/[^\x20-\x7E]/g, ''); }
function payMethodLabel(sale) {
  if (!sale) return 'Carte bancaire';
  const m = String(sale.method || '');
  if (m.indexOf('Money Fusion') === 0) return m.replace('Money Fusion · ', '');
  if (m.indexOf('Flutterwave') === 0) { const c = m.replace('Flutterwave · ', ''); return c === 'Carte' ? 'Carte bancaire' : c; }
  if (m === 'Chariow') return 'Carte bancaire';
  return m;
}
function supInfo() { const x = (S.settings && S.settings.support) || {}; return { phone: x.phone || '', email: (S.settings.emails && S.settings.emails.support) || x.email || '' }; }
function invoiceMeta(u, t, sale) {
  return { num: String(sale.id).toUpperCase(), ref: sale.ref || '-', date: new Date(sale.at).toLocaleDateString('fr-FR'),
    client: { name: u.name, email: u.email, country: (u.country || '-') + ' ' + (u.dial || ''), phone: u.phone || '' },
    title: t.title, price: t.price, fee: sale.fee || 0, total: t.price + (sale.fee || 0), method: payMethodLabel(sale), txn: sale.txn || null };
}
function loadImg(src) { return new Promise(res => { const i = new Image(); const to = setTimeout(() => res(null), 800); i.onload = () => { clearTimeout(to); res(i); }; i.onerror = () => { clearTimeout(to); res(null); }; i.src = src; }); }
function jpegToPDF(b64, w, h) {
  const bin = atob(b64);
  const content = 'q 595 0 0 842 0 0 cm /Im1 Do Q';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bin.length + ' >>\nstream\n' + bin + '\nendstream',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'
  ];
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = pdf.length;
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
  return 'data:application/pdf;base64,' + btoa(pdf);
}
async function makeInvoicePDF(meta) {
  const cv = document.createElement('canvas'); cv.width = 1240; cv.height = 1754;
  const ctx = cv.getContext ? cv.getContext('2d') : null;
  if (!ctx) return textInvoicePDF(meta);
  const W = 1240;
  const [logoA, logoC] = await Promise.all([loadImg('assets/logo-structure.png'), loadImg('assets/campus-official.png')]);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, 1754);
  ctx.fillStyle = '#17102B'; ctx.fillRect(0, 0, W, 220);
  let lx = 230;
  if (logoA) { const nw = logoA.naturalWidth || 1, nh = logoA.naturalHeight || 1; const h = 140, lw = Math.round(h * nw / nh); ctx.drawImage(logoA, 60, 110 - h / 2, lw, h); lx = 60 + lw + 26; }
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 46px Arial'; ctx.fillText('DAVAR ACADÉMIE', lx, 110);
  const sig = (S.palette || 'violet') === 'violet';
  const cssHex = (n, fb) => sig ? fb : (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb);
  ctx.fillStyle = cssHex('--violet2', '#C9B5F5'); ctx.font = '22px Arial'; ctx.fillText('Plateforme professionnelle de formation en art oratoire', lx, 152);
  if (logoC) ctx.drawImage(logoC, W - 200, 45, 130, 130);
  ctx.fillStyle = cssHex('--ink', '#1F1235'); ctx.font = 'bold 40px Arial'; ctx.textAlign = 'right'; ctx.fillText('FACTURE N° ' + meta.num, W - 60, 300);
  ctx.font = '22px Arial'; ctx.fillStyle = '#6B6478'; ctx.fillText('Date : ' + meta.date + ' · Réf ' + meta.ref, W - 60, 336); ctx.textAlign = 'left';
  ctx.fillStyle = cssHex('--violet-soft', '#F5F3FA'); ctx.fillRect(60, 380, 540, 190);
  ctx.fillStyle = cssHex('--violet-soft', '#EFEBFA'); ctx.fillRect(660, 380, 520, 190);
  ctx.fillStyle = cssHex('--violet-deep', '#5B21B6'); ctx.font = 'bold 20px Arial'; ctx.fillText('ÉMETTEUR', 84, 416); ctx.fillText('CLIENT', 684, 416);
  const sup = supInfo();
  ctx.fillStyle = cssHex('--ink2', '#2A2438'); ctx.font = '20px Arial'; ctx.fillText('DAVAR ACADÉMIE', 84, 452);
  ctx.font = '17px Arial'; ctx.fillStyle = '#55506B';
  ctx.fillText('Plateforme professionnelle de formation en art oratoire', 84, 480);
  ctx.fillText('Yopougon, Abidjan — Côte d’Ivoire', 84, 506);
  ctx.font = '15px Arial';
  ctx.fillText('Support : ' + sup.phone, 84, 530);
  ctx.fillText(sup.email, 84, 552);
  ctx.fillStyle = cssHex('--ink2', '#2A2438'); ctx.font = '20px Arial'; ctx.fillText(meta.client.name, 684, 452);
  ctx.font = '17px Arial'; ctx.fillStyle = '#55506B';
  ctx.fillText(meta.client.email, 684, 480); ctx.fillText(meta.client.country, 684, 506); ctx.fillText(meta.client.phone, 684, 532);
  let y = 640;
  ctx.fillStyle = cssHex('--violet-deep', '#5B21B6'); ctx.fillRect(60, y, W - 120, 52);
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 20px Arial'; ctx.fillText('DÉSIGNATION', 84, y + 34);
  ctx.textAlign = 'right'; ctx.fillText('MONTANT', W - 84, y + 34); ctx.textAlign = 'left'; y += 52;
  const row = (label, val, alt) => { if (alt) { ctx.fillStyle = '#F7F5FB'; ctx.fillRect(60, y, W - 120, 52); } ctx.fillStyle = cssHex('--ink2', '#2A2438'); ctx.font = '19px Arial'; ctx.fillText(label, 84, y + 33); ctx.textAlign = 'right'; ctx.fillText(val, W - 84, y + 33); ctx.textAlign = 'left'; y += 52; };
  row('Formation « ' + meta.title + ' » (accès 12 mois, certificat inclus)', fmtMoney(meta.price), false);
  row('Frais de traitement (3,5 %)', fmtMoney(meta.fee), true);
  ctx.fillStyle = '#D4AF37'; ctx.fillRect(60, y, W - 120, 60);
  ctx.fillStyle = cssHex('--ink', '#1F1235'); ctx.font = 'bold 24px Arial'; ctx.fillText('TOTAL PAYÉ (TTC)', 84, y + 39);
  ctx.textAlign = 'right'; ctx.fillText(fmtMoney(meta.total), W - 84, y + 39); ctx.textAlign = 'left'; y += 96;
  ctx.fillStyle = cssHex('--ink2', '#2A2438'); ctx.font = '20px Arial';
  ctx.fillText('Réglée par : ' + meta.method + (meta.txn ? ' · n° ' + meta.txn : ''), 60, y);
  ctx.fillStyle = '#1F8A4C'; ctx.font = 'bold 20px Arial';
  ctx.fillText('FACTURE ACQUITTÉE — paiement reçu le ' + meta.date, 60, y + 36);
  ctx.fillStyle = '#8A849B'; ctx.font = '15px Arial';
  let my = 1592;
  ['DAVAR ACADÉMIE — plateforme professionnelle de formation en art oratoire · Yopougon, Abidjan, Côte d’Ivoire.',
   'Support : ' + sup.phone + ' · ' + sup.email,
   'Facture établie selon les règles comptables en vigueur · TVA incluse selon la législation.',
   'Document émis électroniquement, dispensé de signature manuscrite.',
   'Toute réclamation sous 30 jours en citant le numéro de facture.'].forEach(m => { my += 24; ctx.fillText(m, 60, my); });
  ctx.fillStyle = '#17102B'; ctx.fillRect(0, 1730, W, 24);
  return jpegToPDF(cv.toDataURL('image/jpeg', 0.92).split(',')[1], cv.width, cv.height);
}
/* Repli sans canvas : facture texte avec les mêmes mentions */
function textInvoicePDF(meta) {
  const L = [
    ['DAVAR ACADEMIE - plateforme professionnelle de formation en art oratoire', 13, 1],
    ['Yopougon, Abidjan, Cote d’Ivoire', 9, 0],
    ['Support : ' + supInfo().phone + ' · ' + supInfo().email, 9, 0],
    [' ', 8, 0],
    ['FACTURE N° ' + meta.num + ' · réf ' + meta.ref, 12, 1],
    ['Date : ' + meta.date, 10, 0],
    [' ', 8, 0],
    ['Client : ' + meta.client.name + ' · ' + meta.client.email, 10, 0],
    ['Pays : ' + meta.client.country + (meta.client.phone ? ' · ' + meta.client.phone : ''), 10, 0],
    [' ', 8, 0],
    ['Formation « ' + meta.title + ' » (acces 12 mois, certificat inclus) : ' + fmtMoney(meta.price), 10, 0],
    ['Frais de traitement (3,5 %) : ' + fmtMoney(meta.fee), 10, 0],
    ['TOTAL PAYE (TTC) : ' + fmtMoney(meta.total), 12, 1],
    [' ', 8, 0],
    ['Reglee par : ' + meta.method + (meta.txn ? ' · n° ' + meta.txn : ''), 10, 0],
    ['FACTURE ACQUITTEE - paiement recu le ' + meta.date, 10, 1],
    [' ', 8, 0],
    ['Facture etablie selon les regles comptables en vigueur - TVA incluse selon la legislation.', 8, 0],
    ['Document emis electroniquement, dispense de signature manuscrite - reclamation sous 30 jours avec le n° de facture.', 8, 0]
  ];
  return makeSmallPDF(L);
}
function makeSmallPDF(lines) {
  const escP = t => pdfSafe(t).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let y = 800; const ops = [];
  lines.forEach(L => { ops.push('BT /' + (L[2] ? 'F2' : 'F1') + ' ' + L[1] + ' Tf 56 ' + y + ' Td (' + escP(L[0]) + ') Tj ET'); y -= L[1] + 8; });
  const stream = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'
  ];
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = pdf.length;
  pdf += 'xref\n0 7\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
  return 'data:application/pdf;base64,' + btoa(pdf);
}
async function downloadInvoice(tid) {
  const u = getUser(S.session.userId); const t = getTraining(tid);
  const sale = S.sales.find(x => x.userId === u.id && x.trainingId === tid && x.status === 'confirmé');
  if (!sale) return toast('Aucun achat confirmé pour cette formation.', 'err', 'alert');
  const url = await makeInvoicePDF(invoiceMeta(u, t, sale));
  const a = document.createElement('a');
  a.href = url; a.download = 'facture-davar-' + sale.id + '.pdf';
  document.body.appendChild(a); a.click(); a.remove();
  toast('Facture PDF téléchargée ✓', 'ok', 'download');
}
/* Flux manuel conservé en secours (ex. problème Money Fusion dans un pays non couvert) */
function declarePayment(tid) {
  const txn = document.getElementById('txnId')?.value.trim();
  if (!txn) { toast('Indiquez le n° de transaction reçu par SMS.', 'err', 'alert'); return; }
  const u = S.session.userId; const t = getTraining(tid);
  const label = { wave: 'Wave', om: 'Orange Money', momo: 'MTN MoMo' }[CHECKOUT.method];
  S.sales.unshift({
    id: 'v-' + Math.floor(1000 + Math.random() * 9000), ref: CHECKOUT.ref,
    userId: u, email: getUser(u).email, trainingId: tid, amount: t.price,
    method: label, status: 'declaré', txn, at: Date.now()
  });
  notify('u-yann', 'admin', 'Paiement manuel à vérifier', `${getUser(u).name} — ${t.title} (${fmtMoney(t.price)}) · réf ${CHECKOUT.ref} · n° ${txn}`);
  notify(u, 'sale', 'Paiement déclaré', `Votre paiement par ${label} est en attente de vérification par l’équipe.`);
  save();
  CHECKOUT.step = 3; render();
  toast('Paiement déclaré. L’équipe vérifie votre transfert.', 'gold', 'check');
}

/* ---------------- CHAT (Coach + Assistant virtuel) ---------------- */
function openChat(tid, mid, mode) { CHAT.open = true; CHAT.trainingId = tid; CHAT.moduleId = mid; CHAT.mode = mode || 'ai'; render(); setTimeout(() => document.getElementById('chatInput')?.focus(), 50); }
function closeChat() { CHAT.open = false; render(); }
function setChatMode(m) { CHAT.mode = m; render(); setTimeout(() => document.getElementById('chatInput')?.focus(), 50); }
function chatThread() {
  const u = S.session.userId;
  return S.threads.find(th => th.userId === u && th.moduleId === CHAT.moduleId) || null;
}
function chatPanelHTML(u) {
  const f = findModule(CHAT.trainingId, CHAT.moduleId);
  const th = chatThread();
  const msgs = th ? th.messages : [];
  const ai = S.aiConfig;
  return `<div class="chat-overlay" onclick="if(event.target===this)closeChat()">
    <div class="chat-panel">
      <div class="chat-head">
        <span class="avatar" style="background:hsl(${ai.hue} 60% 45%);overflow:hidden">${ai.photo ? `<img src="${ai.photo}" alt="" style="width:100%;height:100%;object-fit:cover">` : (ai.avatar ? '<span style="font-size:15px">' + esc(ai.avatar) + '</span>' : icon('sparkles', 15))}</span>
        <div class="wrap"><b style="font-size:13.5px">${esc(aiName())}</b><div class="xs faint">Assistant virtuel · supervisé par vos coachs</div></div>
        <button class="icon-btn" onclick="closeChat()">${icon('x', 17)}</button>
      </div>
      <div class="chat-tabs">
        <button class="chat-tab ${CHAT.mode === 'ai' ? 'active' : ''}" onclick="setChatMode('ai')">${icon('sparkles', 14)} Assistant virtuel — immédiat</button>
        <button class="chat-tab coach ${CHAT.mode === 'coach' ? 'active' : ''}" onclick="setChatMode('coach')">${icon('message', 14)} Coach humain</button>
      </div>
      <div class="chat-ctx">${icon('book', 11)} Contexte : ${f ? esc(f.m.title) : ''} — ${f ? esc(f.t.title) : ''}</div>
      <div class="chat-msgs" id="chatMsgs">
        ${msgs.length ? msgs.map(m => msgHTML(m)).join('') : `
          <div class="empty small">${CHAT.mode === 'ai'
          ? `Posez vos questions. ${esc(aiName())} est le cerveau virtuel de votre coach. Il répond à partir des connaissances fournies par le coach principal. N’hésitez pas.`
          : 'Votre question sera transmise à votre coach.'}</div>`}
        ${CHAT.typing ? `<div class="msg ai"><span class="who">${icon('sparkles', 11)} ${esc(aiName())}</span><span class="bubble"><span class="typing"><i></i><i></i><i></i></span></span></div>` : ''}
      </div>
      <div class="chat-foot">
        ${CHAT.mode === 'coach' ? `<div class="chat-note">${icon('clock', 13)} Votre Coach répond généralement sous <b>&nbsp;48 heures</b>.</div>`
          : `<div class="chat-note">${icon('zap', 13)} Réponse immédiate. Un coach peut intervenir à tout moment pour valider ou compléter.</div>`}
        <div class="chat-input">
          <input class="inp" id="chatInput" placeholder="Écrivez votre question…" onkeydown="if(event.key==='Enter')sendChat()">
          <button class="btn btn-primary" onclick="sendChat()">${icon('send', 15)}</button>
        </div>
      </div>
    </div>
  </div>`;
}
function msgHTML(m) {
  if (m.from === 'sys') return `<div class="msg sys"><span class="bubble">${esc(m.text)}</span></div>`;
  if (m.from === 'student') return `<div class="msg me"><span class="who">Vous · ${timeAgo(m.at)}</span><span class="bubble">${esc(m.text)}</span></div>`;
  if (m.from === 'coach') return `<div class="msg coach"><span class="who">${icon('award', 11)} Coach Mariam Touré · ${timeAgo(m.at)}</span><span class="bubble">${esc(m.text)}</span></div>`;
  return `<div class="msg ai"><span class="who">${icon('sparkles', 11)} ${esc(aiName())} · ${timeAgo(m.at)}</span><span class="bubble">${esc(m.text)}</span></div>`;
}
function aiAnswer(q, moduleTitle) {
  const openers = ['Très bonne question 👌', 'Bonne question, voici l’essentiel :', 'Voici une réponse claire, basée sur le contenu du module :'];
  const o = openers[Math.floor(Math.random() * openers.length)];
  return `${o}\n\nConcernant « ${moduleTitle} », retenez ces points :\n1. Commencez toujours par définir votre objectif avant de choisir un outil ou un canal.\n2. Appliquez la méthode du module pas à pas, avec un petit cas réel (votre activité ou un projet fictif).\n3. Mesurez le résultat avec un indicateur simple, puis ajustez.\n\nSi vous voulez, précisez votre situation et j’adapterai la réponse. Et si le sujet demande un avis personnalisé, votre coach pourra compléter ma réponse.`;
}
function sendChat() {
  const inp = document.getElementById('chatInput');
  const txt = inp.value.trim(); if (!txt) return;
  const u = S.session.userId;
  let th = chatThread();
  if (!th) { th = { id: uid(), userId: u, trainingId: CHAT.trainingId, moduleId: CHAT.moduleId, resolved: false, aiValidated: false, messages: [] }; S.threads.push(th); }
  th.messages.push({ id: uid(), from: 'student', text: txt, at: Date.now(), coach: CHAT.mode === 'coach' });
  const f = findModule(CHAT.trainingId, CHAT.moduleId);
  if (CHAT.mode === 'coach') {
    notify(u, 'coach', 'Question transmise à votre coach', 'Votre Coach répond généralement sous 48 heures.');
    notify('u-yann', 'admin', 'Question en attente (coach)', `${getUser(u).name} — ${f ? f.m.title : ''}`);
    save('chat'); render();
    toast('Question envoyée à votre coach 📨', 'gold', 'message');
  } else {
    CHAT.typing = true; save('chat'); render();
    const q = txt;
    setTimeout(() => {
      CHAT.typing = false;
      th.aiValidated = false;
      th.messages.push({ id: uid(), from: 'ai', text: aiAnswer(q, f ? f.m.title : 'ce module'), at: Date.now() });
      notify(u, 'ai', `${aiName()} a répondu`, 'Consultez la réponse dans votre conversation.');
      save('chat'); render();
    }, 1200);
  }
}

/* ---------------- CERTIFICATS ---------------- */
function vCertificates(u) {
  const mine = S.certs.filter(c => c.userId === u.id);
  return `<div class="page-head"><div><h1>Mes certificats</h1><p>Émis par Davar Académie après validation de vos évaluations.</p></div></div>
  ${mine.length ? `<div class="grid g2">${mine.map(c => {
    const t = getTraining(c.trainingId);
    return `<div class="card card-pad" style="cursor:pointer;text-align:center" onclick="showCert('${c.id}')">
      <div class="seal" style="width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#EAD9A8,#C9A24B 60%,#9A7A2E);display:flex;align-items:center;justify-content:center;color:#fff;margin:0 auto">${icon('award', 22)}</div>
      <h3 class="mt8" style="font-size:14.5px">${esc(t.title)}</h3>
      <div class="xs muted mt4">Émis le ${fmtDate(c.issuedAt)}</div>
      <div class="mt8"><span class="badge b-gold">${c.code}</span></div>
      <div class="xs faint mt8">Cliquer pour afficher le certificat</div>
    </div>`;
  }).join('')}</div>` : `<div class="card">${emptyState('award', 'Aucun certificat pour le moment', 'Terminez une formation et ses évaluations pour obtenir votre premier certificat.')}</div>`}`;
}
function showCert(certId) {
  const c = S.certs.find(x => x.id === certId); if (!c) return;
  const u = getUser(c.userId); const t = getTraining(c.trainingId);
  openModal({
    wide: true, title: 'Certificat',
    body: `<div class="cert" style="text-align:center">
      <div class="eyebrow" style="color:var(--gold)">Davar Académie Campus</div>
      <div class="seal mt16">${icon('award', 28)}</div>
      <h2 class="mt16">Certificat de réussite</h2>
      <p class="muted small mt8">décerné à</p>
      <div style="font-size:22px;font-weight:800;margin-top:6px">${esc(u.name)}</div>
      <p class="small muted mt8">pour avoir suivi et validé avec succès la formation</p>
      <div style="font-size:16px;font-weight:700;margin-top:6px">${esc(t.title)}</div>
      <div class="xs muted mt8">${t.hours} heures · ${fmtDate(c.issuedAt)}</div>
      <div class="divider"></div>
      <div class="row" style="justify-content:center;gap:24px">
        <div><div class="xs faint">Code de vérification</div><div class="code mt4">${c.code}</div></div>
        <div><div class="xs faint">Statut</div><div class="mt4"><span class="badge b-green">Actif</span></div></div>
      </div>
      <div class="xs faint mt16">YAPO SERGE TRÉSOR · Fondateur, Davar Académie — Abidjan, Côte d’Ivoire</div>
      <div class="banner info mt16" style="text-align:left">${icon('mail', 14)}<span class="xs">Le certificat n’est <b>jamais téléchargeable</b> depuis la plateforme : il est <b>envoyé par e-mail (Gmail)</b> à l’émission. Seule la <b>facture</b> d’achat se télécharge en PDF.</span></div>
    </div>`,
    foot: `<button class="btn" onclick="toast('Lien de vérification copié (démo)','ok','external')">${icon('external', 14)} Partager</button>
           <button class="btn btn-primary" onclick="toast('Certificat renvoyé par e-mail (Gmail) ✓','ok','mail')">${icon('mail', 14)} Renvoyer par e-mail</button>`
  });
}

/* ---------------- PROFIL ---------------- */
function vProfile(u) {
  return `<div class="page-head"><div><h1>Profil & paramètres</h1></div></div>
  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="card card-pad">
      <div class="row">${avatarHTML(u, 'lg')}<div><b style="font-size:15px">${esc(u.name)}</b><div class="xs muted">${esc(u.email)}</div><div class="xs faint mt4">Membre depuis ${fmtDate(u.joined)}</div></div></div>
      <div class="divider"></div>
      <div class="field"><label>Photo de profil</label>
        <input type="file" accept="image/*" class="inp" onchange="uploadPhoto(this)"></div>
      <div class="field"><label>Nom complet (max 21 caractères)</label>
        <input class="inp" id="pfName" maxlength="21" value="${esc(u.name)}">
        <div class="hint">${isStaff(u) ? 'Affiché dans le Centre de contrôle.' : 'Ce nom apparaît sur vos certificats.'}</div></div>
      <button class="btn btn-primary btn-sm" onclick="saveProfile()">${icon('check', 14)} Enregistrer</button>
      <div class="divider"></div>
      <div class="row between"><span class="small muted">Mode sombre</span>
        <label class="switch"><input type="checkbox" ${currentTheme() === 'dark' ? 'checked' : ''} onchange="setTheme(this.checked?'dark':'light')"><i></i></label></div>
      <div class="xs faint mt4">Par défaut, le thème suit le réglage de votre appareil.</div>
      <div class="row between mt16"><span class="small muted">Connexion par empreinte digitale</span>
        <label class="switch"><input type="checkbox" ${u.webauthn ? 'checked' : ''} onchange="toggleWebauthn()"><i></i></label></div>
      <div class="xs faint mt4" id="fpHint">${icon('fingerprint', 11)} Vérification de votre appareil…</div>
    </div>
    <div class="card card-pad">
      <div class="eyebrow mb8">Notifications</div>
      <div class="row between"><span class="small muted">Réponses coach, corrections, certificats, motivations du dimanche.</span>
        <label class="switch"><input type="checkbox" ${S.settings.pushEnabled ? 'checked' : ''} onchange="S.settings.pushEnabled=this.checked;save();toast(this.checked?'Notifications push activées':'Notifications push désactivées','','bell')"><i></i></label></div>
      <div class="divider"></div>
      <div class="eyebrow mb8">Compte</div>
      <p class="small muted">Votre compte est unique : tous vos achats et toutes vos formations y sont rattachés, sans jamais créer de doublon.</p>
      <div class="row mt16" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-danger btn-sm" onclick="confirmModal('Réinitialiser la démo ?','Toutes les données locales de démonstration seront remises à zéro.','Réinitialiser',true).then(v=>v&&resetDemo())">${icon('refresh', 14)} Réinitialiser la démo</button>
        <button class="btn btn-sm" onclick="logout()">${icon('logout', 14)} Se déconnecter</button>
      </div>
    </div>
  </div>`;
}
function uploadPhoto(inp) {
  const f = inp.files?.[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { const u = getUser(S.session.userId); u.photo = String(r.result); save(); render(); toast('Photo de profil mise à jour', 'ok', 'camera'); };
  r.readAsDataURL(f);
}
function saveProfile() {
  const u = getUser(S.session.userId);
  const n = (document.getElementById('pfName').value || '').trim();
  if (n.length < 2 || n.length > 21) return toast('Nom entre 2 et 21 caractères.', 'err');
  const ph = document.getElementById('pfPhone'); if (ph) u.phone = ph.value.trim();
  const pw = document.getElementById('pfPwd'), pw2 = document.getElementById('pfPwd2');
  if (pw && (pw.value.trim() || (pw2 && pw2.value.trim()))) {
    if (pw.value.trim().length < 6) return toast('Code secret : 6 caractères minimum.', 'err');
    if (!pw2 || pw.value !== pw2.value) return toast('Les deux codes secrets ne sont pas identiques — enregistrement impossible.', 'err', 'lock');
    u.password = pw.value.trim();
  }
  u.name = n; save(); render(); toast('Profil enregistré ✓ (modifications réellement sauvegardées)', 'ok', 'check');
  if (typeof cpBack === 'function') setTimeout(() => cpBack(), 950);
}
/* Détection en deux temps : 1) le navigateur expose-t-il la porte biométrique ?
   2) l’appareil a-t-il une empreinte/visage réellement inscrit ? */
function deviceInfo() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  let os = 'cet appareil';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iPhone/iPad (iOS)';
  else if (/Android/i.test(ua)) os = /Tablet|SM-T|GT-P/i.test(ua) ? 'tablette Android' : 'téléphone Android';
  else if (/Windows/i.test(ua)) os = 'PC Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'Mac (Apple)';
  else if (/Linux/i.test(ua)) os = 'machine Linux';
  return os;
}
let FP_CAP = null;
async function fpCapability() {
  if (FP_CAP) return FP_CAP;
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) { FP_CAP = { api: false, auth: false }; return FP_CAP; }
  let auth = false;
  try { auth = !!(await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { auth = false; }
  FP_CAP = { api: true, auth };
  return FP_CAP;
}
function fpUnavailableMsg(cap) {
  const dev = deviceInfo();
  return cap.api && !cap.auth
    ? `Votre appareil (${dev}) est compatible : enregistrez d’abord votre empreinte (ou visage) dans les réglages de l’appareil, puis revenez ici.`
    : `Votre appareil (${dev}) est compatible, mais le navigateur utilisé n’expose pas la vérification biométrique. Rouvrez cette adresse dans Chrome ou Safari, puis activez-la.`;
}
async function fpRefreshHint() {
  const el = document.getElementById('fpHint'); if (!el) return;
  const cap = await fpCapability();
  const dev = deviceInfo();
  el.innerHTML = cap.api
    ? (cap.auth ? `${icon('fingerprint', 11)} Votre empreinte ne quitte jamais votre appareil (${dev}) : la plateforme ne garde qu’une clé publique.`
                : `${icon('fingerprint', 11)} Enregistrez votre empreinte (ou visage) dans les réglages de cet appareil (${dev}), puis activez-la ici.`)
    : `${icon('fingerprint', 11)} Appareil détecté (${dev}), mais ce navigateur n’expose pas la biométrie. Rouvrez la plateforme dans Chrome ou Safari pour l’activer.`;
}
async function toggleWebauthn() {
  const u = getUser(S.session.userId);
  if (u.webauthn) { u.webauthn = false; u.webauthnCred = null; fpRemember(u.id, false); save(); render(); toast('Connexion par empreinte désactivée.', '', 'fingerprint'); return; }
  const cap = await fpCapability();
  if (!cap.api || !cap.auth) { render(); toast(fpUnavailableMsg(cap), 'err', 'fingerprint'); return; }
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'DAVAR Académie' },
      user: { id: new TextEncoder().encode(u.id), name: u.email, displayName: u.name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000 } });
    u.webauthn = true; u.webauthnCred = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
    fpRemember(u.id, true);
    save(); render(); toast('Empreinte enregistrée ✓ Sur CET appareil, vous pourrez vous connecter d’un geste depuis l’écran de connexion.', 'ok', 'fingerprint');
  } catch (e) { render(); toast('Lecture de l’empreinte annulée. Réessayez quand vous voulez.', 'err', 'fingerprint'); }
}
/* Le bouton n'apparaît sur l'écran de connexion QUE si cet appareil
   a déjà enregistré une empreinte pour un compte du campus. */
function fpDeviceUsers() {
  try {
    return (JSON.parse(localStorage.getItem('davar_fp') || '[]')).filter(id => { const x = getUser(id); return x && x.webauthn; });
  } catch (e) { return []; }
}
function fpRemember(id, on) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('davar_fp') || '[]'); } catch (e) { }
  list = list.filter(x => x !== id);
  if (on) list.push(id);
  try { localStorage.setItem('davar_fp', JSON.stringify(list)); } catch (e) { }
}
async function loginFingerprint(silent) {
  if (!window.PublicKeyCredential || !navigator.credentials || !navigator.credentials.get) { if (!silent) toast('Non disponible sur cet appareil.', 'err', 'fingerprint'); return; }
  try {
    const asr = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: 'required', timeout: 60000 } });
    const hid = asr.userHandle ? new TextDecoder().decode(asr.userHandle) : null;
    const u = hid && getUser(hid);
    if (!u) { if (!silent) toast('Empreinte reconnue, mais aucun compte associé.', 'err', 'fingerprint'); return; }
    doLogin(u.id);
  } catch (e) { if (!silent) toast('Empreinte non reconnue ou lecture annulée.', 'err', 'fingerprint'); }
}
/* Comme les grandes plateformes : à la reconnexion, l'empreinte se propose
   d'elle-même (une seule fois par affichage de l'écran de connexion). */
let FP_AUTO = { armed: false };
function fpAutoArm() { FP_AUTO.armed = true; }
function fpAutoPrompt() {
  if (!FP_AUTO.armed) return;
  FP_AUTO.armed = false;
  if (!window.PublicKeyCredential || !fpDeviceUsers().length) return;
  if (!navigator.credentials || !navigator.credentials.get) return;
  setTimeout(() => {
    const r = currentRoute();
    if (!S.session && r.parts.length === 0) loginFingerprint(true);
  }, 700);
}

/* ---------------- CHARIOW (paiement) ---------------- */
function openChariow(tid) {
  const t = getTraining(tid); if (!t) return;
  openModal({
    title: 'Obtenir « ' + esc(t.title) + ' »',
    body: `
      <div class="row between small"><span class="muted">Prix de la formation</span><b>${fmtMoney(t.price)}</b></div>
      <div class="banner info mt16">${icon('wallet', 15)}<span class="small">Le paiement s’effectue sur une <b>page de paiement sécurisée</b>. Dès que votre paiement est confirmé, la formation est <b>débloquée automatiquement</b> sur votre compte existant — jamais de doublon.</span></div>
      <div class="banner ok mt16">${icon('shield', 15)}<span class="small">Paiement sécurisé — la formation est ajoutée à votre compte existant dès confirmation.</span></div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button>
      ${t.chariow_url ? `<button class="btn btn-primary" onclick="window.open('${t.chariow_url}','_blank');toast('Ouverture du paiement sécurisé','','external')">${icon('external', 14)} Payer par carte bancaire</button>` : ''}
      ${fwEnabled() && ((fwCfg().mode || 'fallback') === 'fallback') ? `<button class="btn" onclick="closeModal();openFlutterwave('${tid}')">${icon('zap', 14)} Alternative : Flutterwave (mobile money + carte)</button>` : ''}`
  });
}
function simulateChariowWebhook(tid) {
  /* Simule le Pulse Chariow réel « successful.sale » : signature vérifiée → compte identifié → formation attribuée.
     Au 1er achat, Chariow transmet les infos client (pays + indicatif) → mémorisées pour router les achats suivants. */
  const u = S.session.userId; const t = getTraining(tid);
  const cu = getUser(u);
  cu.country = cu.country || 'Côte d’Ivoire'; cu.dial = cu.dial || '+225'; cu.paySource = 'chariow';
  const saleId = 'sal_' + Math.random().toString(36).slice(2, 12);
  ensureEnrollment(u, tid);
  S.sales.unshift({ id: 'v-' + Math.floor(1000 + Math.random() * 9000), ref: saleId, userId: u, email: getUser(u).email, trainingId: tid, amount: t.price, method: 'Chariow', status: 'confirmé', at: Date.now() });
  notify(u, 'sale', 'Achat confirmé ✓', `« ${t.title} » est débloquée sur votre compte.`);
  notify('u-yann', 'sale', 'Vente Chariow 💰', `${getUser(u).name} — ${t.title}`);
  sendFlow('purchase_ok', getUser(u).email, { title: t.title, userId: u });
  recordAudit('chariow_pulse', { event: 'successful.sale', sale: saleId, product: (t.chariow_url || '').match(/prd_[a-z0-9]+/i)?.[0] || null, customer: getUser(u).email, delivery: 'dlv_' + Math.random().toString(36).slice(2, 10) });
  save(); closeModal(); render();
  toast('Paiement confirmé : formation débloquée 🎉', 'ok', 'unlock');
}

/* ===== FLUTTERWAVE (fournisseur optionnel) — contrat officiel API v3 =====
   1) Paiement : POST https://api.flutterwave.com/v3/payments
      { tx_ref, amount, currency:'XOF', redirect_url, customer:{email,name}, customizations:{title,description} }
      → { status:'success', data:{link} } → redirection vers le checkout hébergé
        (mobile money Côte d'Ivoire dont Wave, Sénégal, + cartes internationales)
   2) Webhook POST /api/flutterwave/webhook : en-tête verifi-hash = secret configuré ;
      payload { event:'charge.completed', data:{ id, tx_ref, flw_ref, status:'successful', amount, currency, customer } }
   3) Vérification serveur : GET /v3/transactions/:id/verify (Bearer clé secrète) → data.status 'successful'
   Règles identiques à Money Fusion : jamais confiance au webhook seul, 1 tx_ref = 1 crédit, jamais de doublon de compte.
   Frais indicatifs (à vérifier sur la grille Flutterwave) : mobile money XOF ≈ 1,4 % · carte internationale ≈ 3,8 %. */
const FW_API = 'https://api.flutterwave.com/v3/payments';
const FW_RATE = { momo: 0.014, card: 0.038 };
function fwCfg() { return S.settings.flutterwave || { enabled: false, mode: 'fallback' }; }
function fwEnabled() { return !!fwCfg().enabled; }
/* Quelle voie Flutterwave prend-il en charge ? 'fallback' = simple alternative proposée dans les modales. */
function fwHandles(route) {
  if (!fwEnabled()) return false;
  const mode = fwCfg().mode || 'fallback';
  if (mode === 'all') return true;
  if (mode === 'cards') return route === 'chariow';
  return false;
}
function fwCreatePayment(u, t, ref) {
  const payload = {
    tx_ref: ref, amount: t.price, currency: 'XOF',
    redirect_url: 'https://davarcampus.co/#/checkout/' + t.id,
    customer: { email: u.email, name: u.name },
    customizations: { title: 'Davar Académie Campus', description: t.title }
  };
  const id = Math.floor(1000000 + Math.random() * 8999999);
  const rec = { id, tx_ref: ref, flw_ref: 'FLW-MOCK-' + Math.random().toString(36).slice(2, 10).toUpperCase(), userId: u.id, trainingId: t.id, amount: t.price, currency: 'XOF', status: 'pending', processed: false, createdAt: Date.now(), payload };
  S.fwPayments = S.fwPayments || []; S.fwPayments.push(rec); save();
  recordAudit('flutterwave_initiate', { api: FW_API, tx_ref: ref, amount: t.price, currency: 'XOF' });
  return { status: 'success', message: 'CHARGE_INITIATED', data: { id, link: 'https://checkout.flutterwave.com/v3/hosted/pay/' + rec.flw_ref.toLowerCase() } };
}
function openFlutterwave(tid) {
  const t = getTraining(tid); if (!t) return;
  const u = getUser(S.session.userId);
  const ref = 'DAV-' + Math.floor(1000 + Math.random() * 9000);
  const res = fwCreatePayment(u, t, ref);
  openModal({
    title: 'Payer « ' + esc(t.title) + ' »',
    body: `
      <div class="row between small"><span class="muted">Prix de la formation</span><b>${fmtMoney(t.price)}</b></div>
      <div class="banner info mt16">${icon('wallet', 15)}<span class="small">Paiement sécurisé Flutterwave : <b>mobile money (Wave, Orange, MTN, Moov)</b> ou <b>carte internationale</b>. Dès confirmation, la formation est débloquée sur <b>ce compte</b> — jamais de doublon.</span></div>`,
    foot: `<button class="btn" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="window.open('${res.data.link}','_blank');toast('Ouverture du paiement sécurisé Flutterwave','','external')">${icon('external', 14)} Ouvrir le paiement sécurisé</button>`
  });
}
/* Démo : simule le webhook Flutterwave « charge.completed » avec un verifi-hash valide */
function simulateFlutterwaveWebhook(tid) {
  const u = S.session.userId;
  const rec = (S.fwPayments || []).find(p => p.userId === u && p.trainingId === tid && !p.processed);
  if (!rec) { toast('Aucun paiement en cours.', 'err', 'alert'); return; }
  rec.status = 'successful';
  fwWebhook({ event: 'charge.completed', data: { id: rec.id, tx_ref: rec.tx_ref, flw_ref: rec.flw_ref, status: 'successful', amount: rec.amount, currency: rec.currency, customer: { email: getUser(u).email } } }, { 'verifi-hash': fwCfg().webhookSecret || 'DEMO-SECRET' });
}
/* POST /api/flutterwave/webhook (simulé) — mêmes règles que Money Fusion */
function fwWebhook(ev, headers) {
  const h = headers || {};
  const secret = fwCfg().webhookSecret || 'DEMO-SECRET';
  if ((h['verifi-hash'] || '') !== secret) { recordAudit('flutterwave_webhook', { rejected: 'verifi-hash invalide' }); return; }
  if (!ev || ev.event !== 'charge.completed' || !ev.data || ev.data.status !== 'successful') { recordAudit('flutterwave_webhook', { rejected: 'événement non payable', event: ev && ev.event }); return; }
  const d = ev.data;
  const rec = (S.fwPayments || []).find(p => p.tx_ref === d.tx_ref);
  if (!rec) { recordAudit('flutterwave_webhook', { rejected: 'tx_ref inconnu', tx_ref: d.tx_ref }); return; }
  if (rec.processed) return; /* notification redondante : déjà crédité */
  const check = fwVerifyTransaction(d.id); /* re-vérification API — jamais confiance au webhook seul */
  if (!check || check.status !== 'success' || !check.data || check.data.status !== 'successful') { recordAudit('flutterwave_webhook', { rejected: 'vérification ≠ successful', tx_ref: d.tx_ref }); return; }
  rec.processed = true; rec.status = 'successful'; rec.decidedAt = Date.now();
  const t = getTraining(rec.trainingId); const u = getUser(rec.userId);
  const channel = String((check.data.payment_type || '')).indexOf('card') === 0 ? 'Carte' : 'Mobile Money';
  ensureEnrollment(rec.userId, rec.trainingId);
  S.sales.unshift({ id: 'v-' + Math.floor(1000 + Math.random() * 9000), ref: rec.tx_ref, userId: rec.userId, email: u.email, trainingId: rec.trainingId, amount: t.price, method: 'Flutterwave · ' + channel, status: 'confirmé', txn: d.flw_ref, at: Date.now() });
  notify(rec.userId, 'sale', 'Achat confirmé ✓', `« ${t.title} » a été ajoutée à votre compte.`);
  notify('u-yann', 'sale', 'Vente Flutterwave 💰', `${u.name} — ${t.title} (${fmtMoney(rec.amount)} · ${channel})`);
  sendFlow('purchase_ok', u.email, { title: t.title, userId: rec.userId });
  recordAudit('flutterwave_webhook', { event: 'charge.completed', tx_ref: d.tx_ref, flw_ref: d.flw_ref, channel });
  save(); if (typeof closeModal === 'function') closeModal();
  if (CHECKOUT.tid === rec.trainingId) CHECKOUT.step = 3;
  render();
  toast('Paiement confirmé : formation débloquée 🎉', 'ok', 'unlock');
}
/* GET /v3/transactions/:id/verify — vérification côté serveur (Bearer clé secrète) */
function fwVerifyTransaction(id) {
  const rec = (S.fwPayments || []).find(p => p.id === id);
  if (!rec) return null;
  return { status: 'success', message: 'Transaction fetched', data: { id: rec.id, tx_ref: rec.tx_ref, flw_ref: rec.flw_ref, status: rec.status, amount: rec.amount, currency: rec.currency, payment_type: 'mobile_money' } };
}

/* ---------------- DEMANDE DE CERTIFICAT ---------------- */
function requestCert(tid) {
  const u = S.session.userId; const t = getTraining(tid);
  if (S.certRequests.some(q => q.userId === u && q.trainingId === tid && q.status === 'pending')) return;
  S.certRequests.push({ id: uid(), userId: u, trainingId: tid, at: Date.now(), status: 'pending' });
  notify('u-yann', 'cert', 'Demande de certificat 🎓', `${getUser(u).name} a terminé « ${t.title} » à 100 % et demande son certificat.`);
  sendFlow('cert_request_staff', getUser('u-yann').email, { name: getUser(u).name, code: t.abbr || t.code });
  save(); render();
  toast('Demande envoyée. L’administration programme votre évaluation.', 'gold', 'award');
}

/* ---------------- SUPPORT (discussion temps réel) ---------------- */
const SUP = { open: false, pop: false, popView: 'menu' };
function supportStaff() {
  const ids = S.team.filter(m => m.roles.includes('support')).map(m => m.email);
  return S.users.filter(u => isStaff(u) && (ids.includes(u.email) || u.id === 'u-yann' && false));
}
function openSupport(wide) {
  SUP.wide = !!wide;
  if (SUP.pop && !SUP.open) { closeSupPop(); return; }
  SUP.pop = true; SUP.popView = 'menu'; SUP.open = false; render();
}
function closeSupPop() { SUP.pop = false; SUP.popView = 'menu'; SUP.wide = false; render(); }
function openReport() { SUP.pop = true; SUP.popView = 'form'; render(); }
function openSupportChat() {
  if (!supportStaff().length) { SUP.pop = true; SUP.popView = 'nosup'; render(); return; }
  SUP.fromPop = !!SUP.pop; SUP.pop = false; SUP.open = true; SUP.view = 'chat'; render();
}
/* Retour de la discussion : revient à la page d'avant, en rouvrant le petit panneau
   support s'il était ouvert (depuis le casque), sinon ferme simplement le chat. */
function supChatBack() {
  SUP.open = false;
  if (SUP.fromPop) { SUP.pop = true; SUP.popView = 'menu'; }
  SUP.fromPop = false; render();
}
function closeSupport() { SUP.open = false; SUP.view = 'chat'; render(); }
function supPopHTML(u) {
  const sup = S.settings.support;
  const form = SUP.popView === 'form';
  const nosup = SUP.popView === 'nosup';
  const supOn = supportStaff().length > 0;
  return `<div class="sup-pop-back" onclick="closeSupPop()"></div>
  <div class="sup-pop${SUP.wide && form ? ' wide' : ''}" role="dialog" aria-label="Aide">
    <div class="sp-head">
      <div><b>Besoin d’aide ?</b><span>${form ? 'Décrivez votre problème : l’équipe est notifiée immédiatement. Réponse sous 48 h maximum.' : nosup ? 'La discussion en direct est momentanément indisponible : laissez-nous un message.' : 'Reportez le problème — nous vous répondons sous 48 h maximum.'}</span></div>
      <button class="icon-btn" onclick="closeSupPop()" title="Fermer">${icon('x', 16)}</button>
    </div>
    ${nosup ? `<div class="col" style="gap:9px">
        <div class="banner info" style="text-align:left;margin:0">${icon('headset', 15)}<span class="small"><b>Discussion en direct indisponible.</b> Aucun conseiller support n’est disponible pour le moment. Écrivez-nous : réponse garantie sous 48 h maximum.</span></div>
        <a class="sp-btn" href="mailto:${esc((S.settings.emails || {}).support || 'support@davarcampus.co')}"><span class="ic">${icon('mail', 15)}</span><span class="wrap" style="text-align:left"><span class="lb">Envoyer un e-mail au support</span><small>Réponse sous 48 h maximum.</small></span></a>
        <button class="sp-btn" onclick="openReport()"><span class="ic">${icon('edit', 15)}</span><span class="wrap" style="text-align:left"><span class="lb">Report</span><small>Écrivez-nous, on s’occupe du reste.</small></span></button>
        <button class="sp-btn" onclick="SUP.popView='menu';render()"><span class="ic">${icon('chevL', 15)}</span><span class="wrap" style="text-align:left"><span class="lb">Retour</span><small>Revenir au menu d’aide.</small></span></button>
      </div>` : form ? `<div class="col" style="gap:8px">
        <input class="inp sp-inp" id="rpEmail" type="email" placeholder="Votre adresse e-mail *" value="${esc(u.email)}">
        <input class="inp sp-inp" id="rpSubject" maxlength="80" placeholder="Objet *">
        <textarea class="inp sp-inp" id="rpText" rows="4" placeholder="Décrivez votre problème…"></textarea>
        <button class="sp-btn sp-send" onclick="sendReport()">${icon('send', 14)} Envoyer</button>
      </div>` : `<div class="col" style="gap:9px">
        <button class="sp-btn" onclick="openSupportChat()"><span class="ic">${icon('message', 15)}</span><span class="wrap" style="text-align:left"><span class="lb">Discussion en direct</span><small>${supOn ? 'L’équipe vous répond ici même.' : 'Indisponible pour le moment'}</small></span></button>
        <a class="sp-btn" href="${esc(sup.whatsapp)}" target="_blank" rel="noopener"><span class="ic">${icon('whatsapp', 15)}</span><span class="wrap" style="text-align:left"><span class="lb">WhatsApp</span><small>Réponse rapide sur votre téléphone.</small></span></a>
        <a class="sp-btn" href="tel:${esc(sup.phone)}"><span class="ic">${icon('phone', 15)}</span><span class="wrap" style="text-align:left"><span class="lb">Appeler</span><small>Ouvre directement votre téléphone.</small></span></a>
        <button class="sp-btn" onclick="openReport()"><span class="ic">${icon('mail', 15)}</span><span class="wrap" style="text-align:left"><span class="lb">Report</span><small>Écrivez-nous, on s’occupe du reste.</small></span></button>
      </div>`}
  </div>`;
}
function sendReport() {
  const em = (document.getElementById('rpEmail').value || '').trim();
  const sb = (document.getElementById('rpSubject').value || '').trim();
  const tx = (document.getElementById('rpText').value || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast('Indiquez une adresse e-mail valide.', 'err', 'mail'); return; }
  if (!sb || !tx) { toast('L’objet et le message sont nécessaires.', 'err', 'edit'); return; }
  S.reports = S.reports || [];
  S.reports.push({ id: uid(), userId: S.session.userId, email: em, subject: sb, text: tx, at: Date.now(), status: 'new' });
  const u = getUser(S.session.userId);
  const supTeam = supportStaff();
  (supTeam.length ? supTeam : S.users.filter(x => isStaff(x))).forEach(st => notify(st.id, 'warn', 'Nouveau report client', `${u.name} · ${sb} — à prendre en charge par le support.`));
  SUP.pop = false; SUP.popView = 'menu'; save(); render();
  toast('Report transmis à l’équipe ✓ Réponse sous 48 h maximum.', 'ok', 'check');
}
function supportThread() {
  const u = S.session.userId;
  let th = S.supportThreads.find(x => x.userId === u);
  if (!th) {
    const staff = supportStaff();
    if (!staff.length) return null;   /* aucun membre support : pas de discussion en direct */
    const assigned = staff[Math.floor(Math.random() * staff.length)];
    th = { id: uid(), userId: u, staffId: assigned.id, messages: [] };
    S.supportThreads.push(th);
  }
  return th;
}
function supportPanelHTML(u) {
  const th = supportThread();
  const staff = getUser(th.staffId);
  return `<div class="chat-overlay" onclick="if(event.target===this)closeSupport()">
    <div class="chat-panel">
      <div class="chat-head">
        <button class="icon-btn" onclick="supChatBack()" title="Retour">${icon('back', 16)}</button>
        <div class="wrap"><b style="font-size:13.5px">Discussion en direct</b><div class="xs faint">${staff ? esc(staff.name) : 'L’équipe'}</div></div>
        <button class="icon-btn" onclick="closeSupport()">${icon('x', 17)}</button>
      </div>
      <div class="chat-msgs" id="supMsgs">
        ${th.messages.length ? th.messages.map(m => m.from === 'student'
          ? `<div class="msg me"><span class="who">Vous · ${timeAgo(m.at)}</span><span class="bubble">${esc(m.text)}</span></div>`
          : `<div class="msg coach"><span class="who">${icon('headset', 11)} ${staff ? esc(staff.name) : 'Équipe'} · ${timeAgo(m.at)}</span><span class="bubble">${esc(m.text)}</span></div>`).join('')
        : `<div class="empty small">Décrivez votre problème : l’équipe vous répond ici.</div>`}
      </div>
      <div class="chat-foot">
        <div class="chat-input">
          <input class="inp" id="supInput" placeholder="Décrivez votre problème…" onkeydown="if(event.key==='Enter')sendSupport()">
          <button class="btn btn-primary" onclick="sendSupport()">${icon('send', 15)}</button>
        </div>
      </div>
    </div>
  </div>`;
}
function sendSupport() {
  const inp = document.getElementById('supInput'); const txt = inp.value.trim(); if (!txt) return;
  const th = supportThread();
  if (!th) { toast('La discussion en direct est indisponible pour le moment. Utilisez le Report.', 'err', 'headset'); return; }
  th.messages.push({ id: uid(), from: 'student', text: txt, at: Date.now() });
  notify(th.staffId, 'info', 'Message du support étudiant', `${getUser(S.session.userId).name} : ${txt.slice(0, 60)}`);
  save(); render();
  setTimeout(() => { const el = document.getElementById('supMsgs'); if (el) el.scrollTop = el.scrollHeight; }, 30);
}
function staffSupportReply(threadId, text) {
  const th = S.supportThreads.find(x => x.id === threadId); if (!th || !text.trim()) return;
  th.messages.push({ id: uid(), from: 'staff', text: text.trim(), at: Date.now() });
  notify(th.userId, 'info', 'Réponse du support', text.slice(0, 80));
  save(); render();
}

/* ---------------- BINDINGS ÉTUDIANT ---------------- */
function bindStudent(r) {
  const p = r.parts;
  if (p[0] === 'parametres' || p[0] === 'profil') fpRefreshHint();
  if (p[0] === 'formation' && p[2] === 'module') {
    requestAnimationFrame(updatePlayerUI);
  }
  if (CHAT.open) requestAnimationFrame(() => { const el = document.getElementById('chatMsgs'); if (el) el.scrollTop = el.scrollHeight; });
}
