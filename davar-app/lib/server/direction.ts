/**
 * ESPACE DIRECTION — ce que le propriétaire peut réellement faire.
 *
 * Pourquoi ce module existe : le campus n'avait aucune interface d'administration.
 * Le rôle « admin » était stocké mais ne servait à rien : un propriétaire ne pouvait
 * ni publier une formation, ni bâtir ses modules et ses leçons, ni nommer son équipe.
 * Tout ce qui suit est donc l'outillage de direction, avec trois règles non négociables :
 *
 *  1. AUCUN CONTENU D'EXEMPLE. La plateforme démarre vide : le propriétaire écrit
 *     ses propres formations, ses propres modules, ses propres leçons.
 *  2. UNE VENTE EST UNE PIÈCE COMPTABLE. Une formation achetée ne se supprime jamais
 *     (elle se dépublie) ; une leçon déjà terminée par un étudiant non plus, sous
 *     peine de réinitialiser silencieusement sa progression — l'interdit du projet.
 *  3. UN PROPRIÉTAIRE UNIQUE. Élever un second administrateur est refusé tant que
 *     le premier n'a pas été rétrogradé.
 *
 * Ce fichier ne dépend pas de Next.js : il reçoit la base et les identifiants, ce qui
 * le rend éprouvable directement (`npm test`).
 */
import { newId, normalizeEmail, type Db } from './auth-core.ts';

const texte = (valeur: unknown) => (valeur == null ? '' : String(valeur));
const nombre = (valeur: unknown) => (valeur == null ? 0 : Number(valeur));
const bool = (valeur: unknown) => nombre(valeur) === 1;

export type Resultat = { ok: true; message: string } | { ok: false; erreur: string };

const echec = (erreur: string): Resultat => ({ ok: false, erreur });

/* ------------------------------------------------------------------ vue d'ensemble */

export type VueEnsemble = {
  comptesTest: number;
  etudiants: number;
  etudiantsConfirmes: number;
  etudiantsSuspendus: number;
  membres: number;
  proprietaires: number;
  acces: number;
  accesVendus: number;
  accesAccordes: number;
  achats: number;
  formations: number;
  formationsPubliees: number;
  modules: number;
  lecons: number;
  leconsSansRessource: number;
  leconsTerminees: number;
  derniereInscriptionMs: number | null;
};

export async function vueEnsemble(db: Db): Promise<VueEnsemble> {
  const compter = async (sql: string, args: unknown[] = []): Promise<number> => {
    const resultat = await db.execute({ sql, args });
    return nombre(resultat.rows[0]?.n);
  };
  const [
    comptesTest, etudiants, etudiantsConfirmes, etudiantsSuspendus, membres, proprietaires,
    acces, accesVendus, accesAccordes, achats, formations, formationsPubliees,
    modules, lecons, leconsSansRessource, leconsTerminees,
  ] = await Promise.all([
    // Les comptes de TEST n'entrent dans aucun chiffre réel : un test ne doit
    // jamais gonfler un compteur de la plateforme (décision du 6 octobre 2026).
    compter('SELECT COUNT(*) AS n FROM users WHERE is_test=1'),
    compter("SELECT COUNT(*) AS n FROM users WHERE role='student' AND is_test=0"),
    compter("SELECT COUNT(*) AS n FROM users WHERE role='student' AND is_test=0 AND email_verified_at_ms IS NOT NULL"),
    compter("SELECT COUNT(*) AS n FROM users WHERE role='student' AND is_test=0 AND status='suspended'"),
    compter("SELECT COUNT(*) AS n FROM users WHERE role<>'student' AND is_test=0"),
    compter("SELECT COUNT(*) AS n FROM users WHERE role='admin'"),
    compter('SELECT COUNT(*) AS n FROM enrollments'),
    compter("SELECT COUNT(*) AS n FROM enrollments WHERE source='verified_purchase'"),
    compter("SELECT COUNT(*) AS n FROM enrollments WHERE source='staff_grant'"),
    compter('SELECT COUNT(*) AS n FROM verified_purchases'),
    compter('SELECT COUNT(*) AS n FROM trainings'),
    compter('SELECT COUNT(*) AS n FROM trainings WHERE published=1'),
    compter('SELECT COUNT(*) AS n FROM course_modules'),
    compter('SELECT COUNT(*) AS n FROM course_lessons'),
    compter('SELECT COUNT(*) AS n FROM course_lessons WHERE resource_url IS NULL'),
    compter('SELECT COUNT(*) AS n FROM lesson_completions'),
  ]);
  const derniere = await db.execute("SELECT MAX(created_at_ms) AS d FROM users WHERE role='student' AND is_test=0");
  const derniereInscriptionMs = derniere.rows[0]?.d == null ? null : nombre(derniere.rows[0].d);
  return {
    comptesTest, etudiants, etudiantsConfirmes, etudiantsSuspendus, membres, proprietaires,
    acces, accesVendus, accesAccordes, achats, formations, formationsPubliees,
    modules, lecons, leconsSansRessource, leconsTerminees, derniereInscriptionMs,
  };
}

/* --------------------------------------------------------------------- formations */

export type Formation = {
  id: string;
  title: string;
  description: string;
  priceCfa: number;
  chariowProductId: string;
  buyUrl: string;
  published: boolean;
  modules: number;
  lecons: number;
  inscrits: number;
  acheteurs: number;
};

async function lireFormation(db: Db, ligne: Record<string, unknown>): Promise<Formation> {
  const id = texte(ligne.id);
  const [structure, inscrits, acheteurs] = await Promise.all([
    db.execute({
      sql: `SELECT (SELECT COUNT(*) FROM course_modules WHERE training_id=?) AS modules,
                   (SELECT COUNT(*) FROM course_lessons l JOIN course_modules m ON m.id=l.module_id WHERE m.training_id=?) AS lecons`,
      args: [id, id],
    }),
    db.execute({ sql: 'SELECT COUNT(*) AS n FROM enrollments WHERE training_id=?', args: [id] }),
    db.execute({ sql: 'SELECT COUNT(*) AS n FROM verified_purchases WHERE training_id=?', args: [id] }),
  ]);
  return {
    id,
    title: texte(ligne.title),
    description: texte(ligne.description),
    priceCfa: nombre(ligne.price_cfa),
    chariowProductId: texte(ligne.chariow_product_id),
    buyUrl: texte(ligne.buy_url),
    published: bool(ligne.published),
    modules: nombre(structure.rows[0]?.modules),
    lecons: nombre(structure.rows[0]?.lecons),
    inscrits: nombre(inscrits.rows[0]?.n),
    acheteurs: nombre(acheteurs.rows[0]?.n),
  };
}

export async function listerFormations(db: Db): Promise<Formation[]> {
  const resultat = await db.execute(
    'SELECT id,title,description,price_cfa,chariow_product_id,buy_url,published FROM trainings ORDER BY published DESC, title'
  );
  return Promise.all(resultat.rows.map((ligne) => lireFormation(db, ligne)));
}

export async function lireUneFormation(db: Db, id: string): Promise<Formation | null> {
  const resultat = await db.execute({
    sql: 'SELECT id,title,description,price_cfa,chariow_product_id,buy_url,published FROM trainings WHERE id=?',
    args: [id],
  });
  if (!resultat.rows.length) return null;
  return lireFormation(db, resultat.rows[0]);
}

/** Identifiant lisible et stable : « t-orateur », jamais un identifiant opaque. */
export function identifiantFormation(titre: string): string {
  const base = titre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `t-${base || newId('f')}`;
}

export type ChampsFormation = {
  titre: string;
  description: string;
  prixCfa: number;
  chariowProductId: string;
  buyUrl: string;
};

/** Contrôles communs : un titre et un prix sont obligatoires, le reste est libre. */
function validerFormation(champs: Partial<ChampsFormation>): { ok: true; valeur: ChampsFormation } | { ok: false; erreur: string } {
  const titre = (champs.titre ?? '').trim();
  if (titre.length < 3 || titre.length > 120) return { ok: false, erreur: 'titre_invalide' };
  const description = (champs.description ?? '').trim().slice(0, 600);
  const prixCfa = Number(champs.prixCfa ?? 0);
  if (!Number.isInteger(prixCfa) || prixCfa < 0 || prixCfa > 100_000_000) return { ok: false, erreur: 'prix_invalide' };
  const chariowProductId = (champs.chariowProductId ?? '').trim().slice(0, 80);
  const buyUrl = (champs.buyUrl ?? '').trim().slice(0, 400);
  if (buyUrl && !/^https:\/\//i.test(buyUrl)) return { ok: false, erreur: 'lien_non_https' };
  return { ok: true, valeur: { titre, description, prixCfa, chariowProductId, buyUrl } };
}

export async function creerFormation(db: Db, champs: Partial<ChampsFormation>): Promise<Resultat> {
  const valide = validerFormation(champs);
  if (!valide.ok) return echec(valide.erreur);
  const id = identifiantFormation(valide.valeur.titre);
  const existe = await db.execute({ sql: 'SELECT 1 FROM trainings WHERE id=?', args: [id] });
  if (existe.rows.length) return echec('identifiant_deja_pris');
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published,description,buy_url)
          VALUES (?,?,?,?,0,?,?)`,
    args: [
      id,
      valide.valeur.titre,
      valide.valeur.prixCfa,
      valide.valeur.chariowProductId || null,
      valide.valeur.description || null,
      valide.valeur.buyUrl || null,
    ],
  });
  return { ok: true, message: `Formation créée : « ${valide.valeur.titre} » — elle reste fermée tant que vous ne l'ouvrez pas.` };
}

export async function modifierFormation(db: Db, id: string, champs: Partial<ChampsFormation>): Promise<Resultat> {
  const valide = validerFormation(champs);
  if (!valide.ok) return echec(valide.erreur);
  const resultat = await db.execute({
    sql: `UPDATE trainings SET title=?, description=?, price_cfa=?, chariow_product_id=?, buy_url=? WHERE id=?`,
    args: [
      valide.valeur.titre,
      valide.valeur.description || null,
      valide.valeur.prixCfa,
      valide.valeur.chariowProductId || null,
      valide.valeur.buyUrl || null,
      id,
    ],
  });
  if (!resultat.rowsAffected) return echec('formation_introuvable');
  return { ok: true, message: 'Formation enregistrée.' };
}

/**
 * Ouvrir ou fermer une formation. Ouvrir une formation sans leçon serait un piège :
 * l'étudiant paierait pour une page vide. On refuse, avec le compte exact.
 */
export async function publierFormation(db: Db, id: string, publie: boolean): Promise<Resultat> {
  if (publie) {
    const contenu = await db.execute({
      sql: `SELECT (SELECT COUNT(*) FROM course_modules WHERE training_id=?) AS modules,
                   (SELECT COUNT(*) FROM course_lessons l JOIN course_modules m ON m.id=l.module_id WHERE m.training_id=?) AS lecons`,
      args: [id, id],
    });
    const lecons = nombre(contenu.rows[0]?.lecons);
    if (lecons === 0)
      return echec('aucune_lecon : ajoutez au moins une leçon avant d’ouvrir cette formation, sinon l’étudiant paierait pour une page vide.');
  }
  const resultat = await db.execute({ sql: 'UPDATE trainings SET published=? WHERE id=?', args: [publie ? 1 : 0, id] });
  if (!resultat.rowsAffected) return echec('formation_introuvable');
  return {
    ok: true,
    message: publie ? 'Formation ouverte à la vente.' : 'Formation fermée : elle reste dans votre direction, invisible du public.',
  };
}

/** Supprimer n'est permis que sans aucun étudiant : une vente est une pièce comptable. */
export async function supprimerFormation(db: Db, id: string): Promise<Resultat> {
  const compte = await db.execute({
    sql: `SELECT (SELECT COUNT(*) FROM enrollments WHERE training_id=?) AS inscrits,
                 (SELECT COUNT(*) FROM verified_purchases WHERE training_id=?) AS achats`,
    args: [id, id],
  });
  const inscrits = nombre(compte.rows[0]?.inscrits);
  const achats = nombre(compte.rows[0]?.achats);
  if (inscrits || achats)
    return echec(
      `suppression_refusee : ${inscrits} accès et ${achats} achat(s) sont rattachés à cette formation. Une vente est une pièce comptable : fermez-la au lieu de la supprimer.`
    );
  const lecons = await db.execute({
    sql: 'SELECT l.id FROM course_lessons l JOIN course_modules m ON m.id=l.module_id WHERE m.training_id=?',
    args: [id],
  });
  const instructions = [
    ...lecons.rows.map((ligne) => ({ sql: 'DELETE FROM lesson_completions WHERE lesson_id=?', args: [texte(ligne.id)] })),
    { sql: 'DELETE FROM course_lessons WHERE module_id IN (SELECT id FROM course_modules WHERE training_id=?)', args: [id] },
    { sql: 'DELETE FROM course_modules WHERE training_id=?', args: [id] },
    { sql: 'DELETE FROM trainings WHERE id=?', args: [id] },
  ];
  await db.batch(instructions, 'write');
  return { ok: true, message: 'Formation supprimée (elle n’avait ni étudiant ni achat).' };
}

/* ------------------------------------------------------------ modules et leçons */

export type Lecon = {
  id: string;
  position: number;
  title: string;
  kind: string;
  resourceUrl: string;
  durationMin: number | null;
  content: string;
  terminees: number;
};
export type Module = { id: string; position: number; title: string; summary: string; lecons: Lecon[] };

export async function lireStructure(db: Db, formationId: string): Promise<Module[]> {
  const modules = await db.execute({
    sql: 'SELECT id,position,title,summary FROM course_modules WHERE training_id=? ORDER BY position',
    args: [formationId],
  });
  const lecons = await db.execute({
    sql: `SELECT l.id, l.module_id, l.position, l.title, l.kind, l.resource_url, l.duration_min, l.content_text,
                 (SELECT COUNT(*) FROM lesson_completions c WHERE c.lesson_id=l.id) AS terminees
          FROM course_lessons l JOIN course_modules m ON m.id=l.module_id
          WHERE m.training_id=? ORDER BY l.position`,
    args: [formationId],
  });
  return modules.rows.map((module) => ({
    id: texte(module.id),
    position: nombre(module.position),
    title: texte(module.title),
    summary: texte(module.summary),
    lecons: lecons.rows
      .filter((lecon) => texte(lecon.module_id) === texte(module.id))
      .map((lecon) => ({
        id: texte(lecon.id),
        position: nombre(lecon.position),
        title: texte(lecon.title),
        kind: texte(lecon.kind),
        content: texte(lecon.content_text) ?? '',
        resourceUrl: texte(lecon.resource_url),
        durationMin: lecon.duration_min == null ? null : nombre(lecon.duration_min),
        terminees: nombre(lecon.terminees),
      })),
  }));
}

/** Réordonnancement sûr malgré la contrainte d'unicité : décalage puis placement final. */
async function reordonner(
  db: Db,
  table: 'course_modules' | 'course_lessons',
  colonne: 'training_id' | 'module_id',
  parentId: string,
  ordre: string[],
  decalage: number
): Promise<void> {
  await db.batch(
    [
      { sql: `UPDATE ${table} SET position = position + ${decalage} WHERE ${colonne}=?`, args: [parentId] },
      ...ordre.map((id, index) => ({ sql: `UPDATE ${table} SET position=? WHERE id=?`, args: [index + 1, id] })),
    ],
    'write'
  );
}

async function ordreActuel(db: Db, table: 'course_modules' | 'course_lessons', colonne: string, parentId: string): Promise<string[]> {
  const resultat = await db.execute({
    sql: `SELECT id FROM ${table} WHERE ${colonne}=? ORDER BY position`,
    args: [parentId],
  });
  return resultat.rows.map((ligne) => texte(ligne.id));
}

export async function ajouterModule(db: Db, formationId: string, titre: string, resume = ''): Promise<Resultat> {
  const propre = titre.trim();
  if (propre.length < 2 || propre.length > 120) return echec('titre_invalide');
  const existe = await db.execute({ sql: 'SELECT 1 FROM trainings WHERE id=?', args: [formationId] });
  if (!existe.rows.length) return echec('formation_introuvable');
  const suivant = await db.execute({
    sql: 'SELECT COALESCE(MAX(position),0)+1 AS p FROM course_modules WHERE training_id=?',
    args: [formationId],
  });
  const id = newId('mod');
  await db.execute({
    sql: 'INSERT INTO course_modules(id,training_id,position,title,summary) VALUES (?,?,?,?,?)',
    args: [id, formationId, nombre(suivant.rows[0]?.p), propre, resume.trim().slice(0, 300) || null],
  });
  return { ok: true, message: `Module ajouté : « ${propre} ».` };
}

export async function modifierModule(db: Db, moduleId: string, titre: string, resume = ''): Promise<Resultat> {
  const propre = titre.trim();
  if (propre.length < 2 || propre.length > 120) return echec('titre_invalide');
  const resultat = await db.execute({
    sql: 'UPDATE course_modules SET title=?, summary=? WHERE id=?',
    args: [propre, resume.trim().slice(0, 300) || null, moduleId],
  });
  if (!resultat.rowsAffected) return echec('module_introuvable');
  return { ok: true, message: 'Module enregistré.' };
}

export async function supprimerModule(db: Db, moduleId: string): Promise<Resultat> {
  const progresse = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM lesson_completions c
          JOIN course_lessons l ON l.id=c.lesson_id WHERE l.module_id=?`,
    args: [moduleId],
  });
  const terminees = nombre(progresse.rows[0]?.n);
  if (terminees)
    return echec(
      `progression_protegee : ${terminees} leçon(s) de ce module ont déjà été terminées par des étudiants. Les supprimer effacerait leur progression sans le leur dire — ce que le projet interdit.`
    );
  const module = await db.execute({ sql: 'SELECT training_id FROM course_modules WHERE id=?', args: [moduleId] });
  if (!module.rows.length) return echec('module_introuvable');
  await db.batch(
    [
      { sql: 'DELETE FROM course_lessons WHERE module_id=?', args: [moduleId] },
      { sql: 'DELETE FROM course_modules WHERE id=?', args: [moduleId] },
    ],
    'write'
  );
  const ordre = await ordreActuel(db, 'course_modules', 'training_id', texte(module.rows[0].training_id));
  if (ordre.length) await reordonner(db, 'course_modules', 'training_id', texte(module.rows[0].training_id), ordre, 1000);
  return { ok: true, message: 'Module supprimé.' };
}

export async function deplacerModule(db: Db, moduleId: string, sens: 'haut' | 'bas'): Promise<Resultat> {
  const module = await db.execute({ sql: 'SELECT training_id FROM course_modules WHERE id=?', args: [moduleId] });
  if (!module.rows.length) return echec('module_introuvable');
  const parent = texte(module.rows[0].training_id);
  const ordre = await ordreActuel(db, 'course_modules', 'training_id', parent);
  const index = ordre.indexOf(moduleId);
  const cible = sens === 'haut' ? index - 1 : index + 1;
  if (index < 0 || cible < 0 || cible >= ordre.length) return { ok: true, message: 'Déjà en position.' };
  [ordre[index], ordre[cible]] = [ordre[cible], ordre[index]];
  await reordonner(db, 'course_modules', 'training_id', parent, ordre, 1000);
  return { ok: true, message: 'Ordre mis à jour.' };
}

const TYPES_LECON = ['video', 'text', 'exercise', 'live'];

/**
 * Le texte d'une leçon : c'est ce que l'assistant lit pour répondre sans réciter.
 * Borné volontairement — un extrait utile, pas un livre entier dans chaque réponse.
 */
const LONGUEUR_CONTENU_MAX = 6000;

function texteContenu(valeur: string): string | null {
  const propre = (valeur ?? '').trim();
  if (propre.length === 0) return null;
  return propre.slice(0, LONGUEUR_CONTENU_MAX);
}

export async function ajouterLecon(
  db: Db,
  moduleId: string,
  titre: string,
  type: string,
  duree: number | null,
  ressource: string,
  contenu = ''
): Promise<Resultat> {
  const propre = titre.trim();
  if (propre.length < 2 || propre.length > 160) return echec('titre_invalide');
  const genre = TYPES_LECON.includes(type) ? type : 'video';
  const minutes = duree == null || duree === 0 ? null : Number(duree);
  if (minutes !== null && (!Number.isInteger(minutes) || minutes <= 0 || minutes > 600)) return echec('duree_invalide');
  const url = ressource.trim().slice(0, 500);
  if (url && !/^https:\/\//i.test(url)) return echec('ressource_non_https');
  const existe = await db.execute({ sql: 'SELECT 1 FROM course_modules WHERE id=?', args: [moduleId] });
  if (!existe.rows.length) return echec('module_introuvable');
  const suivant = await db.execute({
    sql: 'SELECT COALESCE(MAX(position),0)+1 AS p FROM course_lessons WHERE module_id=?',
    args: [moduleId],
  });
  await db.execute({
    sql: 'INSERT INTO course_lessons(id,module_id,position,title,kind,resource_url,duration_min,content_text) VALUES (?,?,?,?,?,?,?,?)',
    args: [newId('les'), moduleId, nombre(suivant.rows[0]?.p), propre, genre, url || null, minutes, texteContenu(contenu)],
  });
  return {
    ok: true,
    message: url ? `Leçon ajoutée : « ${propre} ».` : `Leçon ajoutée : « ${propre} ». Sans adresse de ressource, l’étudiant lira honnêtement « Ressource pas encore publiée ».`,
  };
}

export async function modifierLecon(
  db: Db,
  leconId: string,
  titre: string,
  type: string,
  duree: number | null,
  ressource: string,
  contenu = ''
): Promise<Resultat> {
  const propre = titre.trim();
  if (propre.length < 2 || propre.length > 160) return echec('titre_invalide');
  const genre = TYPES_LECON.includes(type) ? type : 'video';
  const minutes = duree == null || duree === 0 ? null : Number(duree);
  if (minutes !== null && (!Number.isInteger(minutes) || minutes <= 0 || minutes > 600)) return echec('duree_invalide');
  const url = ressource.trim().slice(0, 500);
  if (url && !/^https:\/\//i.test(url)) return echec('ressource_non_https');
  const resultat = await db.execute({
    sql: 'UPDATE course_lessons SET title=?, kind=?, resource_url=?, duration_min=?, content_text=? WHERE id=?',
    args: [propre, genre, url || null, minutes, texteContenu(contenu), leconId],
  });
  if (!resultat.rowsAffected) return echec('lecon_introuvable');
  return { ok: true, message: 'Leçon enregistrée.' };
}

export async function supprimerLecon(db: Db, leconId: string): Promise<Resultat> {
  const progres = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM lesson_completions WHERE lesson_id=?',
    args: [leconId],
  });
  const terminees = nombre(progres.rows[0]?.n);
  if (terminees)
    return echec(
      `progression_protegee : ${terminees} étudiant(s) ont déjà terminé cette leçon. La supprimer effacerait leur progression sans le leur dire — ce que le projet interdit. Renommez-la ou remplacez sa ressource.`
    );
  const lecon = await db.execute({ sql: 'SELECT module_id FROM course_lessons WHERE id=?', args: [leconId] });
  if (!lecon.rows.length) return echec('lecon_introuvable');
  await db.execute({ sql: 'DELETE FROM course_lessons WHERE id=?', args: [leconId] });
  const parent = texte(lecon.rows[0].module_id);
  const ordre = await ordreActuel(db, 'course_lessons', 'module_id', parent);
  if (ordre.length) await reordonner(db, 'course_lessons', 'module_id', parent, ordre, 1000);
  return { ok: true, message: 'Leçon supprimée.' };
}

export async function deplacerLecon(db: Db, leconId: string, sens: 'haut' | 'bas'): Promise<Resultat> {
  const lecon = await db.execute({ sql: 'SELECT module_id FROM course_lessons WHERE id=?', args: [leconId] });
  if (!lecon.rows.length) return echec('lecon_introuvable');
  const parent = texte(lecon.rows[0].module_id);
  const ordre = await ordreActuel(db, 'course_lessons', 'module_id', parent);
  const index = ordre.indexOf(leconId);
  const cible = sens === 'haut' ? index - 1 : index + 1;
  if (index < 0 || cible < 0 || cible >= ordre.length) return { ok: true, message: 'Déjà en position.' };
  [ordre[index], ordre[cible]] = [ordre[cible], ordre[index]];
  await reordonner(db, 'course_lessons', 'module_id', parent, ordre, 1000);
  return { ok: true, message: 'Ordre mis à jour.' };
}

/* ------------------------------------------------------------------------ équipe */

export type Membre = {
  id: string;
  email: string;
  nom: string;
  role: string;
  statut: string;
  confirme: boolean;
  estTest: boolean;
  derniereConnexionMs: number | null;
};

export async function listerEquipe(db: Db): Promise<Membre[]> {
  const resultat = await db.execute(
    `SELECT id,email_normalized,display_name,role,status,email_verified_at_ms,last_login_at_ms,is_test
     FROM users WHERE role<>'student' AND is_test=0 ORDER BY role, email_normalized`
  );
  return resultat.rows.map((ligne) => ({
    id: texte(ligne.id),
    email: texte(ligne.email_normalized),
    nom: texte(ligne.display_name),
    role: texte(ligne.role),
    statut: texte(ligne.status),
    confirme: ligne.email_verified_at_ms != null,
    estTest: bool(ligne.is_test),
    derniereConnexionMs: ligne.last_login_at_ms == null ? null : nombre(ligne.last_login_at_ms),
  }));
}

/**
 * Changer le rôle d'un membre. Règle du projet : le propriétaire est UNIQUE.
 * Rétrograder le dernier administrateur est donc refusé — sans lui, plus personne
 * ne peut diriger la plateforme, et aucun écran ne permettrait de réparer.
 */
export async function definirRole(db: Db, email: string, role: string): Promise<Resultat> {
  if (!['student', 'staff', 'admin'].includes(role)) return echec('role_inconnu');
  const normalise = normalizeEmail(email);
  const utilisateur = await db.execute({
    sql: 'SELECT id,role,display_name FROM users WHERE email_normalized=?',
    args: [normalise],
  });
  if (!utilisateur.rows.length)
    return echec('compte_introuvable : cette personne doit d’abord créer son compte sur le campus.');
  const actuel = texte(utilisateur.rows[0].role);
  if (actuel === role) return { ok: true, message: 'Rôle inchangé.' };
  if (role === 'admin') {
    const autre = await db.execute({
      sql: "SELECT email_normalized FROM users WHERE role='admin' AND email_normalized<>?",
      args: [normalise],
    });
    if (autre.rows.length)
      return echec(`proprietaire_unique : ${texte(autre.rows[0].email_normalized)} dirige déjà la plateforme. Rétrogradez-le d’abord.`);
  }
  if (actuel === 'admin' && role !== 'admin') {
    const nombreAdmins = await db.execute("SELECT COUNT(*) AS n FROM users WHERE role='admin'");
    if (nombre(nombreAdmins.rows[0]?.n) <= 1)
      return echec('dernier_proprietaire : la plateforme n’aurait plus personne pour la diriger.');
  }
  await db.execute({ sql: 'UPDATE users SET role=? WHERE id=?', args: [role, texte(utilisateur.rows[0].id)] });
  const libelle = role === 'admin' ? 'propriétaire' : role === 'staff' ? 'membre du staff' : 'étudiant';
  return { ok: true, message: `${texte(utilisateur.rows[0].display_name)} est désormais ${libelle}.` };
}

/**
 * Marquer un compte comme COMPTE DE TEST, ou le remettre parmi les comptes réels.
 * Pourquoi : le propriétaire ne veut pas voir le campus avec le compte d'une
 * personne réelle. Un compte de test sert à regarder les écrans ; il est donc
 * marqué, et il est exclu des chiffres réels de la plateforme.
 */
export async function basculerCompteTest(db: Db, email: string, estTest: boolean): Promise<Resultat> {
  const normalise = normalizeEmail(email);
  const utilisateur = await db.execute({
    sql: 'SELECT id, display_name, role FROM users WHERE email_normalized=?',
    args: [normalise],
  });
  if (!utilisateur.rows.length) return echec('compte_introuvable');
  await db.execute({ sql: 'UPDATE users SET is_test=? WHERE id=?', args: [estTest ? 1 : 0, texte(utilisateur.rows[0].id)] });
  const qui = texte(utilisateur.rows[0].display_name) || normalise;
  return {
    ok: true,
    message: estTest
      ? `${qui} est désormais un compte de test : il ne compte plus dans les chiffres réels.`
      : `${qui} est redevenu un compte réel.`,
  };
}

/* --------------------------------------------------------------------- étudiants */

export type Etudiant = {
  id: string;
  email: string;
  nom: string;
  statut: string;
  confirme: boolean;
  estTest: boolean;
  creeMs: number;
  acces: { trainingId: string; titre: string; source: string; acquisMs: number }[];
  leconsTerminees: number;
};

/**
 * Liste des étudiants. Les COMPTES DE TEST en sont exclus par défaut : ils ne
 * doivent apparaître que dans l'espace « Vue test », jamais mêlés aux personnes
 * réelles (décision du propriétaire, 6 octobre 2026).
 * `inclureTests` n'est utilisé que par la page Vue test.
 */
export async function listerEtudiants(db: Db, recherche = '', limite = 100, inclureTests = false): Promise<Etudiant[]> {
  const terme = `%${recherche.trim().toLowerCase()}%`;
  const resultat = await db.execute({
    sql: `SELECT id,email_normalized,display_name,status,email_verified_at_ms,created_at_ms,is_test
          FROM users
          WHERE role='student' AND ${inclureTests ? '1=1' : 'is_test=0'}
            AND (?='%%' OR email_normalized LIKE ? OR LOWER(display_name) LIKE ?)
          ORDER BY is_test, created_at_ms DESC LIMIT ?`,
    args: [terme, terme, terme, Math.min(Math.max(limite, 1), 500)],
  });
  const ids = resultat.rows.map((ligne) => texte(ligne.id));
  if (!ids.length) return [];
  const marques = ids.map(() => '?').join(',');
  const acces = await db.execute({
    sql: `SELECT e.user_id, e.training_id, e.source, e.acquired_at_ms, t.title
          FROM enrollments e JOIN trainings t ON t.id=e.training_id WHERE e.user_id IN (${marques})`,
    args: ids,
  });
  const progres = await db.execute({
    sql: `SELECT c.user_id, COUNT(*) AS n FROM lesson_completions c WHERE c.user_id IN (${marques}) GROUP BY c.user_id`,
    args: ids,
  });
  const parUtilisateur = new Map<string, Etudiant['acces']>();
  for (const ligne of acces.rows) {
    const cle = texte(ligne.user_id);
    const liste = parUtilisateur.get(cle) ?? [];
    liste.push({
      trainingId: texte(ligne.training_id),
      titre: texte(ligne.title),
      source: texte(ligne.source),
      acquisMs: nombre(ligne.acquired_at_ms),
    });
    parUtilisateur.set(cle, liste);
  }
  const termineesParUtilisateur = new Map(progres.rows.map((ligne) => [texte(ligne.user_id), nombre(ligne.n)]));
  return resultat.rows.map((ligne) => {
    const id = texte(ligne.id);
    return {
      id,
      email: texte(ligne.email_normalized),
      nom: texte(ligne.display_name),
      statut: texte(ligne.status),
      confirme: ligne.email_verified_at_ms != null,
      estTest: bool(ligne.is_test),
      creeMs: nombre(ligne.created_at_ms),
      acces: parUtilisateur.get(id) ?? [],
      leconsTerminees: termineesParUtilisateur.get(id) ?? 0,
    };
  });
}

/** Ouvrir un accès à la main (accès gracieux, geste commercial, dépannage). */
export async function accorderAcces(db: Db, email: string, formationId: string): Promise<Resultat> {
  const normalise = normalizeEmail(email);
  const utilisateur = await db.execute({
    sql: "SELECT id,display_name,status,email_verified_at_ms FROM users WHERE email_normalized=? AND role='student'",
    args: [normalise],
  });
  if (!utilisateur.rows.length) return echec('compte_introuvable : cette personne n’a pas encore de compte étudiant.');
  if (texte(utilisateur.rows[0].status) !== 'active') return echec('compte_suspendu : réactivez le compte avant d’ouvrir un accès.');
  if (utilisateur.rows[0].email_verified_at_ms == null)
    return echec('email_non_confirme : l’adresse doit être confirmée, sinon la personne ne pourra pas se connecter.');
  const formation = await db.execute({ sql: 'SELECT title FROM trainings WHERE id=?', args: [formationId] });
  if (!formation.rows.length) return echec('formation_introuvable');
  const deja = await db.execute({
    sql: 'SELECT 1 FROM enrollments WHERE user_id=? AND training_id=?',
    args: [texte(utilisateur.rows[0].id), formationId],
  });
  if (deja.rows.length) return { ok: true, message: `${normalise} a déjà cet accès.` };
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms)
          VALUES (?,?,'staff_grant',NULL,?)`,
    args: [texte(utilisateur.rows[0].id), formationId, Date.now()],
  });
  return { ok: true, message: `Accès ouvert à ${texte(utilisateur.rows[0].display_name)} pour « ${texte(formation.rows[0].title)} ».` };
}

export async function retirerAcces(db: Db, email: string, formationId: string): Promise<Resultat> {
  const normalise = normalizeEmail(email);
  const utilisateur = await db.execute({
    sql: 'SELECT id FROM users WHERE email_normalized=?',
    args: [normalise],
  });
  if (!utilisateur.rows.length) return echec('compte_introuvable');
  const acces = await db.execute({
    sql: 'SELECT source FROM enrollments WHERE user_id=? AND training_id=?',
    args: [texte(utilisateur.rows[0].id), formationId],
  });
  if (!acces.rows.length) return echec('aucun_acces');
  if (texte(acces.rows[0].source) === 'verified_purchase')
    return echec('achat_verifie : cet accès vient d’un achat réel. Le retirer effacerait une vente — la plateforme ne le fait pas.');
  await db.execute({
    sql: 'DELETE FROM enrollments WHERE user_id=? AND training_id=?',
    args: [texte(utilisateur.rows[0].id), formationId],
  });
  return { ok: true, message: `Accès retiré à ${normalise}.` };
}

/** Suspendre ou réactiver un compte. La suspension n'efface rien. */
export async function definirStatut(db: Db, email: string, statut: string): Promise<Resultat> {
  if (!['active', 'suspended'].includes(statut)) return echec('statut_inconnu');
  const normalise = normalizeEmail(email);
  const utilisateur = await db.execute({
    sql: "SELECT id,role FROM users WHERE email_normalized=? AND role='student'",
    args: [normalise],
  });
  if (!utilisateur.rows.length) return echec('compte_introuvable');
  await db.execute({ sql: 'UPDATE users SET status=? WHERE id=?', args: [statut, texte(utilisateur.rows[0].id)] });
  if (statut === 'suspended')
    await db.execute({ sql: 'DELETE FROM sessions WHERE user_id=?', args: [texte(utilisateur.rows[0].id)] });
  return {
    ok: true,
    message: statut === 'suspended' ? `${normalise} est suspendu ; ses sessions sont fermées.` : `${normalise} est réactivé.`,
  };
}

/* ------------------------------------------------------------------------ purge */

/**
 * Purge du contenu d'essai. Ce que le propriétaire demande : « la plateforme doit
 * être vide car tout était pour tester ». La purge est refusée si des ventes ou des
 * accès réels existent — on ne détruit pas une pièce comptable sur un clic.
 */
export async function purgerContenu(db: Db, confirmation: string): Promise<Resultat> {
  if (confirmation !== 'VIDER') return echec('confirmation_absente : tapez VIDER pour confirmer.');
  const achats = await db.execute(
    `SELECT (SELECT COUNT(*) FROM verified_purchases) AS achats, (SELECT COUNT(*) FROM enrollments) AS acces`
  );
  const nbAchats = nombre(achats.rows[0]?.achats);
  if (nbAchats)
    return echec(`ventes_reelles : ${nbAchats} achat(s) vérifié(s) existent. Une vente est une pièce comptable : la purge est refusée.`);
  await db.batch(
    [
      { sql: 'DELETE FROM lesson_completions' },
      { sql: 'DELETE FROM enrollments' },
      { sql: 'DELETE FROM course_lessons' },
      { sql: 'DELETE FROM course_modules' },
    ],
    'write'
  );
  return {
    ok: true,
    message: 'Contenu vidé : formations conservées, mais plus aucun module, aucune leçon, aucun accès, aucune progression.',
  };
}
