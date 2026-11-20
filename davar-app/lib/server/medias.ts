/**
 * LIVRES ET AUDIOS — pages, pistes, et reprise de lecture.
 *
 * Ce que le propriétaire a écrit (prototype, vue « Mes livres » et « Mes audios ») :
 *   - « Lisez directement dans la plateforme, votre page est mémorisée. »
 *   - « Écoute avec reprise automatique. »
 *   - un livre peut aussi être un PDF, alors affiché tel quel dans son lecteur ;
 *   - les pistes d'un livre audio se suivent « dans l'ordre du livre audio ».
 *
 * Le contrôle d'accès est le même que pour toute ressource : publiée, et soit
 * offerte à tous, soit attribuée nommément. Aucune autre combinaison n'ouvre.
 */
import type { Db } from './auth-core';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

function identifiant(prefixe: string, maintenant: number): string {
  return `${prefixe}_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export type PageLivre = { id: string; position: number; title: string | null; body: string };
export type PisteAudio = { id: string; position: number; title: string; durationSec: number | null; fileKey: string | null };

/**
 * Un étudiant a-t-il le droit d'ouvrir cette ressource ?
 * Règle unique, appliquée partout : publiée, et (à tous OU attribuée à lui),
 * et — si elle dépend d'une formation — il doit y être inscrit.
 */
export async function accesRessource(
  db: Db,
  options: { userId: string; estProprietaire: boolean; resourceId: string }
): Promise<{ ok: boolean; raison?: string; kind?: string; title?: string; fileKey?: string | null; formationId?: string | null }> {
  const ligne = await db.execute({
    sql: `SELECT r.id, r.kind, r.title, r.file_key, r.training_id, r.published,
                 (SELECT COUNT(*) FROM resource_allocations ra WHERE ra.resource_id = r.id) AS attribuees,
                 (SELECT COUNT(*) FROM resource_allocations ra WHERE ra.resource_id = r.id AND ra.user_id = ?) AS a_moi,
                 (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = ? AND e.training_id = r.training_id) AS inscrit
          FROM resources r WHERE r.id = ?`,
    args: [options.userId, options.userId, options.resourceId],
  });
  const ressource = ligne.rows[0];
  if (!ressource) return { ok: false, raison: 'introuvable' };
  if (options.estProprietaire) {
    return {
      ok: true,
      kind: texte(ressource.kind, 'file'),
      title: texte(ressource.title),
      fileKey: texte(ressource.file_key) || null,
      formationId: texte(ressource.training_id) || null,
    };
  }
  if (entier(ressource.published) !== 1) return { ok: false, raison: 'introuvable' };
  const pourTous = entier(ressource.attribuees) === 0;
  const aMoi = entier(ressource.a_moi) === 1;
  const formationOk = ressource.training_id === null || entier(ressource.inscrit) === 1;
  if (!(pourTous || aMoi) || !formationOk) return { ok: false, raison: 'acces_refuse' };
  return {
    ok: true,
    kind: texte(ressource.kind, 'file'),
    title: texte(ressource.title),
    fileKey: texte(ressource.file_key) || null,
    formationId: texte(ressource.training_id) || null,
  };
}

export async function pagesDuLivre(db: Db, resourceId: string): Promise<PageLivre[]> {
  const lignes = await db.execute({
    sql: 'SELECT id, position, title, body FROM book_pages WHERE resource_id = ? ORDER BY position',
    args: [resourceId],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    position: entier(row.position) ?? 0,
    title: texte(row.title) || null,
    body: texte(row.body),
  }));
}

export async function pistesDeLAudio(db: Db, resourceId: string): Promise<PisteAudio[]> {
  const lignes = await db.execute({
    sql: 'SELECT id, position, title, duration_sec, file_key FROM audio_tracks WHERE resource_id = ? ORDER BY position',
    args: [resourceId],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    position: entier(row.position) ?? 0,
    title: texte(row.title, 'Piste'),
    durationSec: entier(row.duration_sec),
    fileKey: texte(row.file_key) || null,
  }));
}

export async function ajouterPage(
  db: Db,
  options: { resourceId: string; title?: string | null; body: string; position?: number },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string; position?: number }> {
  const corps = options.body.trim();
  if (corps.length < 10) return { ok: false, erreur: 'page_trop_courte' };
  if (corps.length > 20000) return { ok: false, erreur: 'page_trop_longue' };
  const suivant =
    options.position ??
    (entier((await db.execute({ sql: 'SELECT COALESCE(MAX(position),0)+1 AS p FROM book_pages WHERE resource_id = ?', args: [options.resourceId] })).rows[0]?.p) ?? 1);
  await db.execute({
    sql: 'INSERT INTO book_pages(id, resource_id, position, title, body) VALUES (?,?,?,?,?)',
    args: [identifiant('pg', maintenant), options.resourceId, suivant, options.title?.trim().slice(0, 160) || null, corps],
  });
  return { ok: true, position: suivant };
}

export async function supprimerPage(db: Db, pageId: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM book_pages WHERE id = ?', args: [pageId] });
}

export async function ajouterPiste(
  db: Db,
  options: { resourceId: string; title: string; fileKey?: string | null; durationSec?: number | null; position?: number },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string; id?: string; position?: number }> {
  const titre = options.title.trim();
  if (titre.length < 2 || titre.length > 160) return { ok: false, erreur: 'titre_invalide' };
  const suivant =
    options.position ??
    (entier((await db.execute({ sql: 'SELECT COALESCE(MAX(position),0)+1 AS p FROM audio_tracks WHERE resource_id = ?', args: [options.resourceId] })).rows[0]?.p) ?? 1);
  const id = identifiant('trk', maintenant);
  await db.execute({
    sql: 'INSERT INTO audio_tracks(id, resource_id, position, title, duration_sec, file_key) VALUES (?,?,?,?,?,?)',
    args: [id, options.resourceId, suivant, titre, options.durationSec ?? null, options.fileKey ?? null],
  });
  return { ok: true, id, position: suivant };
}

export async function definirPiste(
  db: Db,
  options: { pisteId: string; fileKey?: string | null; durationSec?: number | null }
): Promise<void> {
  if (options.fileKey !== undefined) {
    await db.execute({ sql: 'UPDATE audio_tracks SET file_key = ? WHERE id = ?', args: [options.fileKey ?? null, options.pisteId] });
  }
  if (options.durationSec !== undefined && options.durationSec !== null) {
    await db.execute({ sql: 'UPDATE audio_tracks SET duration_sec = ? WHERE id = ?', args: [options.durationSec, options.pisteId] });
  }
}

/** Où en est l'étudiant : la page d'un livre, la seconde d'un audio. */
export async function positionLecture(
  db: Db,
  userId: string,
  resourceId: string
): Promise<{ position: number; atMs: number } | null> {
  const ligne = await db.execute({
    sql: 'SELECT position, at_ms FROM media_progress WHERE user_id = ? AND resource_id = ?',
    args: [userId, resourceId],
  });
  const row = ligne.rows[0];
  if (!row) return null;
  return { position: entier(row.position) ?? 0, atMs: entier(row.at_ms) ?? 0 };
}

/**
 * Enregistre la position. On ne recule jamais tout seul : une position plus
 * petite n'écrase pas une position plus avancée, sauf quand l'étudiant revient
 * volontairement en arrière (ce que le lecteur signale par `forcer`).
 */
export async function enregistrerPosition(
  db: Db,
  options: { userId: string; resourceId: string; kind: 'book' | 'audio'; position: number; forcer?: boolean },
  maintenant = Date.now()
): Promise<number> {
  const voulue = Math.max(0, Math.trunc(options.position));
  const resultat = await db.execute({
    sql: `INSERT INTO media_progress(user_id, resource_id, kind, position, at_ms) VALUES (?,?,?,?,?)
          ON CONFLICT(user_id, resource_id) DO UPDATE SET
            position = CASE WHEN ? = 1 THEN excluded.position
                            WHEN excluded.position > media_progress.position THEN excluded.position
                            ELSE media_progress.position END,
            kind = excluded.kind,
            at_ms = excluded.at_ms`,
    args: [options.userId, options.resourceId, options.kind, voulue, maintenant, options.forcer ? 1 : 0],
  });
  void resultat;
  return voulue;
}

/** Les positions de lecture, pour afficher « Vous vous êtes arrêté à la page N. » */
export async function positionsDeLEtudiant(db: Db, userId: string): Promise<Record<string, number>> {
  const lignes = await db.execute({
    sql: 'SELECT resource_id, position FROM media_progress WHERE user_id = ?',
    args: [userId],
  });
  const positions: Record<string, number> = {};
  for (const row of lignes.rows) {
    const id = texte(row.resource_id);
    if (id) positions[id] = entier(row.position) ?? 0;
  }
  return positions;
}

/** Le nombre de pages et de pistes, pour l'affichage des listes. */
export async function contenanceRessources(db: Db, ids: string[]): Promise<Record<string, { pages: number; pistes: number }>> {
  const contenance: Record<string, { pages: number; pistes: number }> = {};
  for (const id of ids) contenance[id] = { pages: 0, pistes: 0 };
  if (ids.length === 0) return contenance;
  const marques = ids.map(() => '?').join(',');
  const pages = await db.execute({
    sql: `SELECT resource_id, COUNT(*) AS n FROM book_pages WHERE resource_id IN (${marques}) GROUP BY resource_id`,
    args: ids,
  });
  for (const row of pages.rows) {
    const id = texte(row.resource_id);
    if (id) contenance[id] = { ...contenance[id], pages: entier(row.n) ?? 0 };
  }
  const pistes = await db.execute({
    sql: `SELECT resource_id, COUNT(*) AS n FROM audio_tracks WHERE resource_id IN (${marques}) GROUP BY resource_id`,
    args: ids,
  });
  for (const row of pistes.rows) {
    const id = texte(row.resource_id);
    if (id) contenance[id] = { ...contenance[id], pistes: entier(row.n) ?? 0 };
  }
  return contenance;
}
