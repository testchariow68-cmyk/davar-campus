/**
 * Recents du campus étudiant — la « reprise » du prototype.
 *
 * Le prototype affiche « Consultés récemment » : on s'appuie sur ce qui existe
 * réellement en base, les leçons terminées, avec l'horodatage. Aucune donnée
 * inventée : si rien n'a été travaillé, la section le dit.
 */
import type { Db } from './auth-core';

export type ModuleConsulte = {
  moduleId: string;
  moduleTitre: string;
  formationId: string;
  formationTitre: string;
  quandMs: number;
};

export async function modulesConsultes(db: Db, userId: string, limite = 3): Promise<ModuleConsulte[]> {
  const resultat = await db.execute({
    sql: `SELECT m.id AS module_id, m.title AS module_titre,
                 t.id AS formation_id, t.title AS formation_titre,
                 MAX(c.completed_at_ms) AS quand
          FROM lesson_completions c
          JOIN course_lessons l ON l.id = c.lesson_id
          JOIN course_modules m ON m.id = l.module_id
          JOIN trainings t ON t.id = m.training_id
          WHERE c.user_id = ?
          GROUP BY m.id
          ORDER BY quand DESC
          LIMIT ?`,
    args: [userId, limite],
  });
  return resultat.rows.map((ligne) => ({
    moduleId: String(ligne.module_id),
    moduleTitre: String(ligne.module_titre),
    formationId: String(ligne.formation_id),
    formationTitre: String(ligne.formation_titre),
    quandMs: Number(ligne.quand ?? 0),
  }));
}

/** « il y a 3 jours », comme le prototype — sans dépendance externe. */
export function depuis(quandMs: number, maintenantMs = Date.now()): string {
  const secondes = Math.max(0, Math.round((maintenantMs - quandMs) / 1000));
  if (secondes < 60) return "à l'instant";
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.round(heures / 24);
  if (jours === 1) return 'hier';
  if (jours < 30) return `il y a ${jours} jours`;
  const mois = Math.round(jours / 30);
  return mois <= 1 ? 'il y a un mois' : `il y a ${mois} mois`;
}

/** Salutation selon l'heure — exactement les trois cas du prototype. */
export function salutation(maintenantMs = Date.now()): string {
  const heure = new Date(maintenantMs).getHours();
  if (heure < 12) return 'Bonjour';
  if (heure < 18) return 'Bon après-midi';
  return 'Bonsoir';
}
