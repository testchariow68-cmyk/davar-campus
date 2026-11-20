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

/* -------------------------------------------------------------------------- */
/*  LES TROIS TEMPS — attentes à l'arrivée, avis à quinze jours, avis à un mois */
/* -------------------------------------------------------------------------- */

/**
 * Ce que le campus doit demander À CET INSTANT, ou null s'il n'y a rien à
 * demander. Le propriétaire a fixé trois temps, et ils sont BLOQUANTS :
 *
 *   1. dès l'arrivée, ses ATTENTES — « à quoi vous attendez-vous ? » ;
 *   2. quinze jours après l'achat, son AVIS — il a déjà une expérience ;
 *   3. un mois après l'achat, son AVIS de nouveau — il touche à la fin.
 *
 * Sans formation, rien n'est demandé : le staff ne passe pas par là. La demande
 * la plus ancienne passe la première, et une fois répondue, elle ne revient
 * jamais.
 */
export type DemandeEnCours = {
  genre: 'attentes' | 'avis';
  step: number;
  formationId: string;
  formationTitre: string;
  duAtMs: number;
  titre: string;
  consigne: string;
};

export async function demandeEnCours(
  db: Db,
  userId: string,
  maintenant = Date.now()
): Promise<DemandeEnCours | null> {
  const inscriptions = await db.execute({
    sql: `SELECT e.training_id AS formation, t.title AS titre, e.acquired_at_ms AS acquis,
                 (SELECT COUNT(*) FROM attentes_etudiants a
                   WHERE a.user_id = e.user_id AND a.training_id = e.training_id) AS attentes,
                 (SELECT COUNT(*) FROM reviews r
                   WHERE r.user_id = e.user_id AND r.training_id = e.training_id AND r.step = 1) AS avis1,
                 (SELECT COUNT(*) FROM reviews r
                   WHERE r.user_id = e.user_id AND r.training_id = e.training_id AND r.step = 2) AS avis2
          FROM enrollments e JOIN trainings t ON t.id = e.training_id
          JOIN users u ON u.id = e.user_id
          WHERE e.user_id = ? AND u.is_test = 0
          ORDER BY e.acquired_at_ms ASC`,
    args: [userId],
  });

  let plusAncienne: DemandeEnCours | null = null;
  for (const row of inscriptions.rows) {
    const formationId = texte(row.formation);
    const formationTitre = texte(row.titre, 'Formation');
    const acquis = entier(row.acquis);
    const candidates: DemandeEnCours[] = [];

    if (entier(row.attentes) === 0) {
      candidates.push({
        genre: 'attentes',
        step: 0,
        formationId,
        formationTitre,
        duAtMs: acquis,
        titre: 'Vos attentes',
        // Les mots du propriétaire. « attentes » est féminin : « quelles », et non
        // le « quels » qu'avait laissé la dictée vocale.
        consigne:
          'Bienvenue. Une seule question avant de commencer : quelles sont vos attentes concernant cette formation ?',
      });
    }
    if (entier(row.avis1) === 0 && maintenant - acquis >= DELAI_PREMIER_AVIS_MS) {
      candidates.push({
        genre: 'avis',
        step: 1,
        formationId,
        formationTitre,
        duAtMs: acquis + DELAI_PREMIER_AVIS_MS,
        titre: 'Votre avis',
        consigne: `Quinze jours. Votre regard change notre campus : qu'avez-vous aimé ? Que devons-nous améliorer ?`,
      });
    }
    if (entier(row.avis2) === 0 && maintenant - acquis >= DELAI_SECOND_AVIS_MS) {
      candidates.push({
        genre: 'avis',
        step: 2,
        formationId,
        formationTitre,
        duAtMs: acquis + DELAI_SECOND_AVIS_MS,
        titre: 'Votre avis',
        consigne: `Un mois avec nous. Vous touchez au but : Laissez-nous votre avis, il guidera les prochains.`,
      });
    }

    for (const candidate of candidates) {
      if (!plusAncienne || candidate.duAtMs < plusAncienne.duAtMs) plusAncienne = candidate;
    }
  }
  return plusAncienne;
}

/** Déposer ses attentes, une seule fois par étudiant et par formation. */
export async function deposerAttentes(
  db: Db,
  options: { userId: string; formationId: string; body: string; kind: 'ecrit' | 'audio'; transcribedBy?: string | null },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string; mots?: number }> {
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
    sql: 'SELECT 1 AS ok FROM attentes_etudiants WHERE user_id = ? AND training_id = ?',
    args: [options.userId, options.formationId],
  });
  if (deja.rows.length > 0) return { ok: false, erreur: 'attentes_deja_deposees' };

  await db.execute({
    sql: `INSERT INTO attentes_etudiants(id, user_id, training_id, kind, body, words, transcribed_by, at_ms)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [
      `att_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      options.userId,
      options.formationId,
      options.kind,
      corps,
      mots,
      options.kind === 'audio' ? (options.transcribedBy ?? 'navigateur') : null,
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
  /** L'étoile ✦ : cet avis témoigne sur la page du catalogue. */
  enAvant: boolean;
};

/** Ce que le propriétaire reçoit : l'ÉCRIT uniquement, comme il l'a demandé. */
export async function avisRecus(db: Db, limite = 100): Promise<AvisDirection[]> {
  const lignes = await db.execute({
    sql: `SELECT r.id, r.step, r.words, r.kind, r.body, r.at_ms, r.transcribed_by, r.spotlight,
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
    enAvant: entier(row.spotlight) === 1,
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

/* ------------------------------------------------------------ mise en avant */

export type AvisEnAvant = {
  id: string;
  texte: string;
  etudiant: string;
  formation: string;
};

/**
 * LES AVIS MIS EN AVANT — ceux qui témoignent sur la page du catalogue
 * (« Ils témoignent »). Trois au plus, et seulement ce que l'étudiant a écrit.
 */
export async function lireAvisEnAvant(db: Db, limite = 3): Promise<AvisEnAvant[]> {
  const bornes = Math.min(Math.max(limite, 1), 6);
  const lignes = await db.execute({
    sql: `SELECT r.id, r.body, r.training_id, u.display_name, t.title AS formation
          FROM reviews r
          JOIN users u ON u.id = r.user_id
          LEFT JOIN trainings t ON t.id = r.training_id
          WHERE r.spotlight = 1
          ORDER BY r.at_ms DESC LIMIT ?`,
    args: [bornes],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    texte: texte(row.body).slice(0, 220),
    etudiant: texte(row.display_name, 'Étudiant DAVAR vérifié'),
    formation: texte(row.formation, 'Plateforme DAVAR'),
  }));
}

/**
 * Mettre un avis en avant, ou le retirer. Geste de direction : l'étoile du
 * prototype, et rien de plus — jamais le texte n'est modifié ici.
 */
export async function mettreEnAvant(db: Db, avisId: string, valeur: boolean): Promise<boolean> {
  const resultat = await db.execute({
    sql: 'UPDATE reviews SET spotlight = ? WHERE id = ?',
    args: [valeur ? 1 : 0, avisId],
  });
  return Number(resultat.rowsAffected ?? 0) === 1;
}
