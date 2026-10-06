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
};

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
                   WHERE m.training_id = t.id AND c.user_id = e.user_id) AS completed_count
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
    args: [userId, trainingId],
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

  return { id: trainingId, title, description: text(training?.description), modules, lessonCount, completedCount };
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
