/**
 * ANALYTICS — ce que le campus produit vraiment, chiffre par chiffre.
 *
 * Le prototype ouvrait l'espace d'analyse par quatre compteurs (modules
 * visionnés, progression moyenne, réussite aux exercices, réussite aux
 * évaluations), un graphique d'activité sur quatorze jours et la progression
 * moyenne par formation. C'est exactement ce que calcule ce fichier — sur les
 * données réelles, et sans jamais estimer :
 *
 *   - les comptes de test n'entrent dans aucun chiffre ;
 *   - la progression d'un étudiant est le rapport « leçons terminées / leçons
 *     de la formation », formation par formation, puis moyenne ;
 *   - un exercice ne laisse AUCUNE note : il ne bloque jamais la progression
 *     (décision du propriétaire). L'écran le dit au lieu d'inventer un taux ;
 *   - l'activité est la somme de gestes réels, jamais d'un compteur décoratif.
 */
import type { Db } from './auth-core.ts';
import { jourDe } from './assistant.ts';

const JOUR_MS = 24 * 60 * 60 * 1000;
/** L'écran regarde quatorze jours, comme le prototype. */
export const JOURS_ACTIVITE = 14;

function entier(valeur: unknown): number {
  const nombre = typeof valeur === 'bigint' ? Number(valeur) : Number(valeur ?? 0);
  return Number.isFinite(nombre) ? Math.trunc(nombre) : 0;
}

/** Moyenne arrondie, ou null quand il n'y a rien à moyenner. */
function moyenne(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  return Math.round(valeurs.reduce((total, valeur) => total + valeur, 0) / valeurs.length);
}

export type FormationPilotee = {
  id: string;
  titre: string;
  lecons: number;
  etudiants: number;
  /** Progression moyenne des étudiants inscrits, en pourcentage. */
  moyennePct: number | null;
};

export type EvaluationPilotee = {
  tentatives: number;
  reussies: number;
  /** Taux de réussite en pourcentage, ou null si aucune évaluation passée. */
  taux: number | null;
  /** Score moyen des tentatives, en pourcentage. */
  scoreMoyenPct: number | null;
};

export type AnalysePilotage = {
  leconsTerminees: number;
  lectures: number;
  progressionMoyennePct: number | null;
  etudiantsSuivis: number;
  evaluation: EvaluationPilotee;
  /** Les quatorze derniers jours, du plus ancien au plus récent. */
  parJour: Array<{ jour: string; actions: number }>;
  actionsAujourdHui: number;
  /** Ce qui compose une « action » — affiché tel quel sur l'écran. */
  sourcesActivite: string;
  parFormation: FormationPilotee[];
};

export async function analysePilotage(db: Db, maintenant = Date.now()): Promise<AnalysePilotage> {
  const debut = maintenant - JOURS_ACTIVITE * JOUR_MS;
  const premierJour = jourDe(debut);

  const [compteurs, etudiants, parInscription, formations, evaluations, lecons, lectures, devoirs, certificats, connexions, questions] =
    await Promise.all([
      db.execute(
        `SELECT
           (SELECT COUNT(*) FROM lesson_completions lc
              JOIN users u ON u.id = lc.user_id AND u.is_test = 0 AND u.role = 'student') AS lecons,
           (SELECT COUNT(*) FROM media_progress mp
              JOIN users u ON u.id = mp.user_id AND u.is_test = 0 AND u.role = 'student') AS lectures`
      ),
      db.execute(`SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND is_test = 0`),
      // Le détail « étudiant × formation » : c'est la seule base honnête de la
      // progression — chaque formation a son propre nombre de leçons.
      db.execute(
        `SELECT e.user_id AS uid, e.training_id AS tid,
                (SELECT COUNT(*) FROM course_modules m
                   JOIN course_lessons l ON l.module_id = m.id
                  WHERE m.training_id = e.training_id) AS total,
                (SELECT COUNT(*) FROM lesson_completions lc
                   JOIN course_lessons l ON l.id = lc.lesson_id
                   JOIN course_modules m ON m.id = l.module_id
                  WHERE lc.user_id = e.user_id AND m.training_id = e.training_id) AS faites
           FROM enrollments e
           JOIN users u ON u.id = e.user_id AND u.is_test = 0 AND u.role = 'student'`
      ),
      db.execute(
        `SELECT t.id, t.title,
                (SELECT COUNT(*) FROM course_modules m
                   JOIN course_lessons l ON l.module_id = m.id
                  WHERE m.training_id = t.id) AS lecons,
                (SELECT COUNT(*) FROM enrollments e
                   JOIN users u ON u.id = e.user_id AND u.is_test = 0 AND u.role = 'student'
                  WHERE e.training_id = t.id) AS etudiants
           FROM trainings t WHERE t.published = 1 ORDER BY t.title`
      ),
      db.execute(
        `SELECT COUNT(*) AS n, COALESCE(SUM(a.passed), 0) AS ok, COALESCE(AVG(a.pct), 0) AS moyenne
           FROM assessment_attempts a
           JOIN users u ON u.id = a.user_id AND u.is_test = 0 AND u.role = 'student'`
      ),
      // Les gestes des quatorze derniers jours, source par source.
      db.execute({
        sql: `SELECT lc.completed_at_ms AS at FROM lesson_completions lc
                JOIN users u ON u.id = lc.user_id AND u.is_test = 0 AND u.role = 'student'
               WHERE lc.completed_at_ms >= ?`,
        args: [debut],
      }),
      db.execute({
        sql: `SELECT mp.at_ms AS at FROM media_progress mp
                JOIN users u ON u.id = mp.user_id AND u.is_test = 0 AND u.role = 'student'
               WHERE mp.at_ms >= ?`,
        args: [debut],
      }),
      db.execute({
        sql: `SELECT s.at_ms AS at FROM submissions s
                JOIN users u ON u.id = s.user_id AND u.is_test = 0 AND u.role = 'student'
               WHERE s.at_ms >= ?`,
        args: [debut],
      }),
      db.execute({
        sql: `SELECT c.issued_at_ms AS at FROM certificates c
                JOIN users u ON u.id = c.user_id AND u.is_test = 0 AND u.role = 'student'
               WHERE c.issued_at_ms >= ?`,
        args: [debut],
      }),
      db.execute({
        sql: `SELECT s.created_at_ms AS at FROM sessions s
                JOIN users u ON u.id = s.user_id AND u.is_test = 0 AND u.role = 'student'
               WHERE s.created_at_ms >= ?`,
        args: [debut],
      }),
      db.execute({
        sql: `SELECT ad.day AS jour, ad.requests AS requetes FROM assistant_user_days ad
                JOIN users u ON u.id = ad.user_id AND u.is_test = 0 AND u.role = 'student'
               WHERE ad.day >= ?`,
        args: [premierJour],
      }),
    ]);

  const leconsTerminees = entier(compteurs.rows[0]?.lecons);
  const nbLectures = entier(compteurs.rows[0]?.lectures);
  const etudiantsSuivis = entier(etudiants.rows[0]?.n);

  // Progression : moyenne des formations suivies par chaque étudiant, puis
  // moyenne des étudiants. Un étudiant sans formation compte pour zéro — c'est
  // la règle du prototype, et elle ne flatte personne.
  const parEtudiant = new Map<string, number[]>();
  const parFormation = new Map<string, number[]>();
  for (const ligne of parInscription.rows) {
    const total = entier(ligne.total);
    if (total <= 0) continue;
    const pct = Math.min(100, Math.round((entier(ligne.faites) / total) * 100));
    const uid = String(ligne.uid);
    const tid = String(ligne.tid);
    parEtudiant.set(uid, [...(parEtudiant.get(uid) ?? []), pct]);
    parFormation.set(tid, [...(parFormation.get(tid) ?? []), pct]);
  }
  const tousLesPct = [...parEtudiant.values()].map((liste) => moyenne(liste) ?? 0);
  const progressionMoyennePct =
    etudiantsSuivis === 0 ? null : Math.round(tousLesPct.reduce((a, b) => a + b, 0) / etudiantsSuivis);

  const lignesFormations: FormationPilotee[] = formations.rows.map((ligne) => {
    const id = String(ligne.id);
    return {
      id,
      titre: String(ligne.title),
      lecons: entier(ligne.lecons),
      etudiants: entier(ligne.etudiants),
      moyennePct: moyenne(parFormation.get(id) ?? []),
    };
  });

  const tentatives = entier(evaluations.rows[0]?.n);
  const reussies = entier(evaluations.rows[0]?.ok);

  // Activité : on range chaque geste dans son jour.
  const compteurJour = new Map<string, number>();
  for (const lignes of [lecons.rows, lectures.rows, devoirs.rows, certificats.rows, connexions.rows]) {
    for (const ligne of lignes) {
      const jour = jourDe(entier(ligne.at));
      compteurJour.set(jour, (compteurJour.get(jour) ?? 0) + 1);
    }
  }
  for (const ligne of questions.rows) {
    const jour = String(ligne.jour);
    compteurJour.set(jour, (compteurJour.get(jour) ?? 0) + entier(ligne.requetes));
  }
  const parJour = Array.from({ length: JOURS_ACTIVITE }, (_, index) => {
    const jour = jourDe(maintenant - (JOURS_ACTIVITE - 1 - index) * JOUR_MS);
    return { jour, actions: compteurJour.get(jour) ?? 0 };
  });

  return {
    leconsTerminees,
    lectures: nbLectures,
    progressionMoyennePct,
    etudiantsSuivis,
    evaluation: {
      tentatives,
      reussies,
      taux: tentatives ? Math.round((reussies / tentatives) * 100) : null,
      scoreMoyenPct: tentatives ? entier(evaluations.rows[0]?.moyenne) : null,
    },
    parJour,
    actionsAujourdHui: parJour[parJour.length - 1]?.actions ?? 0,
    sourcesActivite:
      'leçons terminées, livres et audios consultés, devoirs rendus, certificats reçus, questions à l’assistant et connexions',
    parFormation: lignesFormations,
  };
}
