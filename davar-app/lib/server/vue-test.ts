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
import { hashPassword, type Db, type SessionUser } from './auth-core.ts';
import { libellesDesRoles, normaliserRoles, ROLES, type RoleEquipe } from './equipe.ts';

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
  /** 'student' ou 'staff' — la vue étudiant et les vues d'équipe se lisent pareil. */
  role: string;
  /** Les rôles d'équipe portés par le compte (vide pour la vue étudiant). */
  roles: RoleEquipe[];
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

/**
 * Les comptes de test marqués en base, et eux seuls. Jamais un vrai étudiant,
 * jamais un membre du staff.
 *
 * L'ordre est celui du prototype : la vue étudiant d'abord, puis les vues de
 * l'équipe, rôle par rôle. Le libellé suit le prototype lui aussi : la vue porte
 * le nom du RÔLE qu'on teste — « Vue Coach — Coach (test) » — et non « Vue Équipe ».
 */
export async function listerComptesTest(db: Db): Promise<CompteTest[]> {
  const resultat = await db.execute(
    `SELECT id, display_name, email_normalized, role, staff_roles
     FROM users
     WHERE is_test = 1 AND role <> 'admin' AND status = 'active'`
  );
  const comptes: CompteTest[] = [];
  for (const row of resultat.rows) {
    const id = texte(row.id);
    if (!id) continue;
    const nom = texte(row.display_name) ?? 'Compte test';
    const role = texte(row.role) ?? 'student';
    const roles = normaliserRoles(texte(row.staff_roles));
    const titre = role === 'student' ? 'Étudiant' : libellesDesRoles(roles).join(' · ') || 'Équipe';
    comptes.push({
      id,
      nom,
      courriel: texte(row.email_normalized) ?? '',
      libelle: `Vue ${titre} — ${nom}`,
      roles,
      role,
    });
  }
  return comptes.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'student' ? -1 : 1;
    const rangA = a.roles.length ? ROLES.indexOf(a.roles[0]) : ROLES.length;
    const rangB = b.roles.length ? ROLES.indexOf(b.roles[0]) : ROLES.length;
    if (rangA !== rangB) return rangA - rangB;
    return a.nom.localeCompare(b.nom, 'fr');
  });
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

/* ------------------------------------------------------------------ comptes de test
 *
 * Le prototype fournit, dans ses données, UN compte de test par rôle :
 * `u-test-etudiant`, `u-test-coach`, `u-test-correcteur`, `u-test-assistant`,
 * `u-test-contenu`, `u-test-support`, `u-test-analyste`, `u-test-manager`.
 * « Tester une vue » ouvre ces comptes-là, et rien d'autre.
 *
 * Ici, ces comptes ne sont plus des données en dur : ils se CRÉENT dans la base,
 * marqués `is_test = 1`, avec les rôles qui vont bien — pour que le propriétaire
 * voie exactement le périmètre d'un coach, d'un correcteur, d'un manager…
 *
 * Deux garanties :
 *   - ces comptes ne peuvent PAS être connectés : leur empreinte de code secret
 *     est calculée sur un secret aléatoire jetable, en une seule itération (donc
 *     instantanée) — personne, pas même nous, ne peut produire la clé qui ouvre ;
 *   - ils ne comptent dans aucun chiffre (is_test = 1), et les retirer efface
 *     TOUT ce qu'ils auraient laissé derrière eux.
 */

export type CompteTestModele = {
  id: string;
  nom: string;
  courriel: string;
  role: 'student' | 'staff';
  roles: string;
};

/** Les huit comptes du prototype, avec ses propres noms et adresses. */
export const COMPTES_TEST: CompteTestModele[] = [
  { id: 'u-test-etudiant', nom: 'Étudiant (test)', courriel: 'etudiant.test@davarcampus.co', role: 'student', roles: '' },
  { id: 'u-test-coach', nom: 'Coach (test)', courriel: 'coach.test@davarcampus.co', role: 'staff', roles: 'coach' },
  { id: 'u-test-correcteur', nom: 'Correcteur (test)', courriel: 'correcteur.test@davarcampus.co', role: 'staff', roles: 'correcteur' },
  { id: 'u-test-assistant', nom: 'Assistant (test)', courriel: 'assistant.test@davarcampus.co', role: 'staff', roles: 'assistant' },
  { id: 'u-test-contenu', nom: 'Contenu (test)', courriel: 'contenu.test@davarcampus.co', role: 'staff', roles: 'contenu' },
  { id: 'u-test-support', nom: 'Support (test)', courriel: 'support.test@davarcampus.co', role: 'staff', roles: 'support' },
  { id: 'u-test-analyste', nom: 'Analyste (test)', courriel: 'analyste.test@davarcampus.co', role: 'staff', roles: 'analyste' },
  { id: 'u-test-manager', nom: 'Manager (test)', courriel: 'manager.test@davarcampus.co', role: 'staff', roles: 'manager' },
];

/**
 * Empreinte de code secret qu'AUCUN mot de passe n'ouvre : elle est calculée sur
 * 32 octets aléatoires que personne ne garde. Une itération suffit — il n'y a
 * rien à protéger, seulement à rendre la connexion impossible sans coûter de CPU.
 */
async function empreinteJetable(): Promise<string> {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const enBase64 = btoa(String.fromCharCode(...secret)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return hashPassword(`compte-de-test:${enBase64}`, 1);
}

export type ResultatComptesTest = { crees: number; total: number; comptes: CompteTest[] };

/** Crée les comptes de test manquants. Rejouer l'opération ne crée jamais de doublon. */
export async function creerComptesTest(db: Db, maintenant = Date.now()): Promise<ResultatComptesTest> {
  let crees = 0;
  for (const modele of COMPTES_TEST) {
    const existant = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [modele.id] });
    if (existant.rows.length > 0) continue;
    await db.execute({
      sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test,staff_roles,kdf_scheme)
            VALUES (?,?,?,?,?,?,'active',?,1,?, 'client-v1')`,
      args: [modele.id, modele.courriel, modele.nom, await empreinteJetable(), maintenant, modele.role, maintenant, modele.roles],
    });
    crees += 1;
  }
  return { crees, total: COMPTES_TEST.length, comptes: await listerComptesTest(db) };
}

/**
 * Ordre de suppression : les tables qui DÉPENDENT des autres d'abord, `users` en
 * dernier. L'ordre est calculé depuis les clés étrangères réellement déclarées,
 * et non écrit à la main : une table ajoutée plus tard reste couverte.
 */
async function ordreDeSuppression(db: Db): Promise<Array<{ table: string; colonnes: string[] }>> {
  const noms = (
    await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  ).rows.map((row) => String(row.name));
  const parents = new Map<string, string[]>();
  const versUsers = new Map<string, string[]>();
  for (const table of noms) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) continue;
    const fk = await db.execute(`PRAGMA foreign_key_list('${table}')`);
    for (const ligne of fk.rows) {
      const parent = String(ligne.table);
      parents.set(table, [...(parents.get(table) ?? []), parent]);
      if (parent === 'users') versUsers.set(table, [...(versUsers.get(table) ?? []), String(ligne.from)]);
    }
  }
  const ordre: string[] = [];
  const vus = new Set<string>();
  const visiter = (table: string) => {
    if (vus.has(table)) return;
    vus.add(table);
    // Les enfants de cette table passent avant elle.
    for (const [enfant, sesParents] of parents) if (sesParents.includes(table)) visiter(enfant);
    if (table !== 'users') ordre.push(table);
  };
  visiter('users');
  // Les tables sans lien vers `users` n'ont rien à faire ici ; on n'y touche pas.
  return ordre
    .filter((table) => versUsers.has(table))
    .map((table) => ({ table, colonnes: [...new Set(versUsers.get(table) ?? [])] }));
}

/** Retire UNIQUEMENT les comptes de test du prototype, et tout ce qu'ils ont laissé. */
export async function supprimerComptesTest(db: Db): Promise<{ supprimes: number }> {
  const ids = COMPTES_TEST.map((modele) => modele.id);
  const presents = (await db.execute({
    sql: `SELECT id FROM users WHERE is_test = 1 AND id IN (${ids.map(() => '?').join(',')})`,
    args: ids,
  })).rows.map((row) => String(row.id));
  if (presents.length === 0) return { supprimes: 0 };

  const marques = presents.map(() => '?').join(',');
  // Les dépendances d'abord (progression, réponses, préférences, sessions, avis…),
  // le compte ensuite : aucune ligne orpheline ne reste derrière.
  for (const { table, colonnes } of await ordreDeSuppression(db)) {
    for (const colonne of colonnes) {
      await db.execute({ sql: `DELETE FROM ${table} WHERE ${colonne} IN (${marques})`, args: presents });
    }
  }
  await db.execute({ sql: `DELETE FROM users WHERE id IN (${marques}) AND is_test = 1`, args: presents });
  return { supprimes: presents.length };
}
