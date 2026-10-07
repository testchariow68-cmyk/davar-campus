/**
 * CYCLE DE VIE DES DONNÉES — porté de `js/lifecycle.js` du prototype.
 *
 * Règle absolue du prototype, reprise telle quelle : « une donnée n'est
 * conservée que tant qu'une finalité légitime le justifie ».
 *
 * DEUX PRÉCAUTIONS, DÉCIDÉES PAR LE PROPRIÉTAIRE :
 *   1. AUCUNE purge automatique. L'état est calculé à la demande, et rien ne
 *      s'écrit sans un geste explicite (`appliquer: true`) accompagné de sa
 *      phrase de confirmation ;
 *   2. ce qui est une pièce comptable (ventes, accès), une preuve (certificats)
 *      ou un travail en attente (devoirs non corrigés) n'est JAMAIS purgé.
 *
 * Les durées sont celles du prototype (`data.js`, `settings.lifecycle`) :
 * fichiers abandonnés 24 h, conversations IA 90 jours, conversations coach
 * 12 mois, notifications lues 48 h (180 jours au plus), journaux techniques
 * 90 jours, journaux de sécurité 12 mois, compte terminé + 12 mois sans
 * nouvelle acquisition → quarantaine 7 jours → effacement de l'identité.
 */
import type { Db } from './auth-core';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown, defaut = 0): number {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return defaut;
}

const JOUR = 86_400_000;
const MOIS = 30 * JOUR;

/** Les durées de conservation — celles du prototype, affichables et modifiables. */
export const CONFIG_CYCLE_DE_VIE = {
  abandonedHours: 24,
  aiConvDays: 90,
  coachConvMonths: 12,
  notifReadHours: 48,
  notifMaxDays: 180,
  techLogDays: 90,
  secLogMonths: 12,
  accountGraceMonths: 12,
  quarantineDays: 7,
  certRetentionYears: 30,
} as const;

/** §42 — la matrice des politiques, telle qu'elle est publiée. */
export const POLITIQUES: Array<[string, string]> = [
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
  ['Compte dont tous les accès ont expiré sans nouvelle acquisition', 'Éligible à la purge après 12 mois (§19)'],
  ['Étudiant terminé, 12 mois sans nouvelle formation', 'Éligible à la purge des données personnelles'],
  ['Statistiques anonymisées', 'Conservation longue possible'],
  ['Registre de certification', 'Politique de certification, séparé du compte'],
  ['Badges / récompenses', 'Politique du compte (statistiques anonymisées possibles)'],
  ['Progression active', 'Conservation nécessaire'],
];

/** §17 — actions considérées comme journaux de sécurité (12 mois). */
export const ACTIONS_SECURITE = [
  'password_change',
  'role_change',
  'permission_change',
  'ownership_transfer_init',
  'ownership_transfer_cancel',
  'badge_manual',
  'cert_generated',
  'cert_refused',
  'cert_revoked',
  'account_expired',
  'purge',
  'login_failed',
  'export',
  'api_key_created',
  'api_key_revoked',
  'suspension',
  'grace_student',
];

export const CLE_CYCLE_ACTIF = 'lifecycle.actif';
export const CLE_DERNIERE_EXECUTION = 'lifecycle.derniere_execution';

export type RapportCycle = {
  sessionsExpirees: number;
  jetonsExpires: number;
  notificationsLues: number;
  notificationsAnciennes: number;
  conversationsIa: number;
  conversationsCoach: number;
  journauxTechniques: number;
  comptesEligibles: number;
  comptesEnQuarantaine: number;
  comptesAPurger: number;
  comptesSuspendusParException: number;
  certificatsHorsPolitique: number;
  devoirsEnAttente: number;
  dernierPassageMs: number;
  actif: boolean;
};

/** Combien d'éléments chaque règle vise, SANS RIEN ÉCRIRE. */
export async function etatCycleDeVie(db: Db, maintenant = Date.now()): Promise<RapportCycle> {
  const cfg = CONFIG_CYCLE_DE_VIE;
  const compte = async (sql: string, args: unknown[] = []): Promise<number> => {
    try {
      const resultat = await db.execute({ sql, args });
      return entier(resultat.rows[0]?.n);
    } catch {
      return 0;
    }
  };

  const sessionsExpirees = await compte('SELECT COUNT(*) AS n FROM sessions WHERE expires_at_ms <= ?', [maintenant]);
  const jetonsExpires = await compte(
    'SELECT COUNT(*) AS n FROM email_tokens WHERE expires_at_ms <= ? OR used_at_ms IS NOT NULL',
    [maintenant]
  );
  const notificationsLues = await compte(
    'SELECT COUNT(*) AS n FROM notifications WHERE read_at_ms IS NOT NULL AND read_at_ms <= ?',
    [maintenant - cfg.notifReadHours * 3600_000]
  );
  const notificationsAnciennes = await compte('SELECT COUNT(*) AS n FROM notifications WHERE created_at_ms <= ?', [
    maintenant - cfg.notifMaxDays * JOUR,
  ]);
  const conversationsIa = await compte(
    `SELECT COUNT(*) AS n FROM conversations WHERE mode = 'ai' AND purge_after_ms <= ?`,
    [maintenant]
  );
  const conversationsCoach = await compte(
    `SELECT COUNT(*) AS n FROM conversations
      WHERE mode = 'coach' AND resolved = 0 AND updated_at_ms <= ?`,
    [maintenant - cfg.coachConvMonths * MOIS]
  );
  const journauxTechniques = await compte('SELECT COUNT(*) AS n FROM ops_events WHERE occurred_at_ms <= ?', [
    maintenant - cfg.techLogDays * JOUR,
  ]);
  const certificatsHorsPolitique = await compte('SELECT COUNT(*) AS n FROM certificates WHERE issued_at_ms <= ?', [
    maintenant - cfg.certRetentionYears * 365 * JOUR,
  ]);
  const devoirsEnAttente = await compte("SELECT COUNT(*) AS n FROM submissions WHERE status = 'pending'");

  const eligibles = await comptesEligibles(db, maintenant).catch(() => []);
  const quarantaine = await db
    .execute('SELECT user_id, at_ms, hold, executed_at_ms, cancelled_at_ms FROM purge_pending')
    .catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
  const lignesQuarantaine = quarantaine.rows.filter((row) => !row.executed_at_ms && !row.cancelled_at_ms);
  const peutEtrePurge = lignesQuarantaine.filter(
    (row) => !entier(row.hold) && maintenant - entier(row.at_ms) >= cfg.quarantineDays * JOUR
  );

  const dernierPassage = await db
    .execute({ sql: 'SELECT value FROM app_settings WHERE key = ?', args: [CLE_DERNIERE_EXECUTION] })
    .catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
  const actif = await db
    .execute({ sql: 'SELECT value FROM app_settings WHERE key = ?', args: [CLE_CYCLE_ACTIF] })
    .catch(() => ({ rows: [] as Array<Record<string, unknown>> }));

  return {
    sessionsExpirees,
    jetonsExpires,
    notificationsLues,
    notificationsAnciennes,
    conversationsIa,
    conversationsCoach,
    journauxTechniques,
    comptesEligibles: eligibles.length,
    comptesEnQuarantaine: lignesQuarantaine.length,
    comptesAPurger: peutEtrePurge.length,
    comptesSuspendusParException: lignesQuarantaine.filter((row) => entier(row.hold) === 1).length,
    certificatsHorsPolitique,
    devoirsEnAttente,
    dernierPassageMs: entier(Number(texte(dernierPassage.rows[0]?.value))),
    actif: texte(actif.rows[0]?.value) === '1',
  };
}

export type CompteEligible = { userId: string; courriel: string; nom: string; derniereFormationMs: number };

/**
 * §19-22 : un compte est éligible quand l'étudiant a TERMINÉ et que 12 mois ont
 * passé SANS NOUVELLE ACQUISITION. Se connecter, relire une leçon ou consulter
 * son campus ne remet PAS le compteur à zéro — seule une nouvelle formation compte.
 * Les exceptions protègent ce qui est en cours : correction, certificat, litige.
 */
export async function comptesEligibles(db: Db, maintenant = Date.now()): Promise<CompteEligible[]> {
  const cfg = CONFIG_CYCLE_DE_VIE;
  const lignes = await db.execute({
    sql: `SELECT u.id, u.email_normalized, u.display_name,
                 (SELECT MAX(e.acquired_at_ms) FROM enrollments e WHERE e.user_id = u.id) AS derniere
          FROM users u
          WHERE u.role = 'student' AND u.is_test = 0
            AND EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id)
            AND NOT EXISTS (
              SELECT 1 FROM certificate_requests c WHERE c.user_id = u.id AND c.status = 'pending'
            )
            AND NOT EXISTS (
              SELECT 1 FROM submissions s WHERE s.user_id = u.id AND s.status = 'pending'
            )
            AND NOT EXISTS (
              SELECT 1 FROM conversations c WHERE c.user_id = u.id AND c.mode = 'coach' AND c.resolved = 0
            )`,
    args: [],
  });
  return lignes.rows
    .map((row) => ({
      userId: texte(row.id),
      courriel: texte(row.email_normalized),
      nom: texte(row.display_name),
      derniereFormationMs: entier(row.derniere),
    }))
    .filter((compte) => compte.derniereFormationMs > 0 && maintenant - compte.derniereFormationMs >= cfg.accountGraceMonths * MOIS);
}

export type JournalPurge = { kind: string; count: number; result: string; detail: string; atMs: number };

async function journaliser(db: Db, kind: string, count: number, result: string, detail = '', atMs = Date.now()): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO purge_log(id, kind, count, result, detail, at_ms) VALUES (?,?,?,?,?,?)',
    args: [`pl_${atMs.toString(36)}${Math.random().toString(36).slice(2, 8)}`, kind, count, result, detail, atMs],
  });
}

export async function journalDePurge(db: Db, limite = 40): Promise<JournalPurge[]> {
  try {
    const lignes = await db.execute({
      sql: 'SELECT kind, count, result, detail, at_ms FROM purge_log ORDER BY at_ms DESC LIMIT ?',
      args: [Math.min(Math.max(limite, 1), 200)],
    });
    return lignes.rows.map((row) => ({
      kind: texte(row.kind),
      count: entier(row.count),
      result: texte(row.result),
      detail: texte(row.detail),
      atMs: entier(row.at_ms),
    }));
  } catch {
    return [];
  }
}

/** Statistiques anonymisées : des nombres, jamais des personnes. */
async function compterAnonyme(db: Db, cle: string, ajout: number, maintenant: number): Promise<void> {
  const ligne = await db.execute({ sql: 'SELECT value FROM app_settings WHERE key = ?', args: [cle] });
  const valeur = Number(texte(ligne.rows[0]?.value, '0')) || 0;
  await db.execute({
    sql: `INSERT INTO app_settings(key, value, updated_at_ms) VALUES (?,?,?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms`,
    args: [cle, String(valeur + ajout), maintenant],
  });
}

export type ResultatCycle = { rapport: RapportCycle; journal: JournalPurge[]; applique: boolean };

/**
 * EXÉCUTION — à la demande, jamais toute seule.
 *
 * `appliquer: false` (défaut) = simple état, zéro écriture.
 * `appliquer: true` = purge des seules catégories sûres, puis quarantaine des
 * comptes éligibles. L'effacement d'une identité exige, en plus, que la
 * quarantaine du prototype (7 jours) soit écoulée et qu'aucune exception ne
 * l'ait suspendue.
 */
export async function executerCycleDeVie(
  db: Db,
  options: { appliquer?: boolean; acteur?: string; maintenant?: number } = {}
): Promise<ResultatCycle> {
  const maintenant = options.maintenant ?? Date.now();
  const cfg = CONFIG_CYCLE_DE_VIE;
  const rapportAvant = await etatCycleDeVie(db, maintenant);

  if (!options.appliquer) return { rapport: rapportAvant, journal: await journalDePurge(db), applique: false };

  const purger = async (sql: string, args: unknown[]): Promise<number> => {
    const resultat = await db.execute({ sql, args });
    return Number(resultat.rowsAffected ?? 0);
  };

  // 1. Sessions expirées.
  const sessions = await purger('DELETE FROM sessions WHERE expires_at_ms <= ?', [maintenant]);
  if (sessions > 0) await journaliser(db, 'SESSIONS', sessions, 'supprimées', 'expirées', maintenant);

  // 2. Codes et jetons utilisés ou expirés.
  const jetons = await purger('DELETE FROM email_tokens WHERE expires_at_ms <= ? OR used_at_ms IS NOT NULL', [maintenant]);
  if (jetons > 0) await journaliser(db, 'JETONS', jetons, 'supprimés', 'utilisés ou expirés', maintenant);

  // 3. Notifications : disparues 48 h après lecture, 180 jours au plus.
  const notificationsLues = await purger(
    'DELETE FROM notifications WHERE read_at_ms IS NOT NULL AND read_at_ms <= ?',
    [maintenant - cfg.notifReadHours * 3600_000]
  );
  const notificationsAnciennes = await purger('DELETE FROM notifications WHERE created_at_ms <= ?', [
    maintenant - cfg.notifMaxDays * JOUR,
  ]);
  if (notificationsLues + notificationsAnciennes > 0)
    await journaliser(db, 'NOTIFICATIONS', notificationsLues + notificationsAnciennes, 'supprimées', 'lues 48 h / 180 jours', maintenant);

  // 4. Conversations IA : 90 jours, statistiques anonymisées conservées.
  const conversationsIa = await db.execute({
    sql: `SELECT id FROM conversations WHERE mode = 'ai' AND purge_after_ms <= ?`,
    args: [maintenant],
  });
  for (const row of conversationsIa.rows) {
    const id = texte(row.id);
    await db.execute({ sql: 'DELETE FROM conversation_messages WHERE conversation_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM conversations WHERE id = ?', args: [id] });
  }
  if (conversationsIa.rows.length > 0) {
    await compterAnonyme(db, 'stats.anonymes.conversationsIa', conversationsIa.rows.length, maintenant);
    await journaliser(db, 'CONVERSATIONS_IA', conversationsIa.rows.length, 'supprimées', '90 jours — statistiques anonymisées conservées', maintenant);
  }

  // 5. Conversations coach : 12 mois, SAUF exception (litige, obligation → resolved).
  const conversationsCoach = await db.execute({
    sql: `SELECT id FROM conversations WHERE mode = 'coach' AND resolved = 0 AND updated_at_ms <= ?`,
    args: [maintenant - cfg.coachConvMonths * MOIS],
  });
  for (const row of conversationsCoach.rows) {
    const id = texte(row.id);
    await db.execute({ sql: 'DELETE FROM conversation_messages WHERE conversation_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM conversations WHERE id = ?', args: [id] });
  }
  if (conversationsCoach.rows.length > 0) {
    await compterAnonyme(db, 'stats.anonymes.conversationsCoach', conversationsCoach.rows.length, maintenant);
    await journaliser(db, 'CONVERSATIONS_COACH', conversationsCoach.rows.length, 'supprimées', '12 mois — exceptions conservées', maintenant);
  }

  // 6. Journaux techniques : 90 jours.
  const journaux = await purger('DELETE FROM ops_events WHERE occurred_at_ms <= ?', [maintenant - cfg.techLogDays * JOUR]);
  if (journaux > 0) await journaliser(db, 'JOURNAUX_TECHNIQUES', journaux, 'supprimés', '90 jours', maintenant);

  // 7. Comptes : quarantaine. On n'efface JAMAIS au premier passage.
  const eligibles = await comptesEligibles(db, maintenant);
  for (const compte of eligibles) {
    const existe = await db.execute({ sql: 'SELECT id FROM purge_pending WHERE user_id = ?', args: [compte.userId] });
    if (existe.rows.length > 0) continue;
    await db.execute({
      sql: 'INSERT INTO purge_pending(id, user_id, reason, hold, at_ms) VALUES (?,?,?,0,?)',
      args: [
        `pp_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        compte.userId,
        `Formation terminée depuis plus de ${cfg.accountGraceMonths} mois sans nouvelle acquisition`,
        maintenant,
      ],
    });
    await journaliser(db, 'COMPTE', 1, 'PURGE_PENDING', 'quarantaine ouverte', maintenant);
  }

  const enQuarantaine = await db.execute({
    sql: 'SELECT user_id, at_ms FROM purge_pending WHERE executed_at_ms IS NULL AND cancelled_at_ms IS NULL AND hold = 0',
    args: [],
  });
  for (const row of enQuarantaine.rows) {
    const userId = texte(row.user_id);
    if (maintenant - entier(row.at_ms) < cfg.quarantineDays * JOUR) continue;
    // L'exception est revérifiée à l'instant de l'effacement : une correction
    // rendue entre-temps remet la purge en cause.
    const encoreEligible = (await comptesEligibles(db, maintenant)).some((compte) => compte.userId === userId);
    if (!encoreEligible) {
      await db.execute({
        sql: 'UPDATE purge_pending SET cancelled_at_ms = ? WHERE user_id = ? AND executed_at_ms IS NULL',
        args: [maintenant, userId],
      });
      await journaliser(db, 'COMPTE', 1, 'PURGE_CANCELLED', 'une exception est apparue', maintenant);
      continue;
    }
    await effacerIdentite(db, userId, maintenant);
  }

  await db.execute({
    sql: `INSERT INTO app_settings(key, value, updated_at_ms) VALUES (?,?,?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms`,
    args: [CLE_DERNIERE_EXECUTION, String(maintenant), maintenant],
  });

  return { rapport: await etatCycleDeVie(db, maintenant), journal: await journalDePurge(db), applique: true };
}

/**
 * §21 : purge réelle des données personnelles — pas une simple désactivation.
 *
 * Une seule chose survit : le registre de certification (un certificat délivré
 * doit rester vérifiable) et les statistiques anonymisées. L'identité, elle,
 * disparaît : le nom devient « Compte terminé », l'adresse est effacée.
 */
export async function effacerIdentite(db: Db, userId: string, maintenant = Date.now()): Promise<boolean> {
  const utilisateur = await db.execute({
    sql: 'SELECT display_name, email_normalized FROM users WHERE id = ?',
    args: [userId],
  });
  if (utilisateur.rows.length === 0) return false;
  // L'identité est déjà effacée : on ne recompte pas, on ne rejournalise pas.
  if (texte(utilisateur.rows[0].email_normalized).startsWith('compte-efface+')) return false;

  const formations = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM enrollments WHERE user_id = ?',
    args: [userId],
  });
  await compterAnonyme(db, 'stats.anonymes.comptesEffaces', 1, maintenant);
  await compterAnonyme(db, 'stats.anonymes.accesEffaces', entier(formations.rows[0]?.n), maintenant);

  const suppressions: Array<[string, string]> = [
    ['sessions', 'DELETE FROM sessions WHERE user_id = ?'],
    ['email_tokens', 'DELETE FROM email_tokens WHERE user_id = ?'],
    ['notifications', 'DELETE FROM notifications WHERE user_id = ?'],
    ['conversation_messages', 'DELETE FROM conversation_messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)'],
    ['conversations', 'DELETE FROM conversations WHERE user_id = ?'],
    ['reviews', 'DELETE FROM reviews WHERE user_id = ?'],
    ['badge_awards', 'DELETE FROM badge_awards WHERE user_id = ?'],
    ['assessment_attempts', 'DELETE FROM assessment_attempts WHERE user_id = ?'],
    ['lesson_completions', 'DELETE FROM lesson_completions WHERE user_id = ?'],
    ['submissions', 'DELETE FROM submissions WHERE user_id = ?'],
    ['certificate_requests', 'DELETE FROM certificate_requests WHERE user_id = ?'],
    ['enrollments', 'DELETE FROM enrollments WHERE user_id = ?'],
  ];
  for (const [, sql] of suppressions) await db.execute({ sql, args: [userId] });

  // L'identité s'efface ; le registre de certification et les ventes restent.
  await db.execute({
    sql: `UPDATE users SET email_normalized = ?, display_name = 'Compte terminé', password_hash = 'identite-effacee',
                 status = 'suspended', client_salt = NULL WHERE id = ?`,
    args: [`compte-efface+${userId}@davar.invalid`, userId],
  });
  await db.execute({
    sql: 'UPDATE purge_pending SET executed_at_ms = ? WHERE user_id = ? AND executed_at_ms IS NULL',
    args: [maintenant, userId],
  });
  await journaliser(
    db,
    'COMPTE',
    1,
    'PURGE_EXECUTED',
    'identité effacée — certificats et statistiques anonymisées conservés',
    maintenant
  );
  return true;
}

/** Ouvre ou suspend la quarantaine d'un compte, à la main du propriétaire. */
export async function deciderQuarantaine(
  db: Db,
  userId: string,
  decision: 'suspendre' | 'reprendre' | 'annuler',
  maintenant = Date.now()
): Promise<boolean> {
  if (decision === 'annuler') {
    const resultat = await db.execute({
      sql: 'UPDATE purge_pending SET cancelled_at_ms = ? WHERE user_id = ? AND executed_at_ms IS NULL AND cancelled_at_ms IS NULL',
      args: [maintenant, userId],
    });
    return Number(resultat.rowsAffected ?? 0) > 0;
  }
  const resultat = await db.execute({
    sql: 'UPDATE purge_pending SET hold = ? WHERE user_id = ? AND executed_at_ms IS NULL AND cancelled_at_ms IS NULL',
    args: [decision === 'suspendre' ? 1 : 0, userId],
  });
  return Number(resultat.rowsAffected ?? 0) > 0;
}
