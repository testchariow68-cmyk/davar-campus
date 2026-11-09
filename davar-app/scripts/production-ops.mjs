/* Opérations de service DAVAR — catalogue et attribution d'accès, sur la base
 * de la cible choisie. Lecture seule par défaut ; toute écriture exige --apply.
 *
 * POURQUOI CE SCRIPT EXISTE
 * Tant que le webhook Chariow n'est pas activé et éprouvé sur une vraie vente,
 * l'accès automatique n'est PAS prouvé. Ce script est le pont opérationnel
 * honnête : le propriétaire attribue lui-même l'accès à un acheteur réel, avec
 * une trace (`staff_grant`), sans attendre le Pulse. Il ne remplace pas le
 * webhook : il évite simplement de faire attendre un étudiant qui a payé.
 *
 * GARDE-FOUS
 *   - cible explicite : DAVAR_OPS_TARGET=staging (défaut) | production ;
 *     une cible production refuse tout hôte contenant « staging » ;
 *     `local` n'existe que pour répéter l'outil hors ligne sur un fichier `file:` ;
 *   - rien n'est écrit sans --apply ;
 *   - un accès n'est accordé qu'à un compte dont l'e-mail est CONFIRMÉ ;
 *     sinon le script explique quoi faire, et n'écrit rien ;
 *   - un compte suspendu est refusé ;
 *   - attribution idempotente (`ON CONFLICT DO NOTHING`) et tracée ;
 *   - le catalogue refuse de PUBLIER une formation sans lien d'achat Chariow :
 *     une formation visible mais non achetable serait un mensonge à l'étudiant ;
 *   - `--prune` retire du catalogue ce qui n'est plus déclaré dans
 *     `lib/trainings.ts`. Une formation déjà achetée n'est JAMAIS supprimée :
 *     elle est seulement dépubliée, car une vente est une pièce comptable.
 *
 * Usage :
 *   node --experimental-strip-types scripts/production-ops.mjs list
 *   node --experimental-strip-types scripts/production-ops.mjs whois --email etudiant@exemple.com
 *   node --experimental-strip-types scripts/production-ops.mjs catalog            (aperçu)
 *   node --experimental-strip-types scripts/production-ops.mjs catalog --apply
 *   node --experimental-strip-types scripts/production-ops.mjs catalog --apply --prune
 *   node --experimental-strip-types scripts/production-ops.mjs grant --email etudiant@exemple.com --training t-orateur [--apply]
 *   node --experimental-strip-types scripts/production-ops.mjs revoke --email … --training … --apply
 *   node --experimental-strip-types scripts/production-ops.mjs team
 *   node --experimental-strip-types scripts/production-ops.mjs grant-staff --email … --role staff|admin --apply
 *   node --experimental-strip-types scripts/production-ops.mjs course --training t-orateur
 *   node --experimental-strip-types scripts/production-ops.mjs add-module --training t-orateur --title "…" --apply
 *   node --experimental-strip-types scripts/production-ops.mjs add-lesson --module mod-or-1 --title "…" [--kind video|text|exercise|live] [--duration 12] [--url https://…] --apply
 *   node --experimental-strip-types scripts/production-ops.mjs purge --confirm VIDER            (aperçu)
 *   node --experimental-strip-types scripts/production-ops.mjs purge --confirm VIDER --apply
 *   node --experimental-strip-types scripts/production-ops.mjs purge --confirm VIDER --all --apply
 *
 * PURGE (demande du propriétaire, 6 octobre 2026 : « la plateforme doit être vide
 * car tout était pour tester ») : supprime les leçons, modules, progressions,
 * comptes de test, accès et statistiques. Les FORMATIONS sont conservées. Deux
 * refus nets : sans la confirmation tapée à la main, et dès qu'un achat vérifié
 * existe — une vente est une pièce comptable, elle ne se purge pas.
 *
 * POURQUOI CES COMMANDES EXISTENT : le campus n'a pas encore d'interface
 * d'administration. Sans elles, un propriétaire ne pourrait ni nommer son équipe
 * ni construire ses cours. Elles font le travail en attendant l'interface, avec
 * les mêmes garde-fous (aperçu par défaut, --apply pour écrire).
 */
import { createClient } from '@libsql/client';
import { TRAININGS } from '../lib/trainings.ts';

const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const apply = flag('apply');

const target = (process.env.DAVAR_OPS_TARGET ?? 'staging').trim();
if (!['staging', 'production', 'local'].includes(target)) {
  console.error('REFUS : DAVAR_OPS_TARGET inconnu (valeurs admises : staging, production, local)');
  process.exit(2);
}
if (target === 'local' && process.env.APP_ENV === 'production') {
  console.error('REFUS : la cible locale est interdite avec APP_ENV=production');
  process.exit(2);
}
const COMMANDES = ['list', 'whois', 'catalog', 'grant', 'revoke', 'team', 'grant-staff', 'course', 'add-module', 'add-lesson', 'purge'];
if (!command || !COMMANDES.includes(command)) {
  console.error('Usage : ' + COMMANDES.join(' | '));
  process.exit(2);
}

const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken, TURSO_EXPECTED_HOST: host } = process.env;
let parsed;
try { parsed = new URL(url); } catch {}
const looksStaging = /(^|[.-])staging([.-]|$)/i.test(host ?? '');
const ok = target === 'local'
  ? Boolean(url?.startsWith('file:'))            // répétition hors ligne, jamais une base hébergée
  : url && authToken && host && parsed && parsed.hostname === host && host.endsWith('.turso.io') &&
    (target === 'production' ? !looksStaging : host.startsWith('davar-campus-staging-'));
if (!ok) {
  console.error(`REFUS : cible DAVAR ${target} non vérifiée (URL, jeton ou hôte incohérent)`);
  process.exit(2);
}
console.log(`Cible : ${target}${target === 'local' ? ' (base locale de répétition)' : ` — ${host}`}`);
if (target === 'production' && !apply && command !== 'list' && command !== 'whois')
  console.log('Mode APERÇU (lecture seule). Ajoutez --apply pour écrire.');

const normalize = (email) => String(email).trim().toLowerCase();
const productIdFromUrl = (link) => (link?.match(/\/prd_[a-z0-9]+\//i) ?? [])[0]?.replace(/\//g, '') ?? null;

const db = createClient({ url, authToken });

async function list() {
  const trainings = await db.execute('SELECT id,title,price_cfa,published,chariow_product_id,buy_url FROM trainings ORDER BY price_cfa DESC');
  console.log('\nFormations en base :');
  for (const row of trainings.rows)
    console.log(`  ${String(row.id).padEnd(16)} ${String(row.title).slice(0, 44).padEnd(46)} ${String(row.price_cfa).padStart(6)} FCFA  pub=${row.published}  ${row.chariow_product_id ?? '— aucun produit Chariow'}`);
  const counts = await db.execute(`SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM users WHERE email_verified_at_ms IS NOT NULL) AS verified,
    (SELECT COUNT(*) FROM enrollments) AS enrollments,
    (SELECT COUNT(*) FROM verified_purchases) AS purchases`);
  const c = counts.rows[0];
  console.log(`\nComptes : ${c.users} (dont ${c.verified} confirmés) · accès attribués : ${c.enrollments} · ventes Chariow vérifiées : ${c.purchases}`);
  console.log('\nRappel : un compte ne peut se créer que si l’envoi d’e-mails est configuré');
  console.log('(Brevo en production). Sans cela, l’inscription est refusée — volontairement.');
}

async function whois(email) {
  const normalized = normalize(email);
  const user = await db.execute({
    sql: 'SELECT id,display_name,status,email_verified_at_ms,created_at_ms FROM users WHERE email_normalized=?',
    args: [normalized],
  });
  if (!user.rows.length) {
    console.log(`\nAucun compte pour ${normalized}.`);
    console.log('L’acheteur doit d’abord créer son compte et confirmer son e-mail sur le campus.');
    return;
  }
  const row = user.rows[0];
  const enrollments = await db.execute({ sql: 'SELECT training_id,source,acquired_at_ms FROM enrollments WHERE user_id=?', args: [String(row.id)] });
  console.log(`\n${normalized}`);
  console.log(`  nom        : ${row.display_name}`);
  console.log(`  état       : ${row.status}`);
  console.log(`  e-mail     : ${row.email_verified_at_ms ? 'CONFIRMÉ' : 'NON CONFIRMÉ'}`);
  console.log(`  accès      : ${enrollments.rows.length ? enrollments.rows.map((e) => `${e.training_id} (${e.source})`).join(', ') : 'aucun'}`);
}

async function catalog() {
  console.log('\nCatalogue déclaré dans lib/trainings.ts :');
  const rows = [];
  for (const training of TRAININGS) {
    const buyUrl = training.chariowUrl ?? null;
    const productId = productIdFromUrl(buyUrl);
    const existing = await db.execute({ sql: 'SELECT id,published,buy_url,chariow_product_id FROM trainings WHERE id=?', args: [training.id] });
    rows.push({ training, buyUrl, productId, existing: existing.rows[0] });
    const state = existing.rows.length ? 'déjà en base' : 'à créer';
    console.log(`  ${training.id.padEnd(16)} ${training.title.slice(0, 42).padEnd(44)} ${String(training.price).padStart(6)} FCFA  ${state}`);
    if (!buyUrl) console.log(`      ⚠ aucun lien d’achat Chariow → la formation restera NON publiée (invisible des étudiants)`);
    const lecons = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM course_lessons l JOIN course_modules m ON m.id=l.module_id WHERE m.training_id=?`,
      args: [training.id],
    });
    if (Number(lecons.rows[0]?.n) === 0)
      console.log('      ⚠ aucune leçon → la formation restera FERMÉE : ouvrir un cours vide ferait payer pour une page blanche');
  }
  if (!apply) return;

  const declaredIds = rows.map((row) => row.training.id);
  let created = 0, updated = 0, keptDraft = 0, pruned = 0, unpublished = 0;
  for (const { training, buyUrl, productId, existing } of rows) {
    // Deux conditions pour ouvrir une formation : un lien d'achat ET au moins une
    // leçon. La seconde évite de vendre une page vide — la même règle est appliquée
    // dans l'Espace Direction, pour que les deux chemins disent la même chose.
    const lecons = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM course_lessons l JOIN course_modules m ON m.id=l.module_id WHERE m.training_id=?`,
      args: [training.id],
    });
    const aDuContenu = Number(lecons.rows[0]?.n) > 0;
    const publish = buyUrl && aDuContenu ? 1 : 0;
    if (!publish) keptDraft += 1;
    await db.execute({
      sql: `INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published,description,buy_url)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              title=excluded.title, price_cfa=excluded.price_cfa,
              chariow_product_id=excluded.chariow_product_id, published=excluded.published,
              description=excluded.description, buy_url=excluded.buy_url`,
      args: [training.id, training.title, training.price, productId, publish, training.desc, buyUrl],
    });
    existing ? (updated += 1) : (created += 1);
  }
  if (flag('prune')) {
    const placeholders = declaredIds.map(() => '?').join(',');
    const extra = await db.execute({
      sql: `SELECT id,title FROM trainings WHERE id NOT IN (${placeholders})`,
      args: declaredIds,
    });
    for (const row of extra.rows) {
      // Une formation achetée reste en base : la vente est une pièce comptable.
      const bought = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM enrollments WHERE training_id=?', args: [String(row.id)] });
      if (Number(bought.rows[0].n) > 0) {
        await db.execute({ sql: 'UPDATE trainings SET published=0 WHERE id=?', args: [String(row.id)] });
        unpublished += 1;
        console.log(`   conservée mais dépubliée (accès existants) : ${row.title}`);
      } else {
        await db.execute({ sql: 'DELETE FROM trainings WHERE id=?', args: [String(row.id)] });
        pruned += 1;
        console.log(`   retirée du catalogue : ${row.title}`);
      }
    }
  }
  console.log(`\nCatalogue importé : ${created} créée(s), ${updated} mise(s) à jour, ${keptDraft} laissée(s) non publiée(s) faute de lien d’achat.`);
  if (flag('prune')) console.log(`Nettoyage : ${pruned} retirée(s), ${unpublished} dépubliée(s) (car déjà achetée(s)).`);
  else console.log('Astuce : ajoutez --prune pour retirer du catalogue ce qui n’est plus déclaré dans lib/trainings.ts.');
}

async function grant(email, trainingId) {
  const normalized = normalize(email);
  const user = await db.execute({ sql: 'SELECT id,display_name,status,email_verified_at_ms FROM users WHERE email_normalized=?', args: [normalized] });
  if (!user.rows.length) {
    console.error(`\nAucun compte pour ${normalized}. Accord impossible : faites d’abord créer et confirmer le compte.`);
    process.exitCode = 1;
    return;
  }
  const row = user.rows[0];
  if (row.status !== 'active') { console.error(`\nCompte ${row.status} : aucun accès accordé.`); process.exitCode = 1; return; }
  if (!row.email_verified_at_ms) {
    console.error(`\nE-mail NON confirmé pour ${normalized} : aucun accès accordé.`);
    console.error('C’est la règle du projet : l’accès suit un e-mail confirmé, jamais une simple adresse déclarée.');
    process.exitCode = 1;
    return;
  }
  const training = await db.execute({ sql: 'SELECT id,title FROM trainings WHERE id=? OR title LIKE ?', args: [trainingId, `%${trainingId}%`] });
  if (!training.rows.length) { console.error(`\nFormation introuvable : ${trainingId}`); process.exitCode = 1; return; }
  const found = training.rows[0];
  const already = await db.execute({ sql: 'SELECT 1 FROM enrollments WHERE user_id=? AND training_id=?', args: [String(row.id), String(found.id)] });
  if (already.rows.length) { console.log(`\n${normalized} a DÉJÀ accès à « ${found.title} » — rien à faire.`); return; }
  if (!apply) { console.log(`\nAperçu : accorder « ${found.title} » à ${normalized} (${row.display_name}) — source staff_grant.`); return; }
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms)
          VALUES (?,?,'staff_grant',NULL,?) ON CONFLICT(user_id,training_id) DO NOTHING`,
    args: [String(row.id), String(found.id), Date.now()],
  });
  console.log(`\n✅ Accès accordé : ${normalized} → « ${found.title} » (source staff_grant, tracé en base).`);
}

async function revoke(email, trainingId) {
  const normalized = normalize(email);
  const user = await db.execute({ sql: 'SELECT id FROM users WHERE email_normalized=?', args: [normalized] });
  if (!user.rows.length) { console.error(`Aucun compte pour ${normalized}.`); process.exitCode = 1; return; }
  const training = await db.execute({ sql: 'SELECT id,title FROM trainings WHERE id=? OR title LIKE ?', args: [trainingId, `%${trainingId}%`] });
  if (!training.rows.length) { console.error(`Formation introuvable : ${trainingId}`); process.exitCode = 1; return; }
  if (!apply) { console.log(`\nAperçu : RETIRER « ${training.rows[0].title} » à ${normalized} (utile après un remboursement ou un litige).`); return; }
  const result = await db.execute({
    sql: 'DELETE FROM enrollments WHERE user_id=? AND training_id=?',
    args: [String(user.rows[0].id), String(training.rows[0].id)],
  });
  console.log(`\nAccès retiré : ${normalized} ✗ « ${training.rows[0].title} » (${result.rowsAffected} ligne).`);
  console.log('Note : la vente vérifiée reste en base comme pièce comptable ; seul l’accès est retiré.');
}

/** Rôles et équipe : qui dirige, qui aide. Le propriétaire est unique. */
async function team() {
  const rows = await db.execute('SELECT email_normalized, display_name, role, status, email_verified_at_ms, last_login_at_ms FROM users ORDER BY role, email_normalized');
  const parRole = { admin: [], staff: [], student: [] };
  for (const row of rows.rows) (parRole[String(row.role)] ?? parRole.student).push(row);
  console.log('\nÉQUIPE');
  for (const role of ['admin', 'staff']) {
    console.log(`\n${role === 'admin' ? 'Propriétaire (Super Admin)' : 'Membres du staff'} :`);
    if (!parRole[role].length) console.log('  — personne');
    for (const row of parRole[role]) {
      const derniere = row.last_login_at_ms ? new Date(Number(row.last_login_at_ms)).toLocaleDateString('fr-FR') : 'jamais connecté';
      console.log(`  ${String(row.email_normalized).padEnd(38)} ${String(row.display_name).padEnd(24)} ${row.status === 'active' ? '' : `[${row.status}] `}${row.email_verified_at_ms ? '' : '[e-mail non confirmé] '}${derniere}`);
    }
  }
  console.log(`\nÉtudiants : ${parRole.student.length}`);
  console.log('Rappel du projet : le Super Admin est UNIQUE. Pour nommer votre équipe et');
  console.log('bâtir vos cours, ouvrez l’Espace Direction dans le navigateur : /direction');
}

async function grantStaff(email, role) {
  const normalized = normalize(email);
  if (!['staff', 'admin', 'student'].includes(role)) {
    console.error('Rôle attendu : staff, admin ou student.');
    process.exitCode = 1;
    return;
  }
  const user = await db.execute({ sql: 'SELECT id,role,display_name FROM users WHERE email_normalized=?', args: [normalized] });
  if (!user.rows.length) {
    console.error(`\nAucun compte pour ${normalized}. La personne doit d’abord créer son compte.`);
    process.exitCode = 1;
    return;
  }
  const actuel = String(user.rows[0].role);
  if (actuel === role) { console.log(`\n${normalized} a déjà le rôle « ${role} » — rien à faire.`); return; }
  if (role === 'admin') {
    const autres = await db.execute({ sql: "SELECT email_normalized FROM users WHERE role='admin' AND email_normalized<>?", args: [normalized] });
    if (autres.rows.length) {
      console.error(`\nREFUS : ${autres.rows[0].email_normalized} est déjà propriétaire.`);
      console.error('Le projet impose un propriétaire unique : utilisez le transfert de propriété,');
      console.error('ou retirez d’abord le rôle admin existant avec --role student.');
      process.exitCode = 1;
      return;
    }
  }
  if (!apply) { console.log(`\nAperçu : ${normalized} — rôle « ${actuel} » → « ${role} ».`); return; }
  await db.execute({ sql: 'UPDATE users SET role=? WHERE id=?', args: [role, String(user.rows[0].id)] });
  console.log(`\n✅ ${normalized} (${user.rows[0].display_name}) : rôle « ${actuel} » → « ${role} ».`);
}

/** Structure pédagogique d'une formation : modules et leçons, dans l'ordre. */
async function course(trainingId) {
  const training = await db.execute({ sql: 'SELECT id,title,published FROM trainings WHERE id=? OR title LIKE ?', args: [trainingId, `%${trainingId}%`] });
  if (!training.rows.length) { console.error(`Formation introuvable : ${trainingId}`); process.exitCode = 1; return; }
  const t0 = training.rows[0];
  console.log(`\n« ${t0.title} » (${t0.id}) — publiée=${t0.published}`);
  const modules = await db.execute({ sql: 'SELECT id,position,title,summary FROM course_modules WHERE training_id=? ORDER BY position', args: [String(t0.id)] });
  if (!modules.rows.length) console.log('  (aucun module)');
  for (const module of modules.rows) {
    console.log(`\n  Module ${module.position} — ${module.title}   [${module.id}]`);
    if (module.summary) console.log(`     ${module.summary}`);
    const lecons = await db.execute({ sql: 'SELECT id,position,title,kind,duration_min,resource_url FROM course_lessons WHERE module_id=? ORDER BY position', args: [String(module.id)] });
    if (!lecons.rows.length) console.log('     (aucune leçon)');
    for (const lecon of lecons.rows)
      console.log(`     ${String(lecon.position).padStart(2)}. ${String(lecon.title).padEnd(46)} ${String(lecon.kind).padEnd(9)} ${lecon.duration_min ? `${lecon.duration_min} min` : ''} ${lecon.resource_url ? '' : '· aucune ressource'}`);
  }
  const total = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM course_lessons l JOIN course_modules m ON m.id=l.module_id WHERE m.training_id=?`,
    args: [String(t0.id)],
  });
  console.log(`\n  Total : ${modules.rows.length} module(s), ${total.rows[0].n} leçon(s).`);
  if (Number(total.rows[0].n) === 0)
    console.log('  ⚠ Sans leçon, un étudiant qui a accès ne voit rien : construisez la structure avant d’ouvrir.');
}

async function addModule(trainingId, titre) {
  const training = await db.execute({ sql: 'SELECT id,title FROM trainings WHERE id=? OR title LIKE ?', args: [trainingId, `%${trainingId}%`] });
  if (!training.rows.length) { console.error(`Formation introuvable : ${trainingId}`); process.exitCode = 1; return; }
  if (titre.trim().length < 2) { console.error('Titre de module trop court.'); process.exitCode = 1; return; }
  const suivant = await db.execute({ sql: 'SELECT COALESCE(MAX(position),0)+1 AS p FROM course_modules WHERE training_id=?', args: [String(training.rows[0].id)] });
  const position = Number(suivant.rows[0].p);
  const id = `mod_${Date.now().toString(36)}`;
  if (!apply) { console.log(`\nAperçu : ajouter le module ${position} « ${titre} » à « ${training.rows[0].title} ».`); return; }
  await db.execute({
    sql: 'INSERT INTO course_modules(id,training_id,position,title,summary) VALUES (?,?,?,?,NULL)',
    args: [id, String(training.rows[0].id), position, titre.trim()],
  });
  console.log(`\n✅ Module ${position} ajouté : « ${titre} » [${id}]`);
  console.log(`   Ajoutez ses leçons : add-lesson --module ${id} --title "…" --apply`);
}

async function addLesson(moduleId, titre, kind, duration, resourceUrl) {
  const module = await db.execute({ sql: 'SELECT id,title FROM course_modules WHERE id=?', args: [moduleId] });
  if (!module.rows.length) { console.error(`Module introuvable : ${moduleId} (utilisez « course » pour lister les identifiants).`); process.exitCode = 1; return; }
  if (titre.trim().length < 2) { console.error('Titre de leçon trop court.'); process.exitCode = 1; return; }
  if (!['video', 'text', 'exercise', 'live'].includes(kind)) { console.error('Type attendu : video, text, exercise ou live.'); process.exitCode = 1; return; }
  const minutes = duration ? Number(duration) : null;
  if (minutes !== null && (!Number.isInteger(minutes) || minutes <= 0)) { console.error('Durée invalide (minutes entières positives).'); process.exitCode = 1; return; }
  const suivant = await db.execute({ sql: 'SELECT COALESCE(MAX(position),0)+1 AS p FROM course_lessons WHERE module_id=?', args: [moduleId] });
  const position = Number(suivant.rows[0].p);
  const id = `les_${Date.now().toString(36)}`;
  if (!apply) { console.log(`\nAperçu : ajouter la leçon ${position} « ${titre} » (${kind}) au module « ${module.rows[0].title} ».`); return; }
  await db.execute({
    sql: 'INSERT INTO course_lessons(id,module_id,position,title,kind,resource_url,duration_min) VALUES (?,?,?,?,?,?,?)',
    args: [id, moduleId, position, titre.trim(), kind, resourceUrl ?? null, minutes],
  });
  console.log(`\n✅ Leçon ${position} ajoutée : « ${titre} » [${id}]`);
  if (!resourceUrl) console.log('   Sans adresse de ressource, l’étudiant verra « Ressource pas encore publiée » — c’est exact.');
}

/**
 * Vider la plateforme de tout contenu d'essai.
 * Ce qui part : progressions, accès, leçons, modules, compteurs et journal
 * d'exploitation (« statistiques »). Avec --all : aussi les comptes étudiants,
 * leurs sessions et leurs jetons — jamais le propriétaire.
 * Ce qui reste, toujours : les formations (le catalogue) et les ventes.
 */
async function purge(confirmation) {
  if (confirmation !== 'VIDER') {
    console.error('\nREFUS : la purge exige --confirm VIDER (le mot de confirmation, tapé à la main).');
    console.error('Rien n’a été supprimé. Relancez avec : purge --confirm VIDER --apply');
    process.exitCode = 1;
    return;
  }
  const tout = flag('all');
  const etat = await db.execute(
    `SELECT (SELECT COUNT(*) FROM verified_purchases) AS achats,
            (SELECT COUNT(*) FROM lesson_completions) AS progres,
            (SELECT COUNT(*) FROM enrollments) AS acces,
            (SELECT COUNT(*) FROM course_lessons) AS lecons,
            (SELECT COUNT(*) FROM course_modules) AS modules,
            (SELECT COUNT(*) FROM users WHERE role='student') AS etudiants,
            (SELECT COUNT(*) FROM ops_events) AS evenements,
            (SELECT COUNT(*) FROM ops_counters) AS compteurs`
  );
  const ligne = etat.rows[0];
  const achats = Number(ligne.achats);

  console.log('\nPURGE — ce qui serait supprimé :');
  console.log(`  ${ligne.lecons} leçon(s), ${ligne.modules} module(s)`);
  console.log(`  ${ligne.acces} accès, ${ligne.progres} progression(s)`);
  console.log(`  ${ligne.evenements} événement(s) et ${ligne.compteurs} compteur(s) d’exploitation (statistiques)`);
  if (tout) console.log(`  ${ligne.etudiants} compte(s) étudiant, leurs sessions et leurs jetons`);
  else console.log('  (les comptes étudiants sont CONSERVÉS — ajoutez --all pour les retirer aussi)');
  console.log('  Les formations et les ventes ne sont jamais touchées.');

  if (achats) {
    console.error(`\nREFUS : ${achats} achat(s) vérifié(s) existent dans cette base.`);
    console.error('Une vente est une pièce comptable : la plateforme ne la détruit pas sur commande.');
    console.error('Si vous voulez seulement retirer du contenu, supprimez les leçons une par une depuis l’Espace Direction.');
    process.exitCode = 1;
    return;
  }
  if (!apply) {
    console.log('\nAperçu seulement. Pour exécuter : ajoutez --apply.');
    return;
  }

  const instructions = [
    { sql: 'DELETE FROM lesson_completions' },
    { sql: 'DELETE FROM enrollments' },
    { sql: 'DELETE FROM course_lessons' },
    { sql: 'DELETE FROM course_modules' },
    { sql: 'DELETE FROM email_tokens' },
    { sql: 'DELETE FROM rate_limits' },
    { sql: 'DELETE FROM ops_events' },
    { sql: 'DELETE FROM ops_counters' },
    // Une formation ouverte mais vidée de son contenu ferait payer pour une page
    // blanche : la purge la referme. Le propriétaire la rouvrira avec son vrai cours.
    { sql: 'UPDATE trainings SET published=0' },
  ];
  if (tout)
    instructions.push(
      { sql: 'DELETE FROM payment_intents' },
      { sql: 'DELETE FROM sessions' },
      { sql: "DELETE FROM users WHERE role='student'" }
    );
  await db.batch(instructions, 'write');
  console.log(`\n✅ Plateforme vidée : plus aucune leçon, aucun module, aucun accès, aucune progression.`);
  console.log('   Les formations ont été refermées : une formation vide ne doit pas rester ouverte à la vente.');
  if (tout) console.log('   Les comptes étudiants et leurs sessions ont été retirés ; le propriétaire est intact.');
  console.log('   Les formations restent en place : ouvrez l’Espace Direction pour y écrire le vrai contenu.');
}

try {
  if (command === 'list') await list();
  else if (command === 'whois') await whois(value('email') ?? '');
  else if (command === 'catalog') await catalog();
  else if (command === 'grant') await grant(value('email') ?? '', value('training') ?? '');
  else if (command === 'revoke') await revoke(value('email') ?? '', value('training') ?? '');
  else if (command === 'team') await team();
  else if (command === 'grant-staff') await grantStaff(value('email') ?? '', value('role') ?? '');
  else if (command === 'course') await course(value('training') ?? '');
  else if (command === 'add-module') await addModule(value('training') ?? '', value('title') ?? '');
  else if (command === 'add-lesson') await addLesson(value('module') ?? '', value('title') ?? '', value('kind') ?? 'video', value('duration'), value('url'));
  else if (command === 'purge') await purge(value('confirm') ?? '');
} catch (error) {
  console.error('ARRÊT :', error instanceof Error ? error.message : 'erreur inconnue');
  process.exitCode = 1;
} finally {
  db.close();
}
