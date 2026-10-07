/**
 * ASSIDUITÉ — les rappels chaleureux et les distinctions que le temps apporte.
 *
 * Le prototype a deux pièces que le campus ne savait pas encore jouer :
 *
 *   1. le RAPPEL après absence. Tous les `absenceDays` jours sans travail, un
 *      message part — jamais culpabilisant, et jamais deux fois le même cycle.
 *      Les quatre textes sont ceux du propriétaire (`data.js`, REMINDER_MSGS),
 *      recopiés mot pour mot, tournant dans l'ordre.
 *   2. la RÉGULARITÉ, la PERSÉVÉRANCE et le RETOUR EN FORCE, trois distinctions
 *      qui ne se voient que dans l'historique réel des jours travaillés.
 *
 * Tout est calculé sur des traces existantes (leçons terminées, lectures,
 * devoirs, évaluations, questions, connexions) : rien n'est inventé, et les
 * comptes de test n'entrent dans aucun calcul.
 */
import type { Db } from './auth-core.ts';
import { jourDe } from './assistant.ts';
import { attribuerBadge } from './recompenses.ts';
import { notifier } from './notifications.ts';
import { notificationsAcceptees } from './profil.ts';
import { ecrireReglages, lireReglages } from './settings.ts';

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Les valeurs du prototype (`data.js`, `rewardSettings`). */
export const REGLAGES_DEFAUT = {
  absenceDays: 14,
  periodDays: 14,
  minActiveDays: 3,
} as const;

export type ReglagesAssiduite = {
  /** Jours sans travail avant le premier rappel, puis à chaque cycle. */
  absenceDays: number;
  /** Fenêtre de la distinction « Régularité ». */
  periodDays: number;
  /** Jours travaillés minimum dans cette fenêtre. */
  minActiveDays: number;
};

/** Les quatre messages du propriétaire, dans son ordre (`REMINDER_MSGS`). */
export const RAPPELS: Array<{ title: string; body: string }> = [
  {
    title: 'Votre parcours vous attend',
    body: 'Cela fait quelque temps que nous ne vous avons pas vu. Prenez votre temps, puis revenez lorsque vous êtes prêt : votre parcours est toujours là.',
  },
  {
    title: 'Nous pensons à vous',
    body: 'Votre parcours est resté exactement là où vous l’aviez laissé. Revenez quand vous le souhaitez, nous serons heureux de vous retrouver.',
  },
  {
    title: 'Une étape vous attend',
    body: 'Chaque parcours a son rythme. Le vôtre vous attend, sagement, là où vous vous êtes arrêté.',
  },
  {
    title: 'Le campus vous garde une place',
    body: 'Pas à pas, à votre rythme : la prochaine étape de votre parcours est prête lorsque vous le serez.',
  },
];

const CLE_ABSENCE = 'rewards.absence_days';
const CLE_PERIODE = 'rewards.reg_period_days';
const CLE_MINIMUM = 'rewards.reg_min_active_days';

function entier(valeur: unknown, defaut: number): number {
  const nombre = Number(valeur);
  return Number.isFinite(nombre) && nombre > 0 ? Math.trunc(nombre) : defaut;
}

export async function lireReglagesAssiduite(db: Db): Promise<ReglagesAssiduite> {
  const reglages = await lireReglages(db);
  return {
    absenceDays: entier(reglages[CLE_ABSENCE], REGLAGES_DEFAUT.absenceDays),
    periodDays: entier(reglages[CLE_PERIODE], REGLAGES_DEFAUT.periodDays),
    minActiveDays: entier(reglages[CLE_MINIMUM], REGLAGES_DEFAUT.minActiveDays),
  };
}

export async function enregistrerReglagesAssiduite(
  db: Db,
  champs: { absenceDays?: number; periodDays?: number; minActiveDays?: number },
  maintenant = Date.now()
): Promise<ReglagesAssiduite> {
  const actuels = await lireReglagesAssiduite(db);
  const suivant: ReglagesAssiduite = {
    absenceDays: entier(champs.absenceDays, actuels.absenceDays),
    periodDays: entier(champs.periodDays, actuels.periodDays),
    minActiveDays: entier(champs.minActiveDays, actuels.minActiveDays),
  };
  await ecrireReglages(
    db,
    {
      [CLE_ABSENCE]: String(suivant.absenceDays),
      [CLE_PERIODE]: String(suivant.periodDays),
      [CLE_MINIMUM]: String(suivant.minActiveDays),
    },
    maintenant
  );
  return suivant;
}

/* --------------------------------------------------------------- traces */

async function lignesTraces(db: Db, depuisMs: number) {
  const [lecons, lectures, devoirs, questions, tentatives, connexions] = await Promise.all([
    db.execute({
      sql: `SELECT lc.user_id AS uid, lc.completed_at_ms AS at FROM lesson_completions lc
              JOIN users u ON u.id = lc.user_id AND u.is_test = 0 AND u.role = 'student'
             WHERE lc.completed_at_ms >= ?`,
      args: [depuisMs],
    }),
    db.execute({
      sql: `SELECT mp.user_id AS uid, mp.at_ms AS at FROM media_progress mp
              JOIN users u ON u.id = mp.user_id AND u.is_test = 0 AND u.role = 'student'
             WHERE mp.at_ms >= ?`,
      args: [depuisMs],
    }),
    db.execute({
      sql: `SELECT s.user_id AS uid, s.at_ms AS at FROM submissions s
              JOIN users u ON u.id = s.user_id AND u.is_test = 0 AND u.role = 'student'
             WHERE s.at_ms >= ?`,
      args: [depuisMs],
    }),
    db.execute({
      sql: `SELECT ad.user_id AS uid, ad.day AS jour FROM assistant_user_days ad
              JOIN users u ON u.id = ad.user_id AND u.is_test = 0 AND u.role = 'student'
             WHERE ad.day >= ?`,
      args: [jourDe(depuisMs)],
    }),
    db.execute({
      sql: `SELECT a.user_id AS uid, a.at_ms AS at FROM assessment_attempts a
              JOIN users u ON u.id = a.user_id AND u.is_test = 0 AND u.role = 'student'
             WHERE a.at_ms >= ?`,
      args: [depuisMs],
    }),
    db.execute({
      sql: `SELECT s.user_id AS uid, s.created_at_ms AS at FROM sessions s
              JOIN users u ON u.id = s.user_id AND u.is_test = 0 AND u.role = 'student'
             WHERE s.created_at_ms >= ?`,
      args: [depuisMs],
    }),
  ]);
  const parEtudiant = new Map<string, Set<string>>();
  const ajouter = (uid: string, jour: string) => {
    const jours = parEtudiant.get(uid) ?? new Set<string>();
    jours.add(jour);
    parEtudiant.set(uid, jours);
  };
  for (const lignes of [lecons.rows, lectures.rows, devoirs.rows, tentatives.rows, connexions.rows])
    for (const ligne of lignes) ajouter(String(ligne.uid), jourDe(Number(ligne.at)));
  for (const ligne of questions.rows) ajouter(String(ligne.uid), String(ligne.jour));
  return parEtudiant;
}

/* --------------------------------------------------------------- moteur */

export type ResultatAssiduite = {
  reglages: ReglagesAssiduite;
  /** Distinctions attribuées par cette vérification. */
  distinctions: Array<{ etudiant: string; badge: string; motif: string }>;
  /** Rappels réellement déposés dans la cloche. */
  rappels: Array<{ etudiant: string; titre: string; jour: string }>;
  /** Étudiants dont le rappel n'a pas été déposé : ils ont coupé les notifications. */
  rappelRefuses: number;
  /** Le détail de ce qui a été regardé — pour que l'écran dise la vérité. */
  examines: number;
};

/**
 * UNE PASSE DU MOTEUR. Elle est idempotente : rejouer la vérification ne double
 * ni les distinctions (la base l'interdit, `UNIQUE (user_id, badge_id)`) ni les
 * rappels (le cycle déjà servi ne repart pas).
 *
 * Elle s'exécute à la demande — le propriétaire appuie sur « Vérifier le
 * cycle » — ou au fil des visites du campus. Rien ne tourne en tâche de fond
 * payante, conformément à la règle « nous protégeons les quotas ».
 */
export async function verifierAssiduite(db: Db, maintenant = Date.now()): Promise<ResultatAssiduite> {
  const reglages = await lireReglagesAssiduite(db);
  const fenetre = Math.max(reglages.periodDays, reglages.absenceDays * 12) * JOUR_MS;
  const debut = maintenant - fenetre;

  const etudiants = await db.execute(
    `SELECT id, display_name, last_login_at_ms FROM users
      WHERE role = 'student' AND is_test = 0 AND status = 'active' ORDER BY display_name COLLATE NOCASE`
  );
  const traces = await lignesTraces(db, debut);

  const aujourdHui = jourDe(maintenant);
  const distinctions: ResultatAssiduite['distinctions'] = [];
  const rappels: ResultatAssiduite['rappels'] = [];
  let rappelRefuses = 0;

  // Les rappels déjà déposés, par étudiant, avec leur date — sert à ne jamais
  // répéter le même cycle.
  const dejaServis = await db.execute({
    sql: `SELECT n.user_id AS uid, n.kind AS kind, n.created_at_ms AS at
            FROM notifications n
            JOIN users u ON u.id = n.user_id AND u.is_test = 0
           WHERE n.kind IN ('rappel', 'retour') AND n.created_at_ms >= ?`,
    args: [debut],
  });
  const rappelsParEtudiant = new Map<string, number[]>();
  for (const ligne of dejaServis.rows) {
    if (String(ligne.kind) !== 'rappel') continue;
    const liste = rappelsParEtudiant.get(String(ligne.uid)) ?? [];
    liste.push(Number(ligne.at));
    rappelsParEtudiant.set(String(ligne.uid), liste);
  }

  for (const ligne of etudiants.rows) {
    const uid = String(ligne.id);
    const nom = String(ligne.display_name ?? '');
    const jours = [...(traces.get(uid) ?? new Set<string>())].sort();
    const dernierJour = jours.length ? jours[jours.length - 1] : null;
    const joursDansLaFenetre = jours.filter(
      (jour) => Date.parse(`${jour}T00:00:00.000Z`) >= maintenant - reglages.periodDays * JOUR_MS
    );

    // ── Régularité : assez de jours travaillés dans la fenêtre.
    if (joursDansLaFenetre.length >= reglages.minActiveDays) {
      const pose = await attribuerBadge(
        db,
        { userId: uid, badgeId: 'BADGE_REGULARITE' },
        maintenant
      );
      if (pose)
        distinctions.push({
          etudiant: nom,
          badge: 'Régularité',
          motif: `activité sur ${joursDansLaFenetre.length} jours / ${reglages.periodDays}`,
        });
    }

    // ── Persévérance : une évaluation ratée, puis réussie plus tard.
    const tentatives = await db.execute({
      sql: `SELECT a.passed AS passed, a.at_ms AS at FROM assessment_attempts a WHERE a.user_id = ? ORDER BY a.at_ms`,
      args: [uid],
    });
    const premierEchec = tentatives.rows.find((t) => Number(t.passed) === 0);
    if (premierEchec) {
      const reussieApres = tentatives.rows.find(
        (t) => Number(t.passed) === 1 && Number(t.at) > Number(premierEchec.at)
      );
      if (reussieApres) {
        const pose = await attribuerBadge(db, { userId: uid, badgeId: 'BADGE_PERSEVERANCE' }, maintenant);
        if (pose) distinctions.push({ etudiant: nom, badge: 'Persévérance', motif: 'difficulté rencontrée, puis réussite' });
      }
    }

    // ── Retour en Force : revenir après une vraie pause, et avancer ensuite.
    let retourApresPause = false;
    for (let index = 1; index < jours.length; index += 1) {
      const precedent = Date.parse(`${jours[index - 1]}T00:00:00.000Z`);
      const courant = Date.parse(`${jours[index]}T00:00:00.000Z`);
      if (courant - precedent >= reglages.absenceDays * JOUR_MS) retourApresPause = true;
    }
    if (retourApresPause && dernierJour === aujourdHui) {
      const pose = await attribuerBadge(db, { userId: uid, badgeId: 'BADGE_RETOUR_EN_FORCE' }, maintenant);
      if (pose) distinctions.push({ etudiant: nom, badge: 'Retour en Force', motif: 'retour après une pause, puis progrès' });
    }

    // ── Rappel chaleureux, par cycle — jamais deux fois le même.
    if (!dernierJour) continue;
    const joursDabsence = Math.floor((maintenant - Date.parse(`${dernierJour}T23:59:59.000Z`)) / JOUR_MS);
    if (joursDabsence < reglages.absenceDays) continue;
    const cycle = Math.floor(joursDabsence / reglages.absenceDays);
    const servis = rappelsParEtudiant.get(uid) ?? [];
    if (servis.length >= cycle) continue;
    const message = RAPPELS[(cycle - 1) % RAPPELS.length];
    // On ne dit jamais qu'un rappel est parti s'il ne l'est pas : celui qui a
    // coupé les notifications est compté à part, sans être relancé.
    if (!(await notificationsAcceptees(db, uid, 'rappel'))) {
      rappelRefuses += 1;
      continue;
    }
    await notifier(db, { userId: uid, kind: 'rappel', titre: message.title, corps: message.body }, maintenant);
    rappels.push({ etudiant: nom, titre: message.title, jour: dernierJour });
  }

  return { reglages, distinctions, rappels, rappelRefuses, examines: etudiants.rows.length };
}
