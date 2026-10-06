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
 *     une formation visible mais non achetable serait un mensonge à l'étudiant.
 *
 * Usage :
 *   node --experimental-strip-types scripts/production-ops.mjs list
 *   node --experimental-strip-types scripts/production-ops.mjs whois --email etudiant@exemple.com
 *   node --experimental-strip-types scripts/production-ops.mjs catalog            (aperçu)
 *   node --experimental-strip-types scripts/production-ops.mjs catalog --apply
 *   node --experimental-strip-types scripts/production-ops.mjs grant --email etudiant@exemple.com --training t-orateur [--apply]
 *   node --experimental-strip-types scripts/production-ops.mjs revoke --email … --training … --apply
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
if (!command || !['list', 'whois', 'catalog', 'grant', 'revoke'].includes(command)) {
  console.error('Usage : list | whois --email … | catalog [--apply] | grant --email … --training … [--apply] | revoke --email … --training … --apply');
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
  }
  if (!apply) return;

  let created = 0, updated = 0, keptDraft = 0;
  for (const { training, buyUrl, productId, existing } of rows) {
    const publish = buyUrl ? 1 : 0;
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
  console.log(`\nCatalogue importé : ${created} créée(s), ${updated} mise(s) à jour, ${keptDraft} laissée(s) non publiée(s) faute de lien d’achat.`);
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

try {
  if (command === 'list') await list();
  else if (command === 'whois') await whois(value('email') ?? '');
  else if (command === 'catalog') await catalog();
  else if (command === 'grant') await grant(value('email') ?? '', value('training') ?? '');
  else if (command === 'revoke') await revoke(value('email') ?? '', value('training') ?? '');
} catch (error) {
  console.error('ARRÊT :', error instanceof Error ? error.message : 'erreur inconnue');
  process.exitCode = 1;
} finally {
  db.close();
}
