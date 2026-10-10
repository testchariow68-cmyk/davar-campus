/**
 * CŒUR PÉDAGOGIQUE — exercices, évaluations, devoirs rendus.
 *
 * Les règles viennent des documents du propriétaire, et elles sont précises :
 *   - l'EXERCICE apparaît au bon moment mais NE CONDITIONNE JAMAIS la progression ;
 *   - l'ÉVALUATION bloque : score minimum (80 % par défaut), et validation humaine ;
 *   - les tentatives sont conservées, jamais effacées : « la progression d'un
 *     étudiant ne se supprime jamais en silence » ;
 *   - une nouvelle tentative peut être autorisée par la direction, avec une
 *     explication obligatoire.
 *
 * Aucune dépendance à Next : ces règles sont testables en Node.
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

function identifiant(prefixe: string, maintenant: number): string {
  return `${prefixe}_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export type Question = {
  id: string;
  position: number;
  question: string;
  options: string[];
  answerIndex: number;
  explain: string | null;
};

export type Exercice = { id: string; title: string; intro: string | null; questions: Question[] };
export type Evaluation = {
  id: string;
  title: string;
  intro: string | null;
  minScore: number;
  requiresReview: boolean;
  questions: Question[];
  /** La meilleure tentative de l'étudiant, et l'état de son dernier devoir. */
  meilleurPct: number | null;
  reussie: boolean;
  tentativeCount: number;
  devoir: { statut: string; motif: string | null; renduLeMs: number } | null;
};

function optionsDe(valeur: unknown): string[] {
  if (typeof valeur !== 'string') return [];
  try {
    const parsees = JSON.parse(valeur);
    return Array.isArray(parsees) ? parsees.filter((option) => typeof option === 'string') : [];
  } catch {
    return [];
  }
}

async function questionsDe(db: Db, parentKind: 'exercise' | 'assessment', parentId: string): Promise<Question[]> {
  const lignes = await db.execute({
    sql: 'SELECT id, position, question, options, answer_index, explain FROM quiz_questions WHERE parent_kind = ? AND parent_id = ? ORDER BY position',
    args: [parentKind, parentId],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    position: entier(row.position),
    question: texte(row.question),
    options: optionsDe(row.options),
    answerIndex: entier(row.answer_index),
    explain: typeof row.explain === 'string' && row.explain.length > 0 ? row.explain : null,
  }));
}

/** Les exercices et l'évaluation d'une leçon. Un étudiant non inscrit n'obtient rien. */
export async function pedagogieDeLecon(
  db: Db,
  userId: string,
  lessonId: string
): Promise<{ exercice: Exercice | null; evaluation: Evaluation | null } | null> {
  const droit = await db.execute({
    sql: `SELECT 1 AS ok FROM course_lessons l
          JOIN course_modules m ON m.id = l.module_id
          JOIN enrollments e ON e.training_id = m.training_id AND e.user_id = ?
          WHERE l.id = ?`,
    args: [userId, lessonId],
  });
  if (droit.rows.length === 0) return null;

  const exLigne = await db.execute({
    sql: 'SELECT id, title, intro FROM lesson_exercises WHERE lesson_id = ? ORDER BY created_at_ms LIMIT 1',
    args: [lessonId],
  });
  let exercice: Exercice | null = null;
  if (exLigne.rows[0]) {
    const id = texte(exLigne.rows[0].id);
    exercice = {
      id,
      title: texte(exLigne.rows[0].title, 'Exercice'),
      intro: texte(exLigne.rows[0].intro) || null,
      questions: await questionsDe(db, 'exercise', id),
    };
  }

  const evLigne = await db.execute({
    sql: 'SELECT id, title, intro, min_score, requires_review FROM lesson_assessments WHERE lesson_id = ? ORDER BY created_at_ms LIMIT 1',
    args: [lessonId],
  });
  let evaluation: Evaluation | null = null;
  if (evLigne.rows[0]) {
    const id = texte(evLigne.rows[0].id);
    const meilleure = await db.execute({
      sql: 'SELECT MAX(pct) AS pct, COUNT(*) AS n FROM assessment_attempts WHERE user_id = ? AND assessment_id = ?',
      args: [userId, id],
    });
    const devoir = await db.execute({
      sql: 'SELECT status, feedback, at_ms FROM submissions WHERE user_id = ? AND assessment_id = ? ORDER BY at_ms DESC LIMIT 1',
      args: [userId, id],
    });
    const pct = meilleure.rows[0]?.pct;
    evaluation = {
      id,
      title: texte(evLigne.rows[0].title, 'Évaluation'),
      intro: texte(evLigne.rows[0].intro) || null,
      minScore: entier(evLigne.rows[0].min_score, 80),
      requiresReview: entier(evLigne.rows[0].requires_review, 1) === 1,
      questions: await questionsDe(db, 'assessment', id),
      meilleurPct: pct === null || pct === undefined ? null : entier(pct),
      reussie: pct !== null && pct !== undefined && entier(pct) >= entier(evLigne.rows[0].min_score, 80),
      tentativeCount: entier(meilleure.rows[0]?.n),
      devoir: devoir.rows[0]
        ? {
            statut: texte(devoir.rows[0].status, 'pending'),
            motif: texte(devoir.rows[0].feedback) || null,
            renduLeMs: entier(devoir.rows[0].at_ms),
          }
        : null,
    };
  }
  return { exercice, evaluation };
}

/** Corrige une série de réponses. Les corrigés sont rendus à l'étudiant : c'est un entraînement. */
export function corriger(questions: Question[], reponses: Array<{ questionId: string; choiceIndex: number }>): {
  score: number;
  total: number;
  pct: number;
  detail: Array<{ questionId: string; correct: boolean; bonne: number; explication: string | null }>;
} {
  let score = 0;
  const detail = questions.map((question): { questionId: string; correct: boolean; bonne: number; explication: string | null } => {
    const reponse = reponses.find((candidate) => candidate.questionId === question.id);
    const choix = reponse ? reponse.choiceIndex : -1;
    const correct = choix === question.answerIndex;
    if (correct) score += 1;
    return { questionId: question.id, correct, bonne: question.answerIndex, explication: question.explain };
  });
  const total = questions.length;
  const pct = total === 0 ? 0 : Math.round((score / total) * 100);
  return { score, total, pct, detail };
}

export type ResultatReponse =
  | { ok: true; score: number; total: number; pct: number; detail: Array<{ questionId: string; correct: boolean; bonne: number; explication: string | null }> }
  | { ok: false; erreur: string };

/** Répondre à un EXERCICE : entraînement, aucune conséquence sur la progression. */
export async function repondreExercice(
  db: Db,
  userId: string,
  exerciceId: string,
  reponses: Array<{ questionId: string; choiceIndex: number }>,
  maintenant = Date.now()
): Promise<ResultatReponse> {
  const lecture = await pedagogieDeLeconParExercice(db, userId, exerciceId);
  if (!lecture) return { ok: false, erreur: 'exercice_introuvable' };
  const correction = corriger(lecture.questions, reponses);
  for (const ligne of correction.detail) {
    await db.execute({
      sql: 'INSERT INTO quiz_answers(id, user_id, question_id, choice_index, correct, at_ms) VALUES (?,?,?,?,?,?)',
      args: [identifiant('ans', maintenant), userId, ligne.questionId, reponses.find((r) => r.questionId === ligne.questionId)?.choiceIndex ?? -1, ligne.correct ? 1 : 0, maintenant],
    });
  }
  return { ok: true, ...correction };
}

async function pedagogieDeLeconParExercice(db: Db, userId: string, exerciceId: string) {
  const ligne = await db.execute({
    sql: `SELECT e.id, e.lesson_id FROM lesson_exercises e
          JOIN course_lessons l ON l.id = e.lesson_id
          JOIN course_modules m ON m.id = l.module_id
          JOIN enrollments en ON en.training_id = m.training_id AND en.user_id = ?
          WHERE e.id = ?`,
    args: [userId, exerciceId],
  });
  if (!ligne.rows[0]) return null;
  return { questions: await questionsDe(db, 'exercise', exerciceId) };
}

/**
 * Répondre à une ÉVALUATION : bloquante. Chaque tentative est enregistrée — même
 * échouée, même repassée. Un étudiant ne peut donc jamais « effacer » un échec.
 */
export async function repondreEvaluation(
  db: Db,
  userId: string,
  assessmentId: string,
  reponses: Array<{ questionId: string; choiceIndex: number }>,
  maintenant = Date.now()
): Promise<ResultatReponse> {
  const ligne = await db.execute({
    sql: `SELECT a.id, a.min_score FROM lesson_assessments a
          JOIN course_lessons l ON l.id = a.lesson_id
          JOIN course_modules m ON m.id = l.module_id
          JOIN enrollments en ON en.training_id = m.training_id AND en.user_id = ?
          WHERE a.id = ?`,
    args: [userId, assessmentId],
  });
  if (!ligne.rows[0]) return { ok: false, erreur: 'evaluation_introuvable' };
  const minScore = entier(ligne.rows[0].min_score, 80);
  const questions = await questionsDe(db, 'assessment', assessmentId);
  if (questions.length === 0) return { ok: false, erreur: 'evaluation_vide' };

  const correction = corriger(questions, reponses);
  await db.execute({
    sql: 'INSERT INTO assessment_attempts(id, user_id, assessment_id, score, total, pct, passed, at_ms) VALUES (?,?,?,?,?,?,?,?)',
    args: [
      identifiant('att', maintenant),
      userId,
      assessmentId,
      correction.score,
      correction.total,
      correction.pct,
      correction.pct >= minScore ? 1 : 0,
      maintenant,
    ],
  });
  return { ok: true, ...correction };
}

/* ------------------------------------------------------------------ devoirs */

/** Un devoir rendu par un étudiant : un fichier déposé, ou une note écrite. */
export async function rendreDevoir(
  db: Db,
  options: { userId: string; assessmentId: string; fileKey?: string | null; note?: string | null },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string }> {
  const droit = await db.execute({
    sql: `SELECT m.training_id, a.requires_review,
                 (SELECT MAX(pct) FROM assessment_attempts at WHERE at.user_id = ? AND at.assessment_id = a.id) AS meilleur,
                 a.min_score
          FROM lesson_assessments a
          JOIN course_lessons l ON l.id = a.lesson_id
          JOIN course_modules m ON m.id = l.module_id
          JOIN enrollments en ON en.training_id = m.training_id AND en.user_id = ?
          WHERE a.id = ?`,
    args: [options.userId, options.userId, options.assessmentId],
  });
  const ligne = droit.rows[0];
  if (!ligne) return { ok: false, erreur: 'evaluation_introuvable' };

  const meilleur = ligne.meilleur === null || ligne.meilleur === undefined ? null : entier(ligne.meilleur);
  if (meilleur === null || meilleur < entier(ligne.min_score, 80))
    return { ok: false, erreur: 'score_insuffisant' };

  const deja = await db.execute({
    sql: "SELECT 1 AS ok FROM submissions WHERE user_id = ? AND assessment_id = ? AND status IN ('pending','approved')",
    args: [options.userId, options.assessmentId],
  });
  if (deja.rows.length > 0) return { ok: false, erreur: 'deja_rendu' };

  await db.execute({
    sql: `INSERT INTO submissions(id, user_id, assessment_id, training_id, file_key, note, status, at_ms)
          VALUES (?,?,?,?,?,?,'pending',?)`,
    args: [
      identifiant('sub', maintenant),
      options.userId,
      options.assessmentId,
      texte(ligne.training_id),
      options.fileKey ?? null,
      options.note ?? null,
      maintenant,
    ],
  });
  return { ok: true };
}

/** Décision de la direction sur un devoir : valider, refuser, ou autoriser une reprise. */
export async function deciderDevoir(
  db: Db,
  options: { submissionId: string; decision: 'approved' | 'refused'; feedback: string; decideur: string },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string }> {
  const motif = options.feedback.trim();
  // Un refus sans explication serait un mur : l'explication est obligatoire.
  if (options.decision === 'refused' && motif.length < 5) return { ok: false, erreur: 'explication_obligatoire' };
  const resultat = await db.execute({
    sql: `UPDATE submissions SET status = ?, feedback = ?, decided_at_ms = ?, decided_by = ?
          WHERE id = ? AND status = 'pending'`,
    args: [options.decision, motif || null, maintenant, options.decideur, options.submissionId],
  });
  if ((resultat.rowsAffected ?? 0) === 0) return { ok: false, erreur: 'deja_decide' };
  return { ok: true };
}

export async function devoirsEnAttente(db: Db, limite = 60): Promise<
  Array<{ id: string; etudiant: string; courriel: string; formation: string; evaluation: string; note: string | null; fileKey: string | null; atMs: number; statut: string }>
> {
  const lignes = await db.execute({
    sql: `SELECT s.id, s.note, s.file_key, s.at_ms, s.status, u.display_name, u.email_normalized,
                 t.title AS formation, a.title AS evaluation
          FROM submissions s
          JOIN users u ON u.id = s.user_id
          JOIN trainings t ON t.id = s.training_id
          JOIN lesson_assessments a ON a.id = s.assessment_id
          WHERE s.status IN ('pending','refused')
          ORDER BY s.status DESC, s.at_ms LIMIT ?`,
    args: [Math.min(Math.max(limite, 1), 200)],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    etudiant: texte(row.display_name, 'Étudiant'),
    courriel: texte(row.email_normalized),
    formation: texte(row.formation),
    evaluation: texte(row.evaluation),
    note: texte(row.note) || null,
    fileKey: texte(row.file_key) || null,
    atMs: entier(row.at_ms),
    statut: texte(row.status, 'pending'),
  }));
}

/* -------------------------------------------- lecture groupée pour une formation */

export type PedagogieDeModule = {
  moduleId: string;
  exercices: Array<{ leconTitre: string; exercice: Exercice }>;
  evaluations: Array<{ leconTitre: string; evaluation: Evaluation }>;
};

/**
 * Tout l'entraînement d'une formation, en deux requêtes : les exercices et les
 * évaluations de chaque module, avec la progression de l'étudiant. La page de
 * formation n'a plus qu'à afficher — aucun contrôle de droit n'est refait ici,
 * il a déjà été fait à l'entrée.
 */
export async function pedagogieDeFormation(db: Db, userId: string, formationId: string): Promise<PedagogieDeModule[]> {
  const structure = await db.execute({
    sql: `SELECT m.id AS module_id, l.id AS lesson_id, l.title AS lesson_title
          FROM course_modules m LEFT JOIN course_lessons l ON l.module_id = m.id
          WHERE m.training_id = ? ORDER BY m.position, l.position`,
    args: [formationId],
  });

  const modules = new Map<string, PedagogieDeModule>();
  const lecons = new Map<string, string>();
  for (const row of structure.rows) {
    const moduleId = texte(row.module_id);
    if (!moduleId) continue;
    if (!modules.has(moduleId)) modules.set(moduleId, { moduleId, exercices: [], evaluations: [] });
    const lessonId = texte(row.lesson_id);
    if (lessonId) lecons.set(lessonId, texte(row.lesson_title, 'Leçon'));
  }
  if (modules.size === 0) return [];

  const ids = [...lecons.keys()];
  if (ids.length === 0) return [...modules.values()];
  const marques = ids.map(() => '?').join(',');

  const ex = await db.execute({
    sql: `SELECT e.id, e.title, e.intro, e.lesson_id FROM lesson_exercises e WHERE e.lesson_id IN (${marques}) ORDER BY e.created_at_ms`,
    args: ids,
  });
  for (const row of ex.rows) {
    const lessonId = texte(row.lesson_id);
    const id = texte(row.id);
    const moduleId = [...lecons.entries()].find(([, titre]) => false)?.[0];
    void moduleId;
    const parent = await db.execute({ sql: 'SELECT module_id FROM course_lessons WHERE id = ?', args: [lessonId] });
    const moduleCible = texte(parent.rows[0]?.module_id);
    const cible = modules.get(moduleCible);
    if (!cible) continue;
    cible.exercices.push({
      leconTitre: lecons.get(lessonId) ?? 'Leçon',
      exercice: { id, title: texte(row.title, 'Exercice'), intro: texte(row.intro) || null, questions: await questionsDe(db, 'exercise', id) },
    });
  }

  const ev = await db.execute({
    sql: `SELECT a.id, a.title, a.intro, a.min_score, a.requires_review, a.lesson_id FROM lesson_assessments a WHERE a.lesson_id IN (${marques}) ORDER BY a.created_at_ms`,
    args: ids,
  });
  for (const row of ev.rows) {
    const lessonId = texte(row.lesson_id);
    const id = texte(row.id);
    const parent = await db.execute({ sql: 'SELECT module_id FROM course_lessons WHERE id = ?', args: [lessonId] });
    const moduleCible = texte(parent.rows[0]?.module_id);
    const cible = modules.get(moduleCible);
    if (!cible) continue;
    const meilleure = await db.execute({
      sql: 'SELECT MAX(pct) AS pct, COUNT(*) AS n FROM assessment_attempts WHERE user_id = ? AND assessment_id = ?',
      args: [userId, id],
    });
    const devoir = await db.execute({
      sql: 'SELECT status, feedback FROM submissions WHERE user_id = ? AND assessment_id = ? ORDER BY at_ms DESC LIMIT 1',
      args: [userId, id],
    });
    const pct = meilleure.rows[0]?.pct;
    const minScore = entier(row.min_score, 80);
    cible.evaluations.push({
      leconTitre: lecons.get(lessonId) ?? 'Leçon',
      evaluation: {
        id,
        title: texte(row.title, 'Évaluation'),
        intro: texte(row.intro) || null,
        minScore,
        requiresReview: entier(row.requires_review, 1) === 1,
        questions: await questionsDe(db, 'assessment', id),
        meilleurPct: pct === null || pct === undefined ? null : entier(pct),
        reussie: pct !== null && pct !== undefined && entier(pct) >= minScore,
        tentativeCount: entier(meilleure.rows[0]?.n),
        devoir: devoir.rows[0]
          ? { statut: texte(devoir.rows[0].status, 'pending'), motif: texte(devoir.rows[0].feedback) || null, renduLeMs: 0 }
          : null,
      },
    });
  }
  return [...modules.values()];
}
