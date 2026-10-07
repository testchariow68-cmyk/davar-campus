/**
 * VUE TEST — règle du propriétaire, 6 octobre 2026 :
 *   « les comptes de test restent, réservés à moi seul en Super Admin ; ils ne doivent
 *     jamais apparaître dans l'application ; personne d'autre ne les voit ».
 *
 * Reprise fidèle de `views-admin.js` du prototype :
 *   - `viewAsList()` n'offre QUE des comptes de test ;
 *   - `viewAs()` refuse toute autre cible : « La vue test n'ouvre que des comptes test —
 *     jamais le fondateur ni une vraie personne. » ;
 *   - la personne réelle garde tous ses droits, et revient par « Quitter » ou Échap ;
 *   - le Super Admin a TOUJOURS le test de vue ; le Manager seulement si la configuration
 *     l'autorise — cet écran n'existant pas encore, l'accès est fermé par défaut.
 *
 * Ce fichier vit côté serveur : la liste des comptes de test et l'ouverture d'une vue ne
 * transitent jamais par le navigateur d'un étudiant.
 */
import type { Db, SessionUser } from './auth-core';

/**
 * Nom du cookie qui retient la vue test ouverte. Il vit dans ce fichier — et non dans
 * celui qui parle à Next — pour que les règles ci-dessous soient testables sans Next.
 */
export const COOKIE_VUE_TEST = 'davar_vue_test';

export type CompteTest = {
  id: string;
  nom: string;
  courriel: string;
  /** Libellé de la vue, tel que le prototype l'affichait : « Vue Étudiant — … ». */
  libelle: string;
};

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

/**
 * Qui a droit à la vue test. Le Super Admin, toujours. Le Manager, jamais pour l'instant :
 * le prototype le conditionne à `S.settings.managerViewAs`, un écran de configuration qui
 * n'existe pas encore dans l'application — donc fermé, par principe de moindre privilège.
 */
export function peutTesterUneVue(user: Pick<SessionUser, 'role'>): boolean {
  return user.role === 'admin';
}

/** Les comptes de test marqués en base, et eux seuls. Jamais un vrai étudiant, jamais un membre du staff. */
export async function listerComptesTest(db: Db): Promise<CompteTest[]> {
  const resultat = await db.execute(
    `SELECT id, display_name, email_normalized, role
     FROM users
     WHERE is_test = 1 AND role <> 'admin' AND status = 'active'
     ORDER BY role, display_name`
  );
  const comptes: CompteTest[] = [];
  for (const row of resultat.rows) {
    const id = texte(row.id);
    if (!id) continue;
    const nom = texte(row.display_name) ?? 'Compte test';
    const role = texte(row.role) ?? 'student';
    comptes.push({
      id,
      nom,
      courriel: texte(row.email_normalized) ?? '',
      libelle: `${role === 'student' ? 'Vue Étudiant' : 'Vue Équipe'} — ${nom}`,
    });
  }
  return comptes;
}

/**
 * Une cible est légitime si elle est marquée `is_test`, active, et jamais un compte
 * d'administration, ni la personne réelle elle-même. Le fondateur étant le seul
 * Super Admin, il ne peut donc jamais se retrouver en vue test.
 */
export async function cibleAutorisee(
  db: Db,
  reel: SessionUser,
  cibleId: string
): Promise<SessionUser | null> {
  if (!peutTesterUneVue(reel)) return null;
  if (typeof cibleId !== 'string' || cibleId.length < 3 || cibleId.length > 120) return null;
  if (cibleId === reel.id) return null;
  const resultat = await db.execute({
    sql: `SELECT id, email_normalized, display_name, role, email_verified_at_ms
          FROM users
          WHERE id = ? AND is_test = 1 AND role <> 'admin' AND status = 'active'`,
    args: [cibleId],
  });
  const row = resultat.rows[0];
  if (!row) return null;
  const id = texte(row.id);
  if (!id) return null;
  return {
    id,
    email: texte(row.email_normalized) ?? '',
    displayName: texte(row.display_name) ?? 'Compte test',
    role: (texte(row.role) ?? 'student') as SessionUser['role'],
    emailVerified: entier(row.email_verified_at_ms) !== null,
    sessionExpiresAtMs: reel.sessionExpiresAtMs,
  };
}
