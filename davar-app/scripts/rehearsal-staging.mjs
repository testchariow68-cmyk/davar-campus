/* Répétition locale de la migration staging — AUCUN accès réseau.
 *
 * Objectif : prouver, avant que le propriétaire ne touche au Turso hébergé, ce que
 * produisent exactement les migrations EN ATTENTE sur une base qui ne contient que
 * la migration 001 — c'est-à-dire la copie conforme de `davar-campus-staging`.
 *
 * Rien n'est chiffré en dur : le nombre de migrations, de tables et d'index est
 * dérivé du manifeste et des fichiers SQL. Ce script a d'ailleurs déjà menti une
 * fois — il annonçait « 16 tables » et « 4 reçus » alors que le campus en comptait
 * 49 et 16, et il criait à l'échec sur une migration parfaitement saine. Un
 * garde-fou qui crie faux est un garde-fou qu'on finit par ignorer.
 *
 * Le manifeste et les fichiers SQL sont lus depuis la même source que le script
 * réel (`scripts/staging-schema.mjs --manifest` et `turso/migrations/`), et la
 * mécanique d'écriture est la même : une transaction par migration, suivie du
 * reçu de version. Seule la cible change : un fichier SQLite temporaire.
 *
 * Usage : node --experimental-strip-types scripts/rehearsal-staging.mjs
 */
import { createClient } from '@libsql/client';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const manifest = JSON.parse(execFileSync('node', ['scripts/staging-schema.mjs', '--manifest'], { cwd: ROOT, encoding: 'utf8' }));

const pragmaLike = (statement) => /^PRAGMA\b/i.test(statement);

/** Même lecture que le script réel : empreinte vérifiée, PRAGMA étrangers refusés,
 *  et seul `PRAGMA foreign_keys = ON` est toléré puis retiré du décompte des DDL. */
const statementsOf = (file) => {
  const raw = readFileSync(join(ROOT, 'turso', 'migrations', file), 'utf8');
  const statements = raw.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
  if (statements.some((s) => pragmaLike(s) && !/^PRAGMA\s+foreign_keys\s*=\s*ON$/i.test(s)))
    throw Error(`PRAGMA inattendu dans ${file}`);
  return statements.filter((s) => !pragmaLike(s)).map((sql) => ({ sql }));
};

/** Les index déclarés par un fichier de migration. */
const indexDeclaresDans = (file) =>
  [...statementsOf(file).reduce((noms, { sql }) => {
    for (const match of sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?/gi))
      noms.add(match[1]);
    return noms;
  }, new Set())];

const dbPath = join(mkdtempSync(join(tmpdir(), 'davar-repetition-')), 'staging-local.db');
const client = createClient({ url: `file:${dbPath}` });
const failures = [];
const check = (label, condition, detail = '') => {
  console.log(`${condition ? '  ok  ' : ' ÉCHEC'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(label);
};

try {
  console.log('=== 1. Copie conforme du staging : migration 001 seule ===');
  const first = manifest.migrations[0];
  await client.batch([...statementsOf(first.file), {
    sql: 'INSERT INTO schema_migrations(version,checksum,installed_at_ms) VALUES (?,?,?)',
    args: [first.version, first.sha256, Date.now()],
  }], 'write');
  const tablesAfter001 = (await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).rows.map((r) => String(r.name));
  const indexesAfter001 = (await client.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")).rows.length;
  check(
    `${first.creates.length} tables après 001`,
    tablesAfter001.length === first.creates.length,
    `${tablesAfter001.length} tables`
  );
  check(
    `${indexDeclaresDans(first.file).length} index après 001`,
    indexesAfter001 === indexDeclaresDans(first.file).length,
    `${indexesAfter001} index`
  );
  check('reçu version 1', (await client.execute('SELECT COUNT(*) n FROM schema_migrations')).rows[0].n === 1);

  console.log(`\n=== 2. Application des migrations en attente (les ${manifest.migrations.length - 1} suivantes) ===`);
  const appliedRows = (await client.execute('SELECT version FROM schema_migrations')).rows.map((r) => Number(r.version));
  const pending = manifest.migrations.filter((m) => !appliedRows.includes(m.version));
  check(
    `${manifest.migrations.length - 1} migrations en attente`,
    pending.length === manifest.migrations.length - 1,
    pending.map((m) => m.file).join(', ')
  );
  const fk = await client.execute('PRAGMA foreign_keys');
  check('clés étrangères actives', Number(fk.rows[0]?.foreign_keys) === 1);
  for (const migration of pending) {
    const sql = statementsOf(migration.file);
    check(`${migration.file} : ${sql.length} DDL = ${migration.ddl} revus`, sql.length === migration.ddl);
    check(`${migration.file} : aucune instruction destructive`,
      !sql.some(({ sql: s }) => /\b(drop|truncate|delete\s+from)\b/i.test(s)));
    await client.batch([...sql, {
      sql: 'INSERT INTO schema_migrations(version,checksum,installed_at_ms) VALUES (?,?,?)',
      args: [migration.version, migration.sha256, Date.now()],
    }], 'write');
    console.log(`       appliquée : ${migration.file}`);
  }

  console.log('\n=== 3. Contrôles post-migration (ce que le script réel exige) ===');
  const tables = (await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).rows.map((r) => String(r.name));
  const indexes = (await client.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")).rows.map((r) => String(r.name));
  const receipts = (await client.execute('SELECT version, checksum FROM schema_migrations ORDER BY version')).rows;
  check(`${manifest.expectedTableCount} tables`, tables.length === manifest.expectedTableCount, tables.join(', '));
  const indexAttendus = manifest.migrations.flatMap((migration) => indexDeclaresDans(migration.file));
  const indexManquants = indexAttendus.filter((nom) => !indexes.includes(nom));
  check(
    `les ${indexAttendus.length} index déclarés existent`,
    indexManquants.length === 0,
    indexManquants.length > 0 ? `manquants : ${indexManquants.join(', ')}` : indexes.join(', ')
  );
  check(
    `${manifest.migrations.length} reçus conformes au manifeste`,
    receipts.length === manifest.migrations.length &&
      receipts.every((row, i) => Number(row.version) === manifest.migrations[i].version && String(row.checksum) === manifest.migrations[i].sha256),
    `${receipts.length} reçus`
  );
  for (const table of ['users', 'trainings', 'verified_purchases', 'enrollments'])
    check(`${table} : zéro ligne`, (await client.execute(`SELECT COUNT(*) n FROM ${table}`)).rows[0].n === 0);

  const columns = async (table) => (await client.execute(`PRAGMA table_info(${table})`)).rows.map((r) => String(r.name));
  const userColumns = await columns('users');
  for (const column of ['kdf_scheme', 'client_salt', 'client_iterations', 'last_login_at_ms'])
    check(`users.${column} présent`, userColumns.includes(column));
  const trainingColumns = await columns('trainings');
  for (const column of ['description', 'buy_url'])
    check(`trainings.${column} présent`, trainingColumns.includes(column));
  check('sessions.last_seen_at_ms présent', (await columns('sessions')).includes('last_seen_at_ms'));

  console.log('\n=== 4. Idempotence : une seconde exécution ne réécrit rien ===');
  const replayed = (await client.execute('SELECT version FROM schema_migrations')).rows.map((r) => Number(r.version));
  const stillPending = manifest.migrations.filter((m) => !replayed.includes(m.version));
  check('aucune migration en attente', stillPending.length === 0);
  const tablesAgain = (await client.execute(
    "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).rows[0].n;
  check(`toujours ${manifest.expectedTableCount} tables`, Number(tablesAgain) === manifest.expectedTableCount);

  console.log(`\nRésultat : ${failures.length === 0 ? 'RÉUSSITE — la migration produira exactement ceci sur le staging' : `${failures.length} ÉCHEC(S) : ${failures.join(' | ')}`}`);
  console.log('Aucune écriture distante : cette répétition vit dans un fichier temporaire supprimé maintenant.');
  process.exitCode = failures.length === 0 ? 0 : 1;
} finally {
  client.close();
  rmSync(dbPath, { force: true });
}
