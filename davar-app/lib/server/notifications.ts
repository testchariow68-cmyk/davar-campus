/**
 * NOTIFICATIONS — la cloche du campus.
 *
 * Règle du propriétaire, écrite dans le cycle de vie du prototype :
 *   « Notifications lues — disparaissent 48 heures après leur lecture. »
 * Une notification non lue ne disparaît pas : elle attend d'être vue.
 */
import type { Db } from './auth-core';

const JOUR_MS = 24 * 60 * 60 * 1000;
export const DISPARITION_APRES_LECTURE_MS = 2 * JOUR_MS;
/** Une notification jamais lue finit tout de même par être purgée : 60 jours. */
export const DUREE_MAXIMALE_MS = 60 * JOUR_MS;

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

export type Notification = {
  id: string;
  kind: string;
  titre: string;
  corps: string | null;
  route: string | null;
  atMs: number;
  lue: boolean;
  expiresAtMs: number;
};

export async function notifier(
  db: Db,
  options: { userId: string; kind?: string; titre: string; corps?: string | null; route?: string | null },
  maintenant = Date.now()
): Promise<void> {
  const id = `ntf_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  await db.execute({
    sql: `INSERT INTO notifications(id, user_id, kind, title, body, route, created_at_ms, read_at_ms, expires_at_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    args: [
      id,
      options.userId,
      options.kind ?? 'system',
      options.titre,
      options.corps ?? null,
      options.route ?? null,
      maintenant,
      maintenant + DUREE_MAXIMALE_MS,
    ],
  });
}

/** Les notifications visibles : non expirées, les plus récentes d'abord. */
export async function listerNotifications(db: Db, userId: string, maintenant = Date.now(), limite = 30): Promise<Notification[]> {
  const lignes = await db.execute({
    sql: `SELECT id, kind, title, body, route, created_at_ms, read_at_ms, expires_at_ms
          FROM notifications
          WHERE user_id = ? AND expires_at_ms > ?
          ORDER BY created_at_ms DESC LIMIT ?`,
    args: [userId, maintenant, Math.min(Math.max(limite, 1), 100)],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id) ?? '',
    kind: texte(row.kind) ?? 'system',
    titre: texte(row.title) ?? '',
    corps: texte(row.body),
    route: texte(row.route),
    atMs: entier(row.created_at_ms) ?? 0,
    lue: entier(row.read_at_ms) !== null,
    expiresAtMs: entier(row.expires_at_ms) ?? 0,
  }));
}

export async function compterNonLues(db: Db, userId: string, maintenant = Date.now()): Promise<number> {
  const ligne = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM notifications
          WHERE user_id = ? AND read_at_ms IS NULL AND expires_at_ms > ?`,
    args: [userId, maintenant],
  });
  return entier(ligne.rows[0]?.n) ?? 0;
}

/** Marquer lue = accepter qu'elle disparaisse 48 heures plus tard. */
export async function marquerLue(db: Db, userId: string, notificationId: string, maintenant = Date.now()): Promise<boolean> {
  const resultat = await db.execute({
    sql: `UPDATE notifications SET read_at_ms = ?, expires_at_ms = ?
          WHERE id = ? AND user_id = ? AND read_at_ms IS NULL`,
    args: [maintenant, maintenant + DISPARITION_APRES_LECTURE_MS, notificationId, userId],
  });
  return (resultat.rowsAffected ?? 0) > 0;
}

export async function marquerToutesLues(db: Db, userId: string, maintenant = Date.now()): Promise<number> {
  const resultat = await db.execute({
    sql: `UPDATE notifications SET read_at_ms = ?, expires_at_ms = ?
          WHERE user_id = ? AND read_at_ms IS NULL`,
    args: [maintenant, maintenant + DISPARITION_APRES_LECTURE_MS, userId],
  });
  return resultat.rowsAffected ?? 0;
}

/** Purge : retire ce qui a expiré. Appelée par la tâche de cycle de vie. */
export async function purgerNotifications(db: Db, maintenant = Date.now()): Promise<number> {
  const resultat = await db.execute({
    sql: 'DELETE FROM notifications WHERE expires_at_ms <= ?',
    args: [maintenant],
  });
  return resultat.rowsAffected ?? 0;
}

/** Notifie tous les membres de l'équipe — utilisé par le support et les questions au coach. */
export async function notifierEquipe(
  db: Db,
  options: { titre: string; corps?: string | null; route?: string | null; kind?: string },
  maintenant = Date.now()
): Promise<number> {
  const equipe = await db.execute("SELECT id FROM users WHERE role IN ('staff','admin') AND status = 'active' AND is_test = 0");
  let envoyees = 0;
  for (const row of equipe.rows) {
    const id = texte(row.id);
    if (!id) continue;
    await notifier(db, { userId: id, kind: options.kind ?? 'staff', titre: options.titre, corps: options.corps, route: options.route }, maintenant);
    envoyees += 1;
  }
  return envoyees;
}
