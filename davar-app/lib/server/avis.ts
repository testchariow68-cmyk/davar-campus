/**
 * AVIS OBLIGATOIRES — décision écrite du propriétaire :
 *   « Avis obligatoires ~2 semaines / 1 mois, 1 000 mots maximum, écrit ou audio
 *     transcrit (le propriétaire ne reçoit que l'écrit). »
 *
 * Autrement dit : il y a DEUX temps. Le premier avis est demandé environ deux
 * semaines après l'achat ; le second environ un mois après. Ils nourrissent les
 * exports, le Spotlight et la direction — jamais l'affichage public d'un étudiant.
 */
import type { Db } from './auth-core';

const JOUR_MS = 24 * 60 * 60 * 1000;
export const MOTS_MAXIMUM = 1000;
export const DELAI_PREMIER_AVIS_MS = 14 * JOUR_MS;
export const DELAI_SECOND_AVIS_MS = 30 * JOUR_MS;

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown, defaut = 0): number {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return defaut;
}

export function compterMots(corps: string): number {
  return corps
    .trim()
    .split(/\s+/)
    .filter((mot) => mot.length > 0).length;
}

export type AvisRequis = { step: number; duAtMs: number; deposeLeMs: number | null };

/**
 * Ce que l'étudiant doit à un instant donné : les deux avis attendus, avec leur
 * date limite. Un avis non déposé et en retard est signalé — jamais effacé.
 */
export async function avisAttendus(
  db: Db,
  userId: string,
  formationId: string,
  maintenant = Date.now()
): Promise<AvisRequis[]> {
  const achat = await db.execute({
    sql: 'SELECT acquired_at_ms FROM enrollments WHERE user_id = ? AND training_id = ?',
    args: [userId, formationId],
  });
  const acquis = achat.rows[0]?.acquired_at_ms;
  if (acquis === null || acquis === undefined) return [];
  const debut = entier(acquis);

  const deposes = await db.execute({
    sql: 'SELECT step, at_ms FROM reviews WHERE user_id = ? AND training_id = ?',
    args: [userId, formationId],
  });
  const parEtape = new Map<number, number>();
  for (const row of deposes.rows) parEtape.set(entier(row.step), entier(row.at_ms));

  return [
    { step: 1, duAtMs: debut + DELAI_PREMIER_AVIS_MS, deposeLeMs: parEtape.get(1) ?? null },
    { step: 2, duAtMs: debut + DELAI_SECOND_AVIS_MS, deposeLeMs: parEtape.get(2) ?? null },
  ];
}

export async function deposerAvis(
  db: Db,
  options: { userId: string; formationId: string; step: number; body: string; kind: 'ecrit' | 'audio'; transcribedBy?: string | null },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string; mots?: number }> {
  if (options.step !== 1 && options.step !== 2) return { ok: false, erreur: 'etape_invalide' };
  const corps = options.body.trim();
  if (corps.length < 20) return { ok: false, erreur: 'avis_trop_court' };
  const mots = compterMots(corps);
  if (mots > MOTS_MAXIMUM) return { ok: false, erreur: 'avis_trop_long', mots };

  const inscription = await db.execute({
    sql: 'SELECT 1 AS ok FROM enrollments WHERE user_id = ? AND training_id = ?',
    args: [options.userId, options.formationId],
  });
  if (inscription.rows.length === 0) return { ok: false, erreur: 'non_inscrit' };

  const deja = await db.execute({
    sql: 'SELECT 1 AS ok FROM reviews WHERE user_id = ? AND training_id = ? AND step = ?',
    args: [options.userId, options.formationId, options.step],
  });
  if (deja.rows.length > 0) return { ok: false, erreur: 'avis_deja_depose' };

  const acquis = await db.execute({
    sql: 'SELECT acquired_at_ms FROM enrollments WHERE user_id = ? AND training_id = ?',
    args: [options.userId, options.formationId],
  });
  const debut = entier(acquis.rows[0]?.acquired_at_ms);
  const delai = options.step === 1 ? DELAI_PREMIER_AVIS_MS : DELAI_SECOND_AVIS_MS;

  await db.execute({
    sql: `INSERT INTO reviews(id, user_id, training_id, kind, body, words, transcribed_by, step, due_at_ms, at_ms)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [
      `rev_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      options.userId,
      options.formationId,
      options.kind,
      corps,
      mots,
      options.kind === 'audio' ? (options.transcribedBy ?? 'browser-whisper') : null,
      options.step,
      debut + delai,
      maintenant,
    ],
  });
  return { ok: true, mots };
}

export type AvisDirection = {
  id: string;
  etudiant: string;
  courriel: string;
  formation: string;
  step: number;
  mots: number;
  kind: string;
  extrait: string;
  atMs: number;
};

/** Ce que le propriétaire reçoit : l'ÉCRIT uniquement, comme il l'a demandé. */
export async function avisRecus(db: Db, limite = 100): Promise<AvisDirection[]> {
  const lignes = await db.execute({
    sql: `SELECT r.id, r.step, r.words, r.kind, r.body, r.at_ms, r.transcribed_by,
                 u.display_name, u.email_normalized, t.title AS formation
          FROM reviews r
          JOIN users u ON u.id = r.user_id
          JOIN trainings t ON t.id = r.training_id
          ORDER BY r.at_ms DESC LIMIT ?`,
    args: [Math.min(Math.max(limite, 1), 300)],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    etudiant: texte(row.display_name, 'Étudiant'),
    courriel: texte(row.email_normalized),
    formation: texte(row.formation, 'Formation'),
    step: entier(row.step, 1),
    mots: entier(row.words),
    kind: texte(row.kind, 'ecrit'),
    extrait: texte(row.body).slice(0, 400),
    atMs: entier(row.at_ms),
  }));
}

/** Les avis dus et non déposés : de quoi relancer honnêtement. */
export async function avisEnRetard(db: Db, maintenant = Date.now()): Promise<
  Array<{ etudiant: string; courriel: string; formation: string; step: number; duAtMs: number; retardJours: number }>
> {
  const lignes = await db.execute({
    sql: `SELECT u.display_name, u.email_normalized, t.title AS formation, e.acquired_at_ms
          FROM enrollments e
          JOIN users u ON u.id = e.user_id
          JOIN trainings t ON t.id = e.training_id
          WHERE u.role = 'student' AND u.is_test = 0`,
  });
  const sortie: Array<{ etudiant: string; courriel: string; formation: string; step: number; duAtMs: number; retardJours: number }> = [];
  for (const row of lignes.rows) {
    const debut = entier(row.acquired_at_ms);
    const formation = texte(row.formation, 'Formation');
    for (const [step, delai] of [
      [1, DELAI_PREMIER_AVIS_MS],
      [2, DELAI_SECOND_AVIS_MS],
    ] as const) {
      const duAtMs = debut + delai;
      if (duAtMs > maintenant) continue;
      const deja = await db.execute({
        sql: 'SELECT 1 AS ok FROM reviews r JOIN users u ON u.id = r.user_id WHERE u.email_normalized = ? AND r.training_id = (SELECT id FROM trainings WHERE title = ?) AND r.step = ?',
        args: [texte(row.email_normalized), formation, step],
      });
      if (deja.rows.length > 0) continue;
      sortie.push({
        etudiant: texte(row.display_name, 'Étudiant'),
        courriel: texte(row.email_normalized),
        formation,
        step,
        duAtMs,
        retardJours: Math.round((maintenant - duAtMs) / JOUR_MS),
      });
    }
  }
  return sortie;
}
