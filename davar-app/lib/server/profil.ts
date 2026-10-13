/**
 * PROFIL & PARAMÈTRES — ce que chaque personne règle pour elle-même.
 *
 * Le prototype (vProfile) donne à l'étudiant : son nom (21 caractères au plus,
 * « Ce nom apparaît sur vos certificats »), sa photo, le thème, l'interrupteur
 * des notifications, et le changement de code secret. Ces choix suivent la
 * personne d'un appareil à l'autre : ils vivent donc en base (`user_prefs`),
 * pas dans le navigateur.
 *
 * Le code secret n'est JAMAIS stocké, et jamais transmis : le navigateur dérive
 * une clé (PBKDF2 600 000 itérations) et n'envoie que le résultat. Changer de
 * code secret revient donc à vérifier l'ancienne clé dérivée, puis à poser la
 * nouvelle — exactement le même mécanisme que la connexion.
 */
import { hashClientVerifier, isClientVerifier, verifyClientVerifier, type Db } from './auth-core.ts';

export const LONGUEUR_NOM_MIN = 2;
export const LONGUEUR_NOM_MAX = 21;

/** Clés de préférences reconnues. Toute autre clé est refusée : pas de fourre-tout. */
export const PREFERENCES = ['notifications.actives', 'affichage.echelle', 'photo.cle'] as const;
export type ClePreference = (typeof PREFERENCES)[number];

/** Échelles d'affichage proposées — celles du prototype : 90, 100, 110, 125 %. */
export const ECHELLES = [0.9, 1, 1.1, 1.25] as const;

export type Preferences = {
  /** Interrupteur « Notifications » du profil. Activé tant que rien n'a été refusé. */
  notifications: boolean;
  /** Taille d'affichage choisie (1 = taille normale). */
  echelle: number;
  /** Clé de la photo de profil dans le stockage, si elle a été déposée. */
  photoCle: string | null;
};

export type Profil = {
  id: string;
  nom: string;
  email: string;
  role: string;
  membreDepuisMs: number;
  preferences: Preferences;
};

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

export const PREFERENCES_DEFAUT: Preferences = { notifications: true, echelle: 1, photoCle: null };

/** Contrôle des préférences reçues du navigateur : rien d'inventé n'entre en base. */
export function analyserPreference(
  cle: string,
  valeur: string
): { ok: true; cle: ClePreference; valeur: string } | { ok: false; erreur: string } {
  if (!(PREFERENCES as readonly string[]).includes(cle)) return { ok: false, erreur: 'preference_inconnue' };
  const nommee = cle as ClePreference;
  if (nommee === 'notifications.actives') {
    if (valeur !== '0' && valeur !== '1') return { ok: false, erreur: 'valeur_invalide' };
    return { ok: true, cle: nommee, valeur };
  }
  if (nommee === 'affichage.echelle') {
    const nombre = Number(valeur);
    if (!(ECHELLES as readonly number[]).includes(nombre)) return { ok: false, erreur: 'valeur_invalide' };
    return { ok: true, cle: nommee, valeur: String(nombre) };
  }
  // `photo.cle` ne s'écrit que par le dépôt d'une photo, jamais à la main.
  return { ok: false, erreur: 'preference_reservee' };
}

export async function lirePreferences(db: Db, userId: string): Promise<Preferences> {
  const lignes = await db.execute({
    sql: 'SELECT pref_key, pref_value FROM user_prefs WHERE user_id = ?',
    args: [userId],
  });
  const valeurs = new Map<string, string>();
  for (const ligne of lignes.rows) {
    const cle = texte(ligne.pref_key);
    const valeur = texte(ligne.pref_value);
    if (cle && valeur !== null) valeurs.set(cle, valeur);
  }
  const echelle = Number(valeurs.get('affichage.echelle'));
  const photoCle = valeurs.get('photo.cle') ?? null;
  return {
    notifications: valeurs.get('notifications.actives') !== '0',
    echelle: (ECHELLES as readonly number[]).includes(echelle) ? echelle : 1,
    photoCle: photoCle && photoCle.length <= 300 ? photoCle : null,
  };
}

export async function ecrirePreference(
  db: Db,
  userId: string,
  cle: ClePreference,
  valeur: string,
  maintenant = Date.now()
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO user_prefs(user_id, pref_key, pref_value, updated_at_ms) VALUES (?,?,?,?)
          ON CONFLICT(user_id, pref_key) DO UPDATE SET pref_value = excluded.pref_value,
                                                       updated_at_ms = excluded.updated_at_ms`,
    args: [userId, cle, valeur, maintenant],
  });
}

export async function supprimerPreference(db: Db, userId: string, cle: ClePreference): Promise<void> {
  await db.execute({ sql: 'DELETE FROM user_prefs WHERE user_id = ? AND pref_key = ?', args: [userId, cle] });
}

export async function lireProfil(db: Db, userId: string): Promise<Profil | null> {
  const resultat = await db.execute({
    sql: 'SELECT id, email_normalized, display_name, role, created_at_ms FROM users WHERE id = ?',
    args: [userId],
  });
  const ligne = resultat.rows[0];
  if (!ligne) return null;
  return {
    id: texte(ligne.id) ?? userId,
    nom: texte(ligne.display_name) ?? '',
    email: texte(ligne.email_normalized) ?? '',
    role: texte(ligne.role) ?? 'student',
    membreDepuisMs: entier(ligne.created_at_ms) ?? 0,
    preferences: await lirePreferences(db, userId),
  };
}

export type ResultatNom = { ok: true; nom: string } | { ok: false; erreur: string };

/** Le nom est celui des certificats : 2 à 21 caractères, comme dans le prototype. */
export async function enregistrerNom(db: Db, userId: string, nom: string): Promise<ResultatNom> {
  const propre = (nom ?? '').trim().replace(/\s+/g, ' ');
  if (propre.length < LONGUEUR_NOM_MIN || propre.length > LONGUEUR_NOM_MAX) return { ok: false, erreur: 'nom_invalide' };
  const resultat = await db.execute({
    sql: 'UPDATE users SET display_name = ? WHERE id = ?',
    args: [propre, userId],
  });
  if (Number(resultat.rowsAffected ?? 0) !== 1) return { ok: false, erreur: 'compte_introuvable' };
  return { ok: true, nom: propre };
}

export type ResultatCode = { ok: true } | { ok: false; erreur: string };

/**
 * Changement de code secret. L'ancien est exigé : sans lui, un appareil volé
 * laisserait changer le code et verrouiller le propriétaire du compte.
 * Toutes les AUTRES sessions sont révoquées — c'est le comportement attendu
 * après un changement de code, et le prototype le promet (« vos autres
 * appareils devront se reconnecter »).
 */
export async function changerCodeSecret(
  db: Db,
  options: { userId: string; tokenActuel: string; ancienVerifier: string; nouveauVerifier: string; maintenant?: number },
  reglages: { verifierPepper?: string; verifierIterations?: number } = {}
): Promise<ResultatCode> {
  const maintenant = options.maintenant ?? Date.now();
  if (!isClientVerifier(options.ancienVerifier) || !isClientVerifier(options.nouveauVerifier)) {
    return { ok: false, erreur: 'code_invalide' };
  }
  const resultat = await db.execute({
    sql: 'SELECT password_hash FROM users WHERE id = ?',
    args: [options.userId],
  });
  const stocke = texte(resultat.rows[0]?.password_hash);
  if (!stocke) return { ok: false, erreur: 'compte_introuvable' };

  const verification = await verifyClientVerifier(options.ancienVerifier, stocke, reglages);
  if (!verification.ok) return { ok: false, erreur: 'code_actuel_incorrect' };

  const nouveau = await hashClientVerifier(options.nouveauVerifier, reglages);
  await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [nouveau, options.userId] });
  await db.execute({ sql: 'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', args: [options.userId, options.tokenActuel] });
  return { ok: true };
}

/** La photo de profil : une clé de stockage, jamais une adresse publique. */
export async function definirPhoto(db: Db, userId: string, cle: string | null, maintenant = Date.now()): Promise<void> {
  if (cle === null) {
    await supprimerPreference(db, userId, 'photo.cle');
    return;
  }
  await ecrirePreference(db, userId, 'photo.cle', cle, maintenant);
}

/** Les notifications ne partent pas à quelqu'un qui les a coupées — sauf la sécurité. */
export async function notificationsAcceptees(db: Db, userId: string, kind: string): Promise<boolean> {
  if (kind === 'security') return true;
  const preferences = await lirePreferences(db, userId);
  return preferences.notifications;
}
