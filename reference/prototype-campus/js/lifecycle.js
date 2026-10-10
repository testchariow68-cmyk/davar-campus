/* ============================================================
   DAVAR DATA LIFECYCLE & PURGE ENGINE
   Brique d'architecture centrale du cycle de vie des données.
   Pipeline : IDENTIFIER → CLASSIFIER → POLITIQUE → EXPIRATION →
   EXCEPTIONS → PURGE_PENDING → SUPPRESSION → VÉRIFICATION →
   JOURNALISATION MINIMALE.
   Règle absolue : une donnée n'est conservée que tant qu'une
   finalité légitime le justifie.
   ============================================================ */

const LIFECYCLE = {
  name: 'DAVAR DATA LIFECYCLE & PURGE ENGINE',
  version: '1.0',
  /* §42 — Matrice globale des politiques (référence affichable) */
  classes: [
    ['Fichier d’évaluation (audio/vidéo/document)', 'Suppression immédiate après la décision de correction'],
    ['Soumission remplacée', 'Suppression immédiate de l’ancien fichier'],
    ['Upload abandonné (non soumis)', 'Purge après 24 heures'],
    ['Fichier orphelin (sans référence valide)', 'Purge automatique'],
    ['Conversation coach', '12 mois maximum (exception : litige/obligation)'],
    ['Conversation IA', '90 jours maximum (statistiques anonymisées conservées)'],
    ['Notifications lues', 'Disparaissent 48 heures après leur lecture'],
    ['Notifications anciennes', '180 jours maximum'],
    ['Sessions, codes et jetons', 'Purge après utilisation ou expiration'],
    ['Logs techniques', '90 jours maximum'],
    ['Logs de sécurité / audit', '12 mois maximum'],
    ['Formation active', 'Conservation nécessaire au service'],
    ['Accès formation acheté', '12 mois à partir de l’achat — puis la formation prend fin (conditions Davar)'],
    ['Compte dont tous les accès ont expiré sans nouvelle acquisition', 'Considéré terminé → éligible à la purge après 12 mois (§19)'],
    ['Étudiant terminé, 12 mois sans nouvelle formation', 'Éligible à la purge des données personnelles'],
    ['Statistiques anonymisées', 'Conservation longue possible'],
    ['Slide temporaire de certificat', 'Suppression après génération'],
    ['PDF de certificat', 'Politique de certification'],
    ['Preview de certificat', 'Même cycle de vie que le PDF'],
    ['Registre de certification', 'Politique de certification, séparé du compte'],
    ['Badges / récompenses', 'Politique du compte (statistiques anonymisées possibles)'],
    ['Progression active', 'Conservation nécessaire']
  ],
  /* §39 — Couches de stockage contrôlées */
  layers: [
    ['Base de données (Turso en production)', 'Données structurées, métadonnées et références — jamais les gros fichiers'],
    ['Stockage fichiers (Cloudflare R2 en production)', 'Fichiers contrôlés : raison d’exister, expiration, règle de suppression'],
    ['Google Drive', 'Certificats PDF officiels et fichiers associés'],
    ['Fichiers temporaires', 'Uploads en attente — purge 24 h si non soumis'],
    ['Sauvegardes', 'Rotation et durée définies — jamais une archive éternelle'],
    ['Exports administratifs', 'Téléchargés immédiatement, non conservés côté serveur']
  ],
  /* §17 — Actions considérées comme logs de sécurité (12 mois) */
  securityActions: ['password_change', 'role_change', 'permission_change', 'ownership_transfer_init', 'ownership_transfer_cancel', 'badge_manual', 'cert_generated', 'cert_refused', 'cert_revoked', 'account_expired', 'purge', 'login_failed', 'export', 'api_key_created', 'api_key_revoked', 'suspension', 'grace_student'],
  /* §3 — Décisions de correction entraînant la suppression du fichier */
  decisionDeletes: ['approved', 'rejected', 'retry', 'changes']
};

function lcCfg() {
  return S.lifecycle;
}

/* ---------------- §5 : CLASSIFICATION & VALIDATION DES FICHIERS ---------------- */
const LC_AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac'];
const LC_VIDEO_EXT = ['mp4', 'mov', 'webm', 'mkv', 'avi'];
const LC_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
function lcExtClass(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (LC_AUDIO_EXT.includes(ext)) return 'audio';
  if (LC_VIDEO_EXT.includes(ext)) return 'video';
  if (LC_IMAGE_EXT.includes(ext)) return 'image';
  if ((lcCfg().docExt || []).includes(ext)) return 'doc';
  return null;   /* extension inconnue → refus */
}
function lcMimeClass(mime) {
  if (!mime) return null;
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  return 'doc';  /* application/*, text/*… */
}
function lcKindOf(name, mime) { return lcExtClass(name) || lcMimeClass(mime) || 'doc'; }
function lcValidateUpload(name, sizeBytes, mime) {
  const cfg = lcCfg();
  /* Ne pas faire confiance à l'extension seule : croiser extension ET type MIME réel */
  const extClass = lcExtClass(name);
  if (!extClass)
    return { ok: false, reason: 'Format non accepté. Documents autorisés : ' + cfg.docExt.join(', ').toUpperCase() + ' (ou audio/vidéo).' };
  const mimeClass = lcMimeClass(mime);
  if (mimeClass && mimeClass !== extClass)
    return { ok: false, reason: 'Le type réel du fichier (' + mimeClass + ') ne correspond pas à son extension (' + extClass + '). Fichier refusé par sécurité.' };
  if (sizeBytes <= 0) return { ok: false, reason: 'Fichier vide ou illisible.' };
  const max = extClass === 'audio' ? cfg.limits.audio : extClass === 'video' ? cfg.limits.video : cfg.limits.doc;
  if (sizeBytes > max) {
    const lbl = extClass === 'audio' ? 'Audio' : extClass === 'video' ? 'Vidéo' : 'Document';
    return { ok: false, reason: `${lbl} trop lourd : ${lcSize(sizeBytes)} alors que la limite est de ${lcSize(max)}. Réduisez votre fichier puis réessayez.` };
  }
  return { ok: true, kind: extClass };
}
function lcSize(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1).replace('.', ',') + ' Mo';
  return Math.max(1, Math.round(b / 1024)) + ' Ko';
}

/* ---------------- §8 / §44 : REGISTRE DES FICHIERS (submission_objects) ---------------- */
function lcStoreFile(opts) {
  const f = {
    id: uid(),
    key: 'f-' + uid(),
    kind: opts.kind,                 /* audio | video | doc | image | cert-pdf | cert-preview */
    owner: opts.owner || null,       /* propriétaire logique */
    reason: opts.reason,             /* raison d'exister */
    refType: opts.refType || null,   /* submission | cert | … */
    refId: opts.refId || null,
    mime: opts.mime || '',
    sizeBytes: opts.sizeBytes || 0,
    name: opts.name || '',
    createdAt: opts.createdAt || Date.now(),
    expiresAt: opts.expiresAt || Date.now() + 14 * DAY,   /* §10 : expiration de sécurité */
    status: opts.status || 'active', /* active | draft | replaced | processed | orphan */
    rule: opts.rule || 'Suppression dès la fin du traitement'
  };
  S.files.push(f);
  if (opts.dataUrl) S.fileBlobs[f.key] = opts.dataUrl;
  return f;
}
function lcDeleteFile(fid, reason) {
  const i = S.files.findIndex(x => x.id === fid || x.key === fid);
  if (i < 0) return false;
  const f = S.files[i];
  delete S.fileBlobs[f.key];
  S.files.splice(i, 1);
  /* Vérification immédiate : le contenu physique n'existe plus */
  const verified = !(f.key in S.fileBlobs);
  lcLog('FICHIER_' + (f.kind || '').toUpperCase(), 1, verified ? 'supprimé et vérifié' : 'erreur de suppression', reason);
  return verified;
}
/* §6/§7 : une seule soumission active par évaluation — l'ancienne est écrasée */
function lcReplaceActiveFiles(userId, evId) {
  const subIds = S.submissions.filter(x => x.userId === userId && x.evId === evId && (x.status === 'pending' || x.status === 'active')).map(x => x.id);
  const old = S.files.filter(f => f.refType === 'submission' && subIds.includes(f.refId) && f.status === 'active');
  let n = 0;
  old.forEach(f => { if (lcDeleteFile(f.id, 'remplacé par une nouvelle soumission')) n++; });
  return n;
}

/* ---------------- §41 : JOURNAL DE PURGE (trace technique minimale) ---------------- */
function lcLog(type, count, result, detail) {
  S.purgeLog.unshift({ id: uid(), at: Date.now(), type, count, result, detail: detail || '' });
  if (S.purgeLog.length > 400) S.purgeLog.length = 400;
}

/* ============================================================
   §12 : PURGE DE SECOURS — exécution périodique et coordonnée
   ============================================================ */
function runLifecycleEngine(force) {
  const cfg = lcCfg();
  if (!force && Date.now() - cfg.lastRun < 12 * 3600000) return { skipped: true };
  cfg.lastRun = Date.now();
  const report = { files: 0, abandoned: 0, orphans: 0, convAI: 0, convCoach: 0, notifs: 0, tokens: 0, logs: 0, pending: 0, executed: 0, cancelled: 0, certs: 0 };

  /* --- Fichiers expirés (§10) --- */
  S.files.slice().forEach(f => {
    if (f.expiresAt && f.expiresAt < Date.now()) { if (lcDeleteFile(f.id, 'expiré')) report.files++; }
  });
  /* --- Uploads abandonnés (§9 : 24 h sans soumission) --- */
  S.files.slice().forEach(f => {
    if (f.status === 'draft' && Date.now() - f.createdAt > cfg.abandonedHours * 3600000) { if (lcDeleteFile(f.id, 'abandonné')) report.abandoned++; }
  });
  /* --- Soumissions remplacées (§6/§7) --- */
  S.files.slice().forEach(f => {
    if (f.status === 'replaced') { if (lcDeleteFile(f.id, 'remplacé')) report.files++; }
  });
  /* --- Fichiers orphelins (§11) --- */
  S.files.slice().forEach(f => {
    if (!f.refType) return;
    let alive = false;
    if (f.refType === 'submission') alive = S.submissions.some(x => x.id === f.refId);
    else if (f.refType === 'cert') alive = S.certs.some(c => c.id === f.refId);
    if (!alive) { if (lcDeleteFile(f.id, 'orphelin')) report.orphans++; }
  });

  /* --- Conversations IA (§14 : 90 jours + stats anonymisées) --- */
  S.threads.slice().forEach(th => {
    const aiMsgs = th.messages.filter(m => m.from === 'ai');
    if (!aiMsgs.length) return;
    const lastAi = Math.max(...aiMsgs.map(m => m.at));
    if (Date.now() - lastAi > cfg.aiConvDays * DAY) {
      const hadStudent = th.messages.some(m => m.from === 'student');
      th.messages = th.messages.filter(m => m.from !== 'ai' && m.from !== 'student' && m.from !== 'sys');
      S.anonymStats.aiConvPurged++;
      report.convAI++;
      if (!th.messages.length) { th.dead = true; }
      if (hadStudent) S.anonymStats.aiRequests++;
    }
  });
  S.threads = S.threads.filter(th => !th.dead);

  /* --- Conversations coach (§13 : 12 mois, exceptions contrôlées) --- */
  S.threads.slice().forEach(th => {
    if (th.messages.some(m => m.from === 'ai') && !th.messages.some(m => m.from === 'coach' || m.coach)) return;
    const last = Math.max(...th.messages.map(m => m.at));
    if (Date.now() - last > cfg.coachConvMonths * 30 * DAY) {
      if (th.hold) return;                       /* exception documentée : litige, obligation… */
      S.threads = S.threads.filter(x => x.id !== th.id);
      S.anonymStats.coachConvPurged++;
      report.convCoach++;
    }
  });

  /* --- Notifications (§15 + règle propriétaire : disparition 48 h après lecture) --- */
  const before = S.notifs.length;
  S.notifs = S.notifs.filter(n => {
    if (n.read && Date.now() - (n.readAt || n.at) > cfg.notifReadHours * 3600000) return false;
    if (Date.now() - n.at > cfg.notifMaxDays * DAY) return false;
    return true;
  });
  report.notifs = before - S.notifs.length;

  /* --- Sessions, invitations, codes, jetons (§16) --- */
  const inv0 = S.invites.length;
  S.invites = S.invites.filter(i => !i.used && i.expiresAt > Date.now());
  if (S.pendingTransfer && Date.now() - S.pendingTransfer.at > 7 * DAY) S.pendingTransfer = null;
  report.tokens = inv0 - S.invites.length;

  /* --- Logs (§17) --- */
  const log0 = S.auditLog.length;
  S.auditLog = S.auditLog.filter(a => {
    const sec = LIFECYCLE.securityActions.includes(a.action);
    const maxAge = sec ? cfg.secLogMonths * 30 * DAY : cfg.techLogDays * DAY;
    return Date.now() - a.at <= maxAge;
  });
  report.logs = log0 - S.auditLog.length;

  /* --- Cycle de vie des comptes (§18-23) --- */
  const acc = lcAccountLifecycle();
  report.pending = acc.pending; report.executed = acc.executed; report.cancelled = acc.cancelled;

  /* --- Certificats arrivés en fin de politique (§34) --- */
  S.certs.forEach(c => {
    const age = Date.now() - (c.issuedAt || c.at || 0);
    if (c.status !== 'expiré' && age > cfg.certRetentionYears * 365 * DAY) {
      ['pdfRef', 'previewRef'].forEach(k => { if (c[k]) { lcDeleteFile(c[k], 'certificat expiré'); c[k] = null; } });
      c.status = 'expiré';
      report.certs++;
    }
  });

  save();
  return report;
}

/* ---------------- §19-23 : CYCLE DE VIE DES COMPTES ÉTUDIANTS ---------------- */
function lcAccessExpiresAt(e) { return e.accessExpiresAt || (e.at + ACCESS_MONTHS * 30 * DAY); }
function lcAccessExpired(e, now) { return lcAccessExpiresAt(e) <= now; }
function lcEntitlementInfo(stId) {
  /* §20 : timestamps distincts — dernière activité pédagogique ≠ dernière acquisition */
  const now = Date.now();
  const enrs = S.enrollments.filter(e => e.userId === stId);
  const lastEntitlement = enrs.length ? Math.max(...enrs.map(e => e.at)) : 0;   /* dernière nouvelle formation */
  /* Durée du compte comprise : un accès expiré (12 mois) n'est plus un service en cours (§18) */
  const activeEnrollment = enrs.some(e => !e.completedAt && !lcAccessExpired(e, now));
  const ended = enrs.some(e => e.completedAt || lcAccessExpired(e, now));
  return { lastEntitlement, activeEnrollment, ended, pedLast: S.pedLast[stId] || 0 };
}
function lcAccountLifecycle() {
  const cfg = lcCfg();
  const out = { pending: 0, executed: 0, cancelled: 0 };
  const now = Date.now();
  const grace = cfg.accountGraceMonths * 30 * DAY;

  S.users.filter(u => u.role === 'student').forEach(st => {
    const info = lcEntitlementInfo(st.id);
    const pending = S.purgePending.find(p => p.userId === st.id);

    /* Exceptions §22 : nouvelle formation, paiement, certification, demande, litige, obligation */
    const exception =
      info.activeEnrollment ||
      info.lastEntitlement && (now - info.lastEntitlement < grace) ||
      S.certRequests.some(c => c.userId === st.id && c.status === 'pending') ||
      S.submissions.some(x => x.userId === st.id && x.status === 'pending') ||
      S.sales.some(s => s.userId === st.id && s.status === 'declaré') ||
      st.hold === true;

    if (pending) {
      if (exception) {
        S.purgePending = S.purgePending.filter(p => p.userId !== st.id);
        lcLog('COMPTE', 1, 'PURGE_CANCELLED', st.id);
        out.cancelled++;
        return;
      }
      if (now - pending.at >= cfg.quarantineDays * DAY) {
        lcExecuteAccountPurge(st.id);
        S.purgePending = S.purgePending.filter(p => p.userId !== st.id);
        out.executed++;
      }
      return;
    }
    /* Éligibilité : terminé + 12 mois sans nouvelle ACQUISITION.
       Connexion, relecture et consultation ne remettent PAS le compteur à zéro (§19). */
    const finished = info.lastEntitlement && !info.activeEnrollment && info.ended;
    if (finished && now - info.lastEntitlement >= grace && !exception) {
      S.purgePending.push({ userId: st.id, at: now, reason: 'Formation terminée depuis plus de ' + cfg.accountGraceMonths + ' mois sans nouvelle acquisition' });
      lcLog('COMPTE', 1, 'PURGE_PENDING', st.id);
      notify('u-yann', 'admin', 'Compte en quarantaine avant purge', `${st.name} : purge des données personnelles prévue dans ${cfg.quarantineDays} jours (aucune nouvelle formation).`);
      out.pending++;
    }
  });
  return out;
}
/* §21 : purge réelle des données personnelles (pas une simple désactivation) */
function lcExecuteAccountPurge(stId) {
  const st = getUser(stId);
  const stName = st ? st.name : stId;
  /* §23 : statistiques anonymisées avant suppression */
  const enrs = S.enrollments.filter(e => e.userId === stId);
  enrs.forEach(e => {
    const t = getTraining(e.trainingId);
    if (t) {
      S.anonymStats.completionsByTraining[t.id] = S.anonymStats.completionsByTraining[t.id] || { done: 0, total: 0 };
      S.anonymStats.completionsByTraining[t.id].total++;
      if (e.completedAt) S.anonymStats.completionsByTraining[t.id].done++;
    }
  });
  S.anonymStats.accountsPurged++;
  /* §35 : le registre de certification survit au compte (holderName figé à l'émission) */
  S.users = S.users.filter(x => x.id !== stId);
  S.enrollments = S.enrollments.filter(e => e.userId !== stId);
  S.threads = S.threads.filter(th => th.userId !== stId);
  S.submissions = S.submissions.filter(x => x.userId !== stId);
  S.reviews = S.reviews.filter(r => r.userId !== stId);
  S.rewards = S.rewards.filter(r => r.userId !== stId);
  S.notifs = S.notifs.filter(n => n.userId !== stId);
  delete S.progress[stId]; delete S.exAttempts[stId]; delete S.evAttempts[stId];
  delete S.pedLast[stId]; delete S.pedDays[stId]; delete S.reviewAsked[stId];
  S.files.filter(f => f.owner === stId).forEach(f => lcDeleteFile(f.id, 'purge du compte'));
  lcLog('COMPTE', 1, 'PURGE_EXECUTED', stName + ' — données personnelles supprimées, certificats et statistiques anonymisées conservés');
}

/* ---------------- Vérification & rapport ---------------- */
function lcEngineState() {
  const now = Date.now();
  return {
    files: S.files.length,
    fileBytes: S.files.reduce((a, f) => a + (f.sizeBytes || 0), 0),
    drafts: S.files.filter(f => f.status === 'draft').length,
    orphansCandidates: S.files.filter(f => f.refType === 'submission' && !S.submissions.some(x => x.id === f.refId)).length,
    aiThreads: S.threads.filter(th => th.messages.some(m => m.from === 'ai')).length,
    coachThreads: S.threads.filter(th => th.messages.some(m => m.coach || m.from === 'coach')).length,
    heldThreads: S.threads.filter(th => th.hold).length,
    oldNotifs: S.notifs.filter(n => n.read && now - (n.readAt || n.at) > lcCfg().notifReadHours * 3600000).length,
    pendingAccounts: S.purgePending.length,
    watchedAccounts: S.users.filter(u => u.role === 'student' && lcEntitlementInfo(u.id).lastEntitlement && !lcEntitlementInfo(u.id).activeEnrollment).length,
    certs: S.certs.length,
    lastRun: lcCfg().lastRun
  };
}
