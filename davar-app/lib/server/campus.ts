/**
 * Lecture du campus étudiant — SERVEUR UNIQUEMENT.
 * Toutes les fonctions prennent un client Db ouvert par l'appelant, ce qui
 * permet de les tester sur SQLite local et de les réutiliser sous Workers.
 * Aucune requête ne renvoie une formation sans inscription vérifiée.
 */
import type { Db } from './auth-core';

export type EnrolledTraining = {
  id: string;
  title: string;
  description: string | null;
  lessonCount: number;
  completedCount: number;
  evaluationCount: number;
  evaluationsReussies: number;
};

export type Lesson = {
  id: string;
  position: number;
  title: string;
  kind: 'video' | 'text' | 'exercise' | 'live';
  resourceUrl: string | null;
  durationMin: number | null;
  completed: boolean;
};

export type Module = { id: string; position: number; title: string; summary: string | null; lessons: Lesson[] };

export type TrainingDetail = {
  id: string;
  title: string;
  description: string | null;
  modules: Module[];
  lessonCount: number;
  completedCount: number;
  evaluationCount: number;
  evaluationsReussies: number;
};

/**
 * LA PROGRESSION, TELLE QUE LE PROPRIÉTAIRE LA VEUT — « 100 % doit vraiment
 * dire formation terminée ». On compte donc les leçons vues ET les évaluations
 * réussies, parce qu'une formation dont l'évaluation reste en échec n'est pas
 * terminée, même avec toutes ses leçons cochées.
 *
 * L'exercice n'entre dans aucun des deux comptes : il ne bloque jamais la
 * progression, et il n'est jamais compté réussi gratuitement (décision du
 * propriétaire contre le raccourci du prototype).
 *
 * `terminee` se lit sur les nombres, jamais sur l'arrondi : 99,5 % affiché
 * 100 % ne doit pas ouvrir la demande de certificat.
 */
export function progressionFormation(formation: {
  lessonCount: number;
  completedCount: number;
  evaluationCount: number;
  evaluationsReussies: number;
}): { pct: number; terminee: boolean; faits: number; total: number } {
  const total = formation.lessonCount + formation.evaluationCount;
  const faits = formation.completedCount + formation.evaluationsReussies;
  const pct = total === 0 ? 0 : Math.round((faits / total) * 100);
  return { pct, terminee: total > 0 && faits >= total, faits, total };
}

/**
 * Les évaluations d'une formation : combien, et combien l'étudiant en a
 * réussies. Une évaluation est réussie quand une tentative est passée (le score
 * minimum est celui de l'évaluation, 80 % par défaut) ET, quand elle exige une
 * validation humaine, qu'un devoir a été accepté par le coach principal.
 */
async function compterEvaluations(db: Db, trainingId: string, userId: string | null) {
  const lignes = await db.execute({
    sql: `SELECT COUNT(*) AS total,
                 SUM(CASE WHEN EXISTS (SELECT 1 FROM assessment_attempts att
                                       WHERE att.assessment_id = a.id AND att.user_id = ? AND att.passed = 1)
                           AND (a.requires_review = 0
                                OR EXISTS (SELECT 1 FROM submissions s
                                           WHERE s.assessment_id = a.id AND s.user_id = ? AND s.status = 'approved'))
                          THEN 1 ELSE 0 END) AS reussies
          FROM lesson_assessments a
          JOIN course_lessons l ON l.id = a.lesson_id
          JOIN course_modules m ON m.id = l.module_id
          WHERE m.training_id = ?`,
    args: [userId ?? '', userId ?? '', trainingId],
  });
  return {
    evaluationCount: num(lignes.rows[0]?.total),
    evaluationsReussies: num(lignes.rows[0]?.reussies),
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function num(value: unknown): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export async function listUserTrainings(db: Db, userId: string): Promise<EnrolledTraining[]> {
  const result = await db.execute({
    sql: `SELECT t.id, t.title, t.description,
                 (SELECT COUNT(*) FROM course_modules m JOIN course_lessons l ON l.module_id = m.id
                   WHERE m.training_id = t.id) AS lesson_count,
                 (SELECT COUNT(*) FROM lesson_completions c
                   JOIN course_lessons l ON l.id = c.lesson_id
                   JOIN course_modules m ON m.id = l.module_id
                   WHERE m.training_id = t.id AND c.user_id = e.user_id) AS completed_count,
                 (SELECT COUNT(*) FROM lesson_assessments a
                   JOIN course_lessons l ON l.id = a.lesson_id
                   JOIN course_modules m ON m.id = l.module_id
                   WHERE m.training_id = t.id) AS evaluation_count,
                 (SELECT COUNT(*) FROM lesson_assessments a
                   JOIN course_lessons l ON l.id = a.lesson_id
                   JOIN course_modules m ON m.id = l.module_id
                   WHERE m.training_id = t.id
                     AND EXISTS (SELECT 1 FROM assessment_attempts att
                                 WHERE att.assessment_id = a.id AND att.user_id = e.user_id AND att.passed = 1)
                     AND (a.requires_review = 0
                          OR EXISTS (SELECT 1 FROM submissions s
                                     WHERE s.assessment_id = a.id AND s.user_id = e.user_id AND s.status = 'approved'))
                 ) AS evaluations_reussies
          FROM enrollments e JOIN trainings t ON t.id = e.training_id
          WHERE e.user_id = ?
          ORDER BY e.acquired_at_ms DESC`,
    args: [userId],
  });
  return result.rows.map((row) => {
    const id = text(row.id);
    const title = text(row.title);
    if (!id || !title) throw new Error('Formation Turso invalide');
    return {
      id,
      title,
      description: text(row.description),
      lessonCount: num(row.lesson_count),
      completedCount: num(row.completed_count),
      evaluationCount: num(row.evaluation_count),
      evaluationsReussies: num(row.evaluations_reussies),
    };
  });
}

/** Détail d'une formation ; null si l'utilisateur n'y a pas de droit vérifié. */
export async function getTrainingForUser(db: Db, userId: string, trainingId: string): Promise<TrainingDetail | null> {
  const enrolled = await db.execute({
    sql: 'SELECT 1 AS ok FROM enrollments WHERE user_id = ? AND training_id = ?',
    args: [userId, trainingId],
  });
  if (enrolled.rows.length === 0) return null;
  return lireContenuFormation(db, trainingId, userId);
}

/**
 * Lecture du contenu d'une formation, sans contrôle d'inscription : réservée à deux
 * usages internes — `getTrainingForUser` (après vérification du droit) et l'aperçu
 * d'une vue test. `userId` à null signifie « aucune progression » : la jointure ne
 * rencontre alors aucune ligne, tout est à zéro, et rien n'est écrit.
 */
async function lireContenuFormation(
  db: Db,
  trainingId: string,
  userId: string | null
): Promise<TrainingDetail | null> {
  const trainingRow = await db.execute({
    sql: 'SELECT id, title, description FROM trainings WHERE id = ?',
    args: [trainingId],
  });
  const training = trainingRow.rows[0];
  const title = text(training?.title);
  if (!title) return null;

  const rows = await db.execute({
    sql: `SELECT m.id AS module_id, m.position AS module_position, m.title AS module_title, m.summary,
                 l.id AS lesson_id, l.position AS lesson_position, l.title AS lesson_title,
                 l.kind, l.resource_url, l.duration_min,
                 CASE WHEN c.lesson_id IS NULL THEN 0 ELSE 1 END AS completed
          FROM course_modules m
          LEFT JOIN course_lessons l ON l.module_id = m.id
          LEFT JOIN lesson_completions c ON c.lesson_id = l.id AND c.user_id = ?
          WHERE m.training_id = ?
          ORDER BY m.position, l.position`,
    args: [userId ?? '', trainingId],
  });

  const modules: Module[] = [];
  const byId = new Map<string, Module>();
  let lessonCount = 0;
  let completedCount = 0;
  for (const row of rows.rows) {
    const moduleId = text(row.module_id);
    if (!moduleId) continue;
    let module = byId.get(moduleId);
    if (!module) {
      module = {
        id: moduleId,
        position: num(row.module_position),
        title: text(row.module_title) ?? 'Module',
        summary: text(row.summary),
        lessons: [],
      };
      byId.set(moduleId, module);
      modules.push(module);
    }
    const lessonId = text(row.lesson_id);
    if (!lessonId) continue;
    const kind = text(row.kind) ?? 'video';
    const lesson: Lesson = {
      id: lessonId,
      position: num(row.lesson_position),
      title: text(row.lesson_title) ?? 'Leçon',
      kind: ['video', 'text', 'exercise', 'live'].includes(kind) ? (kind as Lesson['kind']) : 'video',
      resourceUrl: text(row.resource_url),
      durationMin: row.duration_min === null || row.duration_min === undefined ? null : num(row.duration_min),
      completed: num(row.completed) === 1,
    };
    module.lessons.push(lesson);
    lessonCount += 1;
    if (lesson.completed) completedCount += 1;
  }

  const evaluations = await compterEvaluations(db, trainingId, userId);
  return {
    id: trainingId,
    title,
    description: text(training?.description),
    modules,
    lessonCount,
    completedCount,
    ...evaluations,
  };
}

/**
 * Marque/démarque une leçon terminée. Refuse toute leçon hors des formations
 * auxquelles l'utilisateur a un droit vérifié.
 */
export async function setLessonCompletion(
  db: Db,
  userId: string,
  lessonId: string,
  completed: boolean,
  now = Date.now()
): Promise<boolean> {
  if (typeof lessonId !== 'string' || lessonId.length < 3 || lessonId.length > 120) return false;
  const allowed = await db.execute({
    sql: `SELECT 1 AS ok FROM course_lessons l
          JOIN course_modules m ON m.id = l.module_id
          JOIN enrollments e ON e.training_id = m.training_id AND e.user_id = ?
          WHERE l.id = ?`,
    args: [userId, lessonId],
  });
  if (allowed.rows.length === 0) return false;
  if (completed) {
    await db.execute({
      sql: `INSERT INTO lesson_completions(user_id, lesson_id, completed_at_ms) VALUES (?, ?, ?)
            ON CONFLICT(user_id, lesson_id) DO NOTHING`,
      args: [userId, lessonId, now],
    });
  } else {
    await db.execute({ sql: 'DELETE FROM lesson_completions WHERE user_id = ? AND lesson_id = ?', args: [userId, lessonId] });
  }
  return true;
}

/* ---------------------------------------------------------------- vue test */

/**
 * APERÇU D'UNE VUE TEST.
 *
 * Un compte de test n'est inscrit à rien — et ne doit jamais rien écrire dans le vrai.
 * Mais la vue test doit montrer le contenu RÉEL du propriétaire : ses formations, ses
 * modules, ses leçons, ses vidéos, ses exercices. On lit donc le catalogue tel qu'il est,
 * avec une progression à zéro. Aucune écriture n'est possible par ce chemin.
 */
export async function listTrainingsApercu(db: Db): Promise<EnrolledTraining[]> {
  const result = await db.execute(
    `SELECT t.id, t.title, t.description,
            (SELECT COUNT(*) FROM course_modules m JOIN course_lessons l ON l.module_id = m.id
              WHERE m.training_id = t.id) AS lesson_count
     FROM trainings t
     WHERE t.published = 1
     ORDER BY t.title`
  );
  const liste: EnrolledTraining[] = [];
  for (const row of result.rows) {
    const id = text(row.id);
    const title = text(row.title);
    if (!id || !title) continue;
    liste.push({
      id,
      title,
      description: text(row.description),
      lessonCount: num(row.lesson_count),
      completedCount: 0,
      evaluationCount: 0,
      evaluationsReussies: 0,
    });
  }
  return liste;
}

/** Contenu complet d'une formation, en lecture seule, pour une vue test. */
export async function getTrainingApercu(db: Db, trainingId: string): Promise<TrainingDetail | null> {
  return lireContenuFormation(db, trainingId, null);
}

export type FormationADecouvrir = { id: string; title: string; description: string | null; prixCfa: number; lienAchat: string | null };

/** Le lien de checkout Chariow d'une formation : le lien enregistré, sinon celui du produit. */
export function lienAchatChariow(buyUrl: string | null, chariowProductId: string | null): string | null {
  const enregistre = (buyUrl ?? '').trim();
  if (/^https:\/\//i.test(enregistre)) return enregistre;
  const produit = (chariowProductId ?? '').trim();
  if (/^prd_[A-Za-z0-9]+$/.test(produit)) return `https://d-ueo.mychariow.co/${produit}/checkout`;
  return null;
}

/**
 * « DÉCOUVRIR PLUS DE FORMATIONS » — les formations ouvertes que l'étudiant ne
 * possède pas encore. Le prix n'apparaît QUE pour celles-là (décision du
 * propriétaire) : ce qu'il a déjà acheté n'a plus de prix à ses yeux.
 */
export async function listFormationsADecouvrir(db: Db, userId: string): Promise<FormationADecouvrir[]> {
  const resultat = await db.execute({
    sql: `SELECT id, title, description, price_cfa, chariow_product_id, buy_url FROM trainings
          WHERE published = 1
            AND id NOT IN (SELECT training_id FROM enrollments WHERE user_id = ?)
          ORDER BY title`,
    args: [userId],
  });
  const liste: FormationADecouvrir[] = [];
  for (const row of resultat.rows) {
    const id = text(row.id);
    const title = text(row.title);
    if (!id || !title) continue;
    liste.push({
      id,
      title,
      description: text(row.description),
      prixCfa: num(row.price_cfa),
      lienAchat: lienAchatChariow(text(row.buy_url), text(row.chariow_product_id)),
    });
  }
  return liste;
}

/* ------------------------------------------------------------------ catalogue */

export type FormationCatalogue = {
  id: string;
  title: string;
  description: string | null;
  prixCfa: number;
  lecons: number;
  /** Chapitres = modules : la carte du prototype compte des chapitres. */
  chapitres: number;
  /** Référence, durée et note de la carte. Vides tant qu'elles ne sont pas renseignées. */
  code: string | null;
  hours: number;
  rating: number | null;
};

export type Catalogue = { aDecouvrir: FormationCatalogue[]; possedees: FormationCatalogue[] };

/**
 * CATALOGUE — les formations publiées, partagées en deux : celles que l'étudiant
 * ne possède pas encore, et celles qu'il possède. Rien d'autre n'est montré :
 * une formation non publiée n'existe pas pour lui.
 */
export async function lireCatalogue(db: Db, userId: string | null): Promise<Catalogue> {
  const resultat = await db.execute({
    sql: `SELECT t.id, t.title, t.description, t.price_cfa, t.code, t.hours, t.rating,
                 (SELECT COUNT(*) FROM course_modules m JOIN course_lessons l ON l.module_id = m.id
                   WHERE m.training_id = t.id) AS lecons,
                 (SELECT COUNT(*) FROM course_modules m WHERE m.training_id = t.id) AS chapitres,
                 CASE WHEN ? IS NULL THEN 0 ELSE
                   EXISTS(SELECT 1 FROM enrollments e
                           WHERE e.training_id = t.id AND e.user_id = ?) END AS possedee
          FROM trainings t
          WHERE t.published = 1
          ORDER BY t.title`,
    args: [userId, userId],
  });

  const aDecouvrir: FormationCatalogue[] = [];
  const possedees: FormationCatalogue[] = [];
  for (const row of resultat.rows) {
    const id = text(row.id);
    const title = text(row.title);
    if (!id || !title) continue;
    const formation: FormationCatalogue = {
      id,
      title,
      description: text(row.description),
      prixCfa: num(row.price_cfa),
      lecons: num(row.lecons),
      chapitres: num(row.chapitres),
      code: text(row.code),
      hours: num(row.hours),
      rating: typeof row.rating === 'number' || typeof row.rating === 'bigint' ? Number(row.rating) : null,
    };
    (num(row.possedee) === 1 ? possedees : aDecouvrir).push(formation);
  }
  return { aDecouvrir, possedees };
}

/** Une formation publiée, pour la page de commande. */
export async function lireFormationPubliee(
  db: Db,
  trainingId: string
): Promise<FormationCatalogue | null> {
  const resultat = await db.execute({
    sql: `SELECT t.id, t.title, t.description, t.price_cfa, t.code, t.hours, t.rating,
                 (SELECT COUNT(*) FROM course_modules m JOIN course_lessons l ON l.module_id = m.id
                   WHERE m.training_id = t.id) AS lecons,
                 (SELECT COUNT(*) FROM course_modules m WHERE m.training_id = t.id) AS chapitres
          FROM trainings t WHERE t.id = ? AND t.published = 1`,
    args: [trainingId],
  });
  const row = resultat.rows[0];
  const id = text(row?.id);
  const title = text(row?.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    description: text(row?.description),
    prixCfa: num(row?.price_cfa),
    lecons: num(row?.lecons),
    chapitres: num(row?.chapitres),
    code: text(row?.code),
    hours: num(row?.hours),
    rating:
      typeof row?.rating === 'number' || typeof row?.rating === 'bigint' ? Number(row?.rating) : null,
  };
}

/**
 * Vrai quand l'étudiant a vu toutes les leçons ET réussi toutes les évaluations.
 * C'est la condition d'une demande de certificat : à 99 %, la demande est
 * refusée, et le refus dit pourquoi.
 */
export async function formationTerminee(db: Db, userId: string, trainingId: string): Promise<boolean> {
  const [lecons, evaluations] = await Promise.all([
    db.execute({
      sql: `SELECT (SELECT COUNT(*) FROM course_modules m JOIN course_lessons l ON l.module_id = m.id
                     WHERE m.training_id = ?) AS total,
                   (SELECT COUNT(*) FROM lesson_completions c
                     JOIN course_lessons l ON l.id = c.lesson_id
                     JOIN course_modules m ON m.id = l.module_id
                     WHERE m.training_id = ? AND c.user_id = ?) AS faites`,
      args: [trainingId, trainingId, userId],
    }),
    compterEvaluations(db, trainingId, userId),
  ]);
  const total = num(lecons.rows[0]?.total) + evaluations.evaluationCount;
  const faites = num(lecons.rows[0]?.faites) + evaluations.evaluationsReussies;
  return total > 0 && faites >= total;
}
