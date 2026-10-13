/**
 * Base de DÉVELOPPEMENT locale (fichier libSQL) — jamais une base hébergée.
 *
 *   node --experimental-strip-types scripts/dev-db.mjs --migrate
 *   node --experimental-strip-types scripts/dev-db.mjs --migrate --seed     (catalogue seul)
 *   node --experimental-strip-types scripts/dev-db.mjs --empty              (vide le contenu)
 *   node --experimental-strip-types scripts/dev-db.mjs --reset --migrate    (base neuve)
 *   node --experimental-strip-types scripts/dev-db.mjs --grant etudiant@exemple.com t-orateur
 *
 * DÉCISION DU PROPRIÉTAIRE (6 octobre 2026) : « Purge tout le contenu, la
 * plateforme doit être vide car tout était pour tester. » En conséquence :
 *   — `--seed` n'installe plus QUE le catalogue des formations. Aucun module,
 *     aucune leçon, aucun compte de démonstration n'est créé par défaut ;
 *   — il n'existe plus AUCUN contenu de démonstration : ni compte fictif, ni
 *     module, ni leçon. Les comptes de test se créent depuis le site, puis se
 *     marquent « compte de test » dans l'Espace Direction (onglet Vue test) ;
 *   — `--empty` remet la plateforme à zéro : progressions, accès, leçons,
 *     modules, comptes de test et compteurs. Les formations sont conservées.
 *
 * Garde-fous : refuse de tourner si APP_ENV vaut staging/production ou si
 * NODE_ENV vaut production ; refuse une URL distante ; aucune écriture Turso.
 */
import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../lib/server/auth-core.ts';
import { TRAININGS } from '../lib/trainings.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);

if (process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production')
  fail('REFUS : ce script est réservé au développement local.');
if (process.env.TURSO_DATABASE_URL && !process.env.TURSO_DATABASE_URL.startsWith('file:'))
  fail('REFUS : TURSO_DATABASE_URL ne pointe pas vers un fichier local.');

function fail(message) {
  console.error(message);
  process.exit(2);
}

const dbPath = resolve(root, process.env.DEV_DB_PATH?.trim() || 'dev-data/davar-dev.db');
mkdirSync(dirname(dbPath), { recursive: true });
if (has('--reset')) rmSync(dbPath, { force: true });

const db = createClient({ url: `file:${dbPath}` });

function splitStatements(sql) {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function appliedMigrations() {
  // La table est créée par la migration 001 elle-même : absence = aucune migration.
  try {
    const rows = await db.execute('SELECT version, checksum FROM schema_migrations');
    return new Map(rows.rows.map((row) => [Number(row.version), String(row.checksum)]));
  } catch {
    return new Map();
  }
}

async function migrate() {
  const dir = join(root, 'turso', 'migrations');
  const files = readdirSync(dir).filter((name) => name.endsWith('.sqlite.sql')).sort();
  const applied = await appliedMigrations();
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    const sql = readFileSync(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const known = applied.get(version);
    if (known !== undefined) {
      if (known !== checksum) fail(`REFUS : ${file} a changé depuis son application.`);
      console.log(`= ${file} déjà appliquée`);
      continue;
    }
    const statements = splitStatements(sql);
    // PRAGMA hors transaction, schéma en lot (échec = aucune écriture partielle).
    for (const statement of statements.filter((s) => /^pragma/i.test(s))) await db.execute(statement);
    await db.batch(
      statements.filter((s) => !/^pragma/i.test(s)).map((statement) => ({ sql: statement, args: [] })),
      'write'
    );
    await db.execute({
      sql: 'INSERT INTO schema_migrations(version, checksum, installed_at_ms) VALUES (?, ?, ?)',
      args: [version, checksum, Date.now()],
    });
    console.log(`+ ${file} appliquée`);
  }
}

function productIdFromUrl(url) {
  const match = url?.match(/\/(prd_[a-z0-9]+)\//i);
  return match ? match[1] : null;
}

/** Catalogue seul : les formations vendues. Aucun contenu, aucun compte de test. */
async function seed() {
  for (const training of TRAININGS) {
    await db.execute({
      sql: `INSERT INTO trainings(id, title, price_cfa, chariow_product_id, published, description, buy_url)
            VALUES (?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, price_cfa=excluded.price_cfa,
              chariow_product_id=excluded.chariow_product_id,
              description=excluded.description, buy_url=excluded.buy_url`,
      args: [
        training.id,
        training.title,
        training.price,
        productIdFromUrl(training.chariowUrl),
        training.desc,
        training.chariowUrl ?? null,
      ],
    });
  }
  const lecons = await db.execute('SELECT COUNT(*) AS n FROM course_lessons');
  console.log(`+ catalogue : ${TRAININGS.length} formation(s) — enregistrée(s) FERMÉE(S), le temps de bâtir le contenu.`);
  console.log(`  contenu pédagogique : ${lecons.rows[0].n} leçon(s) — la plateforme reste vide, comme demandé.`);
}

/**
 * Remet la plateforme à zéro : progressions, accès, leçons, modules, comptes de
 * test, compteurs et statistiques d'exploitation. Les FORMATIONS sont conservées.
 * Refuse dès qu'un achat vérifié existe : une vente est une pièce comptable.
 */
async function empty() {
  const achats = await db.execute('SELECT COUNT(*) AS n FROM verified_purchases');
  if (Number(achats.rows[0].n) > 0) {
    fail('REFUS : des achats vérifiés existent. Une vente est une pièce comptable : elle ne se purge pas.');
  }
  const avant = await db.execute(
    `SELECT (SELECT COUNT(*) FROM course_modules) AS modules,
            (SELECT COUNT(*) FROM course_lessons) AS lecons,
            (SELECT COUNT(*) FROM enrollments) AS acces,
            (SELECT COUNT(*) FROM users) AS comptes,
            (SELECT COUNT(*) FROM lesson_completions) AS progres`
  );
  await db.batch(
    [
      { sql: 'DELETE FROM lesson_completions' },
      { sql: 'DELETE FROM enrollments' },
      { sql: 'DELETE FROM course_lessons' },
      { sql: 'DELETE FROM course_modules' },
      { sql: 'DELETE FROM email_tokens' },
      { sql: 'DELETE FROM sessions' },
      { sql: 'DELETE FROM rate_limits' },
      { sql: 'DELETE FROM ops_events' },
      { sql: 'DELETE FROM ops_counters' },
      { sql: 'DELETE FROM users' },
    ],
    'write'
  );
  const ligne = avant.rows[0];
  console.log(
    `+ plateforme vidée : ${ligne.modules} module(s), ${ligne.lecons} leçon(s), ${ligne.acces} accès, ` +
      `${ligne.comptes} compte(s) dont les comptes de test, ${ligne.progres} progression(s), compteurs et journal remis à zéro.`
  );
  console.log('  Les formations sont conservées (catalogue). Aucun contenu d’essai ne subsiste.');
}

async function grant(email, trainingId) {
  if (!email || !trainingId) fail('Usage : --grant <email> <training_id>');
  const normalized = email.trim().toLowerCase();
  const user = await db.execute({ sql: 'SELECT id FROM users WHERE email_normalized = ?', args: [normalized] });
  if (user.rows.length === 0) fail(`Aucun compte pour ${normalized}`);
  const result = await db.execute({
    sql: `INSERT INTO enrollments(user_id, training_id, source, sale_id, acquired_at_ms)
          VALUES (?, ?, 'staff_grant', NULL, ?) ON CONFLICT(user_id, training_id) DO NOTHING`,
    args: [user.rows[0].id, trainingId, Date.now()],
  });
  console.log(result.rowsAffected ? `+ accès accordé (${normalized} → ${trainingId})` : `= accès déjà présent`);
}

try {
  await migrate();
  if (has('--empty')) await empty();
  if (has('--seed')) await seed();
  if (has('--grant')) await grant(args[args.indexOf('--grant') + 1], args[args.indexOf('--grant') + 2]);
  const counts = await db.execute(
    `SELECT (SELECT COUNT(*) FROM trainings) AS trainings,
            (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM enrollments) AS enrollments,
            (SELECT COUNT(*) FROM course_modules) AS modules,
            (SELECT COUNT(*) FROM course_lessons) AS lessons,
            (SELECT COUNT(*) FROM lesson_completions) AS progres`
  );
  console.log(`base locale : ${dbPath}`);
  console.log('contenu :', JSON.stringify(counts.rows[0]));
} finally {
  db.close();
}
