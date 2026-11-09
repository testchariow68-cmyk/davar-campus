/**
 * RESSOURCES — livres, audios, fichiers.
 *
 * Décision du propriétaire, écrite dans son manifeste :
 *   « Mes ressources par étudiant — attribution tous / par étudiant ».
 *
 * Une ressource est donc visible d'un étudiant si elle est publiée ET si l'un de
 * ces deux cas est vrai : elle n'a aucune restriction (offerte à tous), ou bien
 * elle lui a été nommément attribuée. Aucune autre combinaison n'ouvre l'accès.
 */
import type { Db } from './auth-core';

export type Ressource = {
  id: string;
  kind: 'book' | 'audio' | 'file';
  title: string;
  description: string | null;
  coverKey: string | null;
  fileKey: string | null;
  durationMin: number | null;
  formationId: string | null;
  formationTitre: string | null;
  position: number;
  /** Nombre d'étudiants nommément attribués : 0 = offerte à tous. */
  attribueeA: number;
  obtenueLeMs: number | null;
  /** Publiée = visible des étudiants. Retirée = visible du seul propriétaire. */
  publiee: boolean;
};

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

/**
 * Les ressources que CET étudiant a le droit d'ouvrir. La condition est dans la
 * requête : impossible d'obtenir une ressource attribuée à quelqu'un d'autre.
 */
export async function ressourcesDeEtudiant(db: Db, userId: string): Promise<Ressource[]> {
  const lignes = await db.execute({
    sql: `SELECT r.id, r.kind, r.title, r.description, r.cover_key, r.file_key, r.duration_min,
                 r.training_id, r.position, r.published, t.title AS formation_titre,
                 (SELECT COUNT(*) FROM resource_allocations ra WHERE ra.resource_id = r.id) AS attribuees,
                 (SELECT at_ms FROM resource_allocations ra WHERE ra.resource_id = r.id AND ra.user_id = ?) AS obtenue,
                 (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = ? AND e.training_id = r.training_id) AS inscrit
          FROM resources r
          LEFT JOIN trainings t ON t.id = r.training_id
          WHERE r.published = 1
            AND (r.training_id IS NULL
                 OR (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = ? AND e.training_id = r.training_id) = 1)
            AND (
              (SELECT COUNT(*) FROM resource_allocations ra WHERE ra.resource_id = r.id) = 0
              OR EXISTS (SELECT 1 FROM resource_allocations ra WHERE ra.resource_id = r.id AND ra.user_id = ?)
            )
          ORDER BY r.kind, r.position, r.title`,
    args: [userId, userId, userId, userId],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    kind: (texte(row.kind, 'file') as Ressource['kind']) ?? 'file',
    title: texte(row.title, 'Ressource'),
    description: texte(row.description) || null,
    coverKey: texte(row.cover_key) || null,
    fileKey: texte(row.file_key) || null,
    durationMin: entier(row.duration_min),
    formationId: texte(row.training_id) || null,
    formationTitre: texte(row.formation_titre) || null,
    position: entier(row.position) ?? 0,
    attribueeA: entier(row.attribuees) ?? 0,
    obtenueLeMs: entier(row.obtenue),
    publiee: entier(row.published) === 1,
  }));
}

export async function creerRessource(
  db: Db,
  options: {
    kind: 'book' | 'audio' | 'file';
    title: string;
    description?: string;
    coverKey?: string | null;
    fileKey?: string | null;
    durationMin?: number | null;
    formationId?: string | null;
  },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string; id?: string }> {
  const titre = options.title.trim();
  if (titre.length < 2 || titre.length > 160) return { ok: false, erreur: 'titre_invalide' };
  if (!['book', 'audio', 'file'].includes(options.kind)) return { ok: false, erreur: 'type_invalide' };
  const id = `res_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const suivant = await db.execute('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM resources');
  await db.execute({
    sql: `INSERT INTO resources(id, training_id, kind, title, description, cover_key, file_key, duration_min, position, published, created_at_ms)
          VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
    args: [
      id,
      options.formationId ?? null,
      options.kind,
      titre,
      options.description?.trim().slice(0, 800) ?? null,
      options.coverKey ?? null,
      options.fileKey ?? null,
      options.durationMin ?? null,
      entier(suivant.rows[0]?.p) ?? 1,
      maintenant,
    ],
  });
  return { ok: true, id };
}

/** Attribue une ressource à un étudiant précis. Sans attribution, elle est offerte à tous. */
export async function attribuerRessource(
  db: Db,
  options: { resourceId: string; userId: string; par: string },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string }> {
  const existent = await db.execute({
    sql: 'SELECT 1 AS r FROM resources r WHERE r.id = ? AND EXISTS (SELECT 1 FROM users u WHERE u.id = ?)',
    args: [options.resourceId, options.userId],
  });
  if (existent.rows.length === 0) return { ok: false, erreur: 'introuvable' };
  await db.execute({
    sql: `INSERT INTO resource_allocations(resource_id, user_id, allocated_by, at_ms) VALUES (?,?,?,?)
          ON CONFLICT(resource_id, user_id) DO NOTHING`,
    args: [options.resourceId, options.userId, options.par, maintenant],
  });
  return { ok: true };
}

export async function retirerAttribution(db: Db, resourceId: string, userId: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM resource_allocations WHERE resource_id = ? AND user_id = ?', args: [resourceId, userId] });
}

export async function toutesRessources(db: Db): Promise<Ressource[]> {
  const lignes = await db.execute({
    sql: `SELECT r.id, r.kind, r.title, r.description, r.cover_key, r.file_key, r.duration_min,
                 r.training_id, r.position, r.published, t.title AS formation_titre,
                 (SELECT COUNT(*) FROM resource_allocations ra WHERE ra.resource_id = r.id) AS attribuees
          FROM resources r LEFT JOIN trainings t ON t.id = r.training_id
          ORDER BY r.kind, r.position, r.title`,
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    kind: (texte(row.kind, 'file') as Ressource['kind']) ?? 'file',
    title: texte(row.title, 'Ressource'),
    description: texte(row.description) || null,
    coverKey: texte(row.cover_key) || null,
    fileKey: texte(row.file_key) || null,
    durationMin: entier(row.duration_min),
    formationId: texte(row.training_id) || null,
    formationTitre: texte(row.formation_titre) || null,
    position: entier(row.position) ?? 0,
    attribueeA: entier(row.attribuees) ?? 0,
    obtenueLeMs: null,
    publiee: entier(row.published) === 1,
  }));
}
