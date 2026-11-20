/* ============================================================
   MOTEUR DE RÉCOMPENSES DAVAR — il ne fait qu'exécuter les règles.
   Tout est préconfiguré dans REWARD_DEFS ; rien n'est inventé.
   En production : toutes les conditions sont vérifiées côté serveur.
   ============================================================ */

/* ---------- Noyau : attribution unique + historique ---------- */
function rwHas(userId, badgeId) { return S.rewards.some(r => r.userId === userId && r.badgeId === badgeId); }
function rwMine(userId) { return S.rewards.filter(r => r.userId === userId).sort((a, b) => b.at - a.at); }
function grantBadge(userId, badgeId, meta) {
  const d = REWARD_DEFS[badgeId];
  if (!d || !d.short || rwHas(userId, badgeId)) return false;
  S.rewards.unshift({
    id: uid(), userId, badgeId, at: Date.now(), type: d.cat,
    source: (meta && meta.source) || '', trainingId: (meta && meta.trainingId) || null,
    moduleId: (meta && meta.moduleId) || null, desc: (meta && meta.desc) || d.desc,
    mode: (meta && meta.mode) || 'AUTOMATIQUE'
  });
  notify(userId, 'badge', d.notifTitle || 'Nouvelle distinction', `${d.name} — ${d.short}`, { badge: badgeId });
  S.pendingReveal[userId] = badgeId;
  save();
  return true;
}

/* ---------- Activité pédagogique réelle ---------- */
function rwActivity(userId) {
  const now = Date.now();
  S.pedLast[userId] = now;
  const day = new Date(now).toISOString().slice(0, 10);
  S.pedDays[userId] = S.pedDays[userId] || [];
  if (!S.pedDays[userId].includes(day)) S.pedDays[userId].push(day);
  /* Régularité : jours d'activité distincts sur la période configurable */
  const cfg = S.rewardSettings.reg;
  const cut = now - cfg.periodDays * 86400000;
  const actives = S.pedDays[userId].filter(d => new Date(d).getTime() >= cut).length;
  if (actives >= cfg.minActiveDays) grantBadge(userId, 'BADGE_REGULARITE', { source: `activité sur ${actives} jours / ${cfg.periodDays}` });
  save();
}
/* Premier Pas : le premier cours réellement suivi (pas la simple connexion) */
function rwCourseStarted(userId) {
  grantBadge(userId, 'BADGE_PREMIER_PAS', { source: 'premier cours suivi dans le Campus' });
}
/* En Route : un premier chapitre entièrement accompli */
function rwChapterCheck(userId, t) {
  /* En Route = le PREMIER chapitre entièrement accompli (et seulement lui) */
  const ch0 = (t.chapters || [])[0];
  const done = ch0 && (ch0.steps || []).length && (ch0.steps || []).every(st => stepDone(userId, t, st));
  if (done) grantBadge(userId, 'BADGE_EN_ROUTE', { trainingId: t.id, source: 'premier chapitre accompli' });
}

/* ---------- Persévérance : difficulté → reprise → réussite ---------- */
function rwSetback(userId, why) { S.retryFlag[userId] = why; save(); }
function rwRecovery(userId, why) {
  if (!S.retryFlag[userId]) return;
  delete S.retryFlag[userId];
  grantBadge(userId, 'BADGE_PERSEVERANCE', { source: why, desc: 'Une difficulté rencontrée, une reprise, une réussite.' });
}

/* ---------- Connexion : retour après absence (Premier Pas = premier cours) ---------- */
function rwLogin(u) {
  if (isStaff(u)) return;
  const now = Date.now();
  const last = S.pedLast[u.id];
  const absDays = S.rewardSettings.absenceDays;
  if (last && (now - last) >= absDays * 86400000) {
    const msg = RETURN_MSGS[(S.returnCount[u.id] || 0) % RETURN_MSGS.length];
    S.returnCount[u.id] = (S.returnCount[u.id] || 0) + 1;
    if (!rwHas(u.id, 'BADGE_RETOUR_EN_FORCE')) {
      grantBadge(u.id, 'BADGE_RETOUR_EN_FORCE', { source: `retour après ${Math.floor((now - last) / 86400000)} jours` });
    } else {
      notify(u.id, 'retour', 'Bon retour parmi nous', msg);
    }
  }
  S.reminderCycle[u.id] = 0;
  save();
}

/* ---------- Rappels après absence (cycle de N jours, jamais culpabilisant) ---------- */
function rwCheckReminders() {
  const absDays = S.rewardSettings.absenceDays;
  const now = Date.now();
  S.users.filter(x => x.role === 'student' && !isSuspended(x)).forEach(u => {
    const last = S.pedLast[u.id];
    if (!last) return;
    const days = Math.floor((now - last) / 86400000);
    if (days < absDays) { S.reminderCycle[u.id] = 0; return; }
    const cycle = Math.floor(days / absDays);
    if ((S.reminderCycle[u.id] || 0) >= cycle) return;
    S.reminderCycle[u.id] = cycle;
    const m = REMINDER_MSGS[(cycle - 1) % REMINDER_MSGS.length];
    notify(u.id, 'rappel', m.title, m.body);
    sendFlow('reward', u.email, { title: m.title, userId: u.id });
  });
  save();
}

/* ---------- Fin de formation : badge de formation + Mission Accomplie ---------- */
function rwTrainingComplete(userId, tid) {
  const entry = Object.values(REWARD_DEFS).find(d => d.cat === 'formation' && d.trainingId === tid);
  if (entry) grantBadge(userId, entry.id, { trainingId: tid, source: 'formation officiellement terminée' });
  /* Mission Accomplie : la première grande étape entièrement accomplie */
  grantBadge(userId, 'BADGE_MISSION_ACCOMPLIE', { trainingId: tid, source: 'première formation menée au bout' });
}

/* ---------- Emblème (rendu élégant, palette propre au badge) ---------- */
function rwEmblem(badgeId, size) {
  const d = REWARD_DEFS[badgeId];
  if (!d) return '';
  const cs = getComputedStyle(document.documentElement);
  const p = d.pal.map(v => String(v).startsWith('var(') ? (cs.getPropertyValue(v.slice(4, -1)).trim() || '#4C1D95') : v);
  const gid = 'g-' + badgeId + '-' + size;
  return `<svg width="${size}" height="${size}" viewBox="0 0 96 96" aria-hidden="true">
    <defs><radialGradient id="${gid}" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="${p[1] || '#F5F1E6'}"/><stop offset="55%" stop-color="${p[0]}"/><stop offset="100%" stop-color="${p[p.length - 1]}"/>
    </radialGradient></defs>
    <circle cx="48" cy="48" r="46" fill="url(#${gid})"/>
    <circle cx="48" cy="48" r="45" fill="none" stroke="${p[p.length - 1]}" stroke-width="1.6" opacity=".9"/>
    <circle cx="48" cy="48" r="39" fill="none" stroke="${p[1] || '#F5F1E6'}" stroke-width=".8" opacity=".5"/>
    <g transform="translate(24,24) scale(2)" fill="none" stroke="${p[1] || '#F5F1E6'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${(typeof ICONS !== 'undefined' && ICONS[d.icon]) || ICONS.award}</g>
  </svg>`;
}

/* ---------- Révélation : un moment précieux, pas un jeu ---------- */
function rwRevealHTML(u) {
  const bid = S.pendingReveal[u.id];
  const d = bid && REWARD_DEFS[bid];
  if (!d) return '';
  return `<div class="rw-veil">
    <div class="rw-reveal">
      <div class="rw-step rw-s1">Nouvelle distinction</div>
      <div class="rw-step rw-s2 rw-emb">${rwEmblem(bid, 132)}<span class="rw-halo"></span></div>
      <div class="rw-step rw-s3 rw-name">${esc(d.name)}</div>
      <div class="rw-step rw-s4 rw-short">${esc(d.short)}</div>
      <button class="btn btn-gold rw-step rw-s5" onclick="openBadgeSheet('${bid}')">Découvrir ma distinction</button>
      <button class="rw-close" onclick="rwDismiss()" title="Plus tard">${icon('x', 16)}</button>
    </div>
  </div>`;
}
function rwDismiss() { const u = S.session.userId; delete S.pendingReveal[u]; save(); render(); }
function openBadgeSheet(badgeId) {
  const d = REWARD_DEFS[badgeId]; if (!d) return;
  const uidv = S.session && S.session.userId;
  const got = uidv ? S.rewards.find(r => r.userId === uidv && r.badgeId === badgeId) : null;
  if (uidv) { delete S.pendingReveal[uidv]; const n = S.notifs.find(x => x.meta && x.meta.badge === badgeId && !x.read); if (n) n.read = true; save(); render(); }
  openModal({
    title: '',
    body: `<div style="text-align:center;padding:8px 6px">
      <div class="xs" style="letter-spacing:.14em;color:var(--gold);font-weight:700">${d.cat === 'formation' ? 'DISTINCTION DE FORMATION' : d.cat === 'accomplissement' ? 'DISTINCTION D’ACCOMPLISSEMENT' : 'DISTINCTION DE PARCOURS'}</div>
      <div class="rw-emb" style="margin:18px auto">${rwEmblem(badgeId, 120)}</div>
      <h2 style="font-size:22px;margin-bottom:8px">${esc(d.name)}</h2>
      ${got ? `<div class="xs muted mb8">Obtenue le ${fmtDate(new Date(got.at).toISOString().slice(0, 10))} · ${got.mode === 'MANUEL' ? 'attribuée par l’académie' : 'attribuée automatiquement'}</div>` : ''}
      <p class="small" style="max-width:400px;margin:0 auto 12px">${esc(d.short)}</p>
      <p class="small muted" style="max-width:420px;margin:0 auto 16px;font-style:italic">${esc(d.emotion)}</p>
      <div class="xs faint">${esc(d.desc)}</div>
    </div>`,
    foot: `<button class="btn btn-primary" onclick="closeModal()">${got ? 'Merci' : 'Compris'}</button>`
  });
}

/* ---------- Page étudiant : Mes récompenses ---------- */
function vRewards(u) {
  const mine = rwMine(u.id);
  const total = Object.keys(REWARD_DEFS).filter(k => REWARD_DEFS[k].short).length;
  const hero = mine[0];
  return `
  <div class="page-head"><div><h1>Mes récompenses</h1><p>Les étapes qui racontent votre parcours.</p></div></div>
  ${mine.length ? `
    <div class="rw-hero card card-pad">
      <div class="rw-emb">${rwEmblem(hero.badgeId, 110)}</div>
      <div class="wrap">
        <div class="eyebrow">Votre dernière distinction</div>
        <h3 style="font-size:20px;margin:4px 0 6px">${esc(REWARD_DEFS[hero.badgeId].name)}</h3>
        <p class="small muted">${esc(REWARD_DEFS[hero.badgeId].short)}</p>
        <div class="xs faint mt8">Obtenue le ${fmtDate(new Date(hero.at).toISOString().slice(0, 10))}</div>
        <button class="btn btn-sm mt8" onclick="openBadgeSheet('${hero.badgeId}')">Revoir la fiche</button>
      </div>
    </div>
    <div class="rw-gallery">
      ${mine.map(r => { const d = REWARD_DEFS[r.badgeId]; return `
        <button class="rw-card card" onclick="openBadgeSheet('${r.badgeId}')">
          ${rwEmblem(r.badgeId, 62)}
          <b>${esc(d.name)}</b>
          <span class="xs muted">${fmtDate(new Date(r.at).toISOString().slice(0, 10))}</span>
          <span class="xs faint" style="display:block;margin-top:4px">${esc(d.short)}</span>
        </button>`; }).join('')}
    </div>` : emptyState('award', 'Votre collection commence ici', 'Vos distinctions apparaîtront au fil de votre parcours — chacune raconte une étape que vous avez réellement franchie.')}
  ${mine.length < total ? `<div class="rw-mystery">Certaines distinctions ne se découvrent qu’en avançant.</div>` : ''}`;
}

/* ---------- Administration : catalogue, attribution manuelle, historique ---------- */
function aRewards(u) {
  const students = S.users.filter(x => x.role === 'student');
  const rs = S.rewardSettings;
  const catOrder = ['parcours', 'accomplissement', 'formation'];
  const catName = { parcours: 'Badges de parcours', accomplissement: 'Badges d’accomplissement', formation: 'Badges de formation' };
  return `
  <div class="page-head"><div><h1 style="font-size:19px">Récompenses</h1>
    <p>Reconnaissance pédagogique et humaine — jamais un jeu. Le catalogue est <b>entièrement préconfiguré</b> : l’application n’invente ni nom, ni icône, ni couleur. L’attribution manuelle reste possible pour une situation exceptionnelle.</p></div></div>

  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="card card-pad">
      <div class="eyebrow mb8">Réglages du moteur</div>
      <div class="field"><label>Absence avant rappel (jours)</label>
        <input class="inp" id="rwAbs" type="number" min="1" value="${rs.absenceDays}">
        <div class="hint">Rappel chaleureux à J+${rs.absenceDays}, puis à chaque nouveau cycle (${rs.absenceDays * 2} j, ${rs.absenceDays * 3} j…). Jamais culpabilisant.</div></div>
      <div class="row" style="gap:8px">
        <div class="field wrap"><label>Régularité — période (jours)</label><input class="inp" id="rwRegP" type="number" min="1" value="${rs.reg.periodDays}"></div>
        <div class="field wrap"><label>Jours actifs minimum</label><input class="inp" id="rwRegD" type="number" min="1" value="${rs.reg.minActiveDays}"></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="rwSaveSettings()">${icon('check', 13)} Enregistrer les réglages</button>
      <div class="divider"></div>
      <div class="eyebrow mb8">Outils de démonstration</div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <select class="inp" id="rwDemoUser" style="min-width:200px">${students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        <button class="btn btn-sm" onclick="rwSimulateAbsence(20)">${icon('clock', 13)} Simuler 20 jours d’absence</button>
        <button class="btn btn-sm" onclick="rwCheckReminders();render();toast('Cycle de rappels vérifié ✓','ok','bell')">${icon('bell', 13)} Vérifier les rappels</button>
      </div>
    </div>

    <div class="card card-pad">
      <div class="eyebrow mb8">Attribution manuelle (situation exceptionnelle)</div>
      <div class="field"><label>Étudiant</label>
        <select class="inp" id="rwMUser">${students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Distinction</label>
        <select class="inp" id="rwMBadge">${Object.values(REWARD_DEFS).filter(d => d.short).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Motif (consigné dans l’historique)</label>
        <input class="inp" id="rwMDesc" placeholder="Ex. reprise exceptionnelle validée par le coach"></div>
      <button class="btn btn-gold btn-sm" onclick="rwManualGrant()">${icon('award', 13)} Attribuer</button>
      <div class="xs faint mt8">Consigné avec le mode MANUEL. Un étudiant ne peut jamais s’attribuer une distinction lui-même.</div>
    </div>
  </div>

  ${catOrder.map(cat => `
  <div class="page-head" style="margin-top:26px"><div><h2 style="font-size:16px">${catName[cat]}</h2></div></div>
  <div class="rw-gallery">${Object.values(REWARD_DEFS).filter(d => d.cat === cat).map(d => `
    <div class="rw-card card" style="cursor:default">
      ${rwEmblem(d.id, 58)}
      <b>${esc(d.name)}</b>
      <span class="xs muted">${esc(d.desc)}</span>
      <span class="xs faint">${S.rewards.filter(r => r.badgeId === d.id).length} attribution(s)</span>
    </div>`).join('')}</div>`).join('')}

  <div class="page-head" style="margin-top:26px"><div><h2 style="font-size:16px">Historique des attributions</h2></div></div>
  <div class="card" style="overflow-x:auto">
    ${S.rewards.length ? `<table class="tbl"><thead><tr><th>Étudiant</th><th>Distinction</th><th>Date</th><th>Source</th><th>Mode</th></tr></thead><tbody>
      ${S.rewards.slice(0, 40).map(r => { const st = getUser(r.userId); const d = REWARD_DEFS[r.badgeId]; return `<tr>
        <td><div class="row">${st ? avatarHTML(st, 'sm') : ''}<span class="xs">${st ? esc(st.name) : '—'}</span></div></td>
        <td class="xs"><b>${esc(d ? d.name : r.badgeId)}</b></td>
        <td class="xs muted">${new Date(r.at).toLocaleString('fr-FR')}</td>
        <td class="xs muted">${esc(r.source || r.desc || '')}</td>
        <td>${r.mode === 'MANUEL' ? '<span class="badge b-gold">MANUEL</span>' : '<span class="badge b-grey">AUTOMATIQUE</span>'}</td></tr>`; }).join('')}
    </tbody></table>` : '<div style="padding:16px" class="xs muted">Aucune attribution pour l’instant — les premières distinctions arrivent avec l’activité des étudiants.</div>'}
  </div>`;
}
function rwSaveSettings() {
  const abs = parseInt(document.getElementById('rwAbs').value, 10) || 14;
  const p = parseInt(document.getElementById('rwRegP').value, 10) || 14;
  const d = parseInt(document.getElementById('rwRegD').value, 10) || 3;
  S.rewardSettings = { absenceDays: Math.max(1, abs), reg: { periodDays: Math.max(1, p), minActiveDays: Math.max(1, d) } };
  save(); render(); toast('Réglages du moteur enregistrés ✓', 'ok', 'settings');
}
function rwManualGrant() {
  const userId = document.getElementById('rwMUser').value;
  const badgeId = document.getElementById('rwMBadge').value;
  const desc = document.getElementById('rwMDesc').value.trim();
  if (!userId || !badgeId) return;
  if (rwHas(userId, badgeId)) return toast('Cette distinction a déjà été attribuée à cet étudiant.', 'err', 'award');
  grantBadge(userId, badgeId, { mode: 'MANUEL', source: 'attribution par l’administration', desc: desc || 'Situation exceptionnelle' });
  recordAudit('reward_manual', { user: userId, badge: badgeId });
  render(); toast(`${REWARD_DEFS[badgeId].name} attribuée ✓`, 'gold', 'award');
}
function rwSimulateAbsence(days) {
  const userId = document.getElementById('rwDemoUser').value;
  S.pedLast[userId] = Date.now() - days * 86400000;
  S.reminderCycle[userId] = 0;
  save(); render();
  toast(`Dernière activité de ${esc(getUser(userId).name)} replacée à ${days} jours — reconnectez-le pour voir le retour.`, 'ok', 'clock');
}
