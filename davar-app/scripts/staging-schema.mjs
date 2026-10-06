/* Migration contrôlée : DAVAR Campus, Turso libSQL staging uniquement.
 * AUCUNE écriture par défaut. Ne jamais charger .env.local.
 * --inspect : métadonnées seules ; --apply : écriture UNIQUEMENT après revue
 * du plan, jeton staging dédié et confirmation humaine dans le terminal.
 *
 * Le script est un manifeste fermé : chaque migration est identifiée par son
 * SHA-256 revu, son nombre exact de DDL et les tables qu'elle doit produire.
 * Tout écart arrête l'opération avant la moindre écriture.
 */
import {createClient} from '@libsql/client/web';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';

const MIGRATIONS = [
  {
    version: 1,
    file: '001_core.sqlite.sql',
    sha256: '12fd057ec91ee43c60d806314cc950dfe4ff3af6332c5643477a49f52ca311f9',
    ddl: 12, // 9 tables + 3 index
    creates: ['schema_migrations','users','sessions','trainings','verified_purchases',
      'pulse_deliveries','enrollments','payment_intents','payment_events'],
  },
  {
    version: 2,
    file: '002_auth_campus.sqlite.sql',
    sha256: 'd72a5bfe0f56e78047859dcd9c4d86f075e47bb4a76e390afeee36022e05c389',
    ddl: 10, // 5 tables + 1 index + 4 colonnes additives (aucune suppression)
    creates: ['email_tokens','rate_limits','course_modules','course_lessons','lesson_completions'],
  },
];
const EXPECTED_TABLE_COUNT = 14; // 9 après 001 + 5 après 002
const FORBIDDEN = /\b(drop|truncate|delete\s+from)\b/i;

const mode = process.argv[2];
if (!['--inspect','--apply'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node scripts/staging-schema.mjs --inspect|--apply');process.exit(2);
}
const {APP_ENV,TURSO_DATABASE_URL:url,TURSO_EXPECTED_HOST:host,TURSO_AUTH_TOKEN:authToken} = process.env;
let parsed;
try {parsed = new URL(url);} catch {}
if (APP_ENV !== 'staging' || !authToken || !host || !parsed ||
    !['libsql:','https:'].includes(parsed.protocol) || parsed.hostname !== host ||
    !host.startsWith('davar-campus-staging-') || !host.endsWith('.turso.io')) {
  console.error('REFUS : cible DAVAR libSQL staging non vérifiée');process.exit(2);
}

/** Charge une migration, vérifie l'empreinte revue puis la liste des DDL. */
function reviewed(migration) {
  const sql = readFileSync(new URL(`../turso/migrations/${migration.file}`,import.meta.url));
  const hash = createHash('sha256').update(sql).digest('hex');
  if (hash !== migration.sha256) throw Error(`REFUS : ${migration.file} différente de celle revue`);
  const statements = sql.toString('utf8').replace(/^--.*$/gm,'').split(';').map(s => s.trim()).filter(Boolean);
  if (statements.some(s => pragmaLike(s) && !/^PRAGMA\s+foreign_keys\s*=\s*ON$/i.test(s)))
    throw Error('REFUS : PRAGMA inattendu');
  const ddl = statements.filter(s => !pragmaLike(s));
  if (ddl.length !== migration.ddl) throw Error(`REFUS : ${migration.file} — ${ddl.length} DDL au lieu de ${migration.ddl}`);
  for (const statement of ddl) {
    if (FORBIDDEN.test(statement)) throw Error('REFUS : instruction destructive détectée');
    if (!/^(CREATE\s+(TABLE|INDEX)\s+[a-z_]+|ALTER\s+TABLE\s+[a-z_]+\s+ADD\s+COLUMN\s+[a-z_]+)/i.test(statement))
      throw Error(`REFUS : DDL inattendu dans ${migration.file}`);
  }
  for (const table of migration.creates)
    if (!ddl.some(s => new RegExp(`^CREATE\\s+TABLE\\s+${table}\\b`,'i').test(s)))
      throw Error(`REFUS : ${migration.file} ne crée pas ${table}`);
  return {sql: statements.filter(s => !pragmaLike(s)), hash, ddl: ddl.length};
}
function pragmaLike(statement) {return /^PRAGMA\b/i.test(statement);}

const client = createClient({url, authToken});
try {
  const ping = await client.execute('SELECT 1 AS ok');
  if (Number(ping.rows[0]?.ok) !== 1) throw Error('Sonde de lecture refusée');

  const before = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const existing = before.rows.map(row => String(row.name));
  console.log('Moteur déclaré par opérateur: libSQL | environnement: staging');
  console.log('Table(s) déjà présente(s) :', existing.length ? existing.join(', ') : 'aucune');

  const applied = new Map();
  if (existing.includes('schema_migrations')) {
    const receipt = await client.execute('SELECT version, checksum FROM schema_migrations');
    for (const row of receipt.rows) applied.set(Number(row.version), String(row.checksum));
  } else if (existing.length) {
    throw Error('Base non vide sans registre de migration : revue requise, aucune écriture');
  }
  for (const [version, checksum] of applied) {
    const migration = MIGRATIONS.find(item => item.version === version);
    if (!migration || migration.sha256 !== checksum)
      throw Error(`Migration ${version} absente du manifeste revu ou empreinte différente`);
  }

  for (const migration of MIGRATIONS) {
    const {hash, ddl} = reviewed(migration);
    const state = applied.has(migration.version) ? 'déjà appliquée' : 'à appliquer';
    console.log(`${migration.file} [v${migration.version}] ${state} — SHA-256 ${hash} — ${ddl} DDL`);
  }

  if (mode === '--inspect') {
    console.log('Inspection seule : 0 écriture demandée.');
  } else {
    const pending = MIGRATIONS.filter(migration => !applied.has(migration.version));
    if (pending.length === 0) {console.log('Aucune migration en attente : rien à écrire.');}
    else {
      const fk = await client.execute('PRAGMA foreign_keys');
      if (Number(fk.rows[0]?.foreign_keys) !== 1) throw Error('Clés étrangères inactives ; revue requise, aucune écriture');
      const rl = createInterface({input:stdin,output:stdout});
      let answer;
      try {answer = await rl.question('ÉCRITURE STAGING uniquement. Tapez exactement APPLIQUER DAVAR STAGING : ');}
      finally {rl.close();}
      if (answer !== 'APPLIQUER DAVAR STAGING') throw Error('Confirmation absente, aucune écriture');
      for (const migration of pending) {
        const {sql, hash, ddl} = reviewed(migration);
        // Une transaction libSQL par migration : un échec annule la migration entière.
        await client.batch([
          ...sql,
          {sql:'INSERT INTO schema_migrations(version,checksum,installed_at_ms) VALUES (?,?,?)',
           args:[migration.version,hash,Date.now()]},
        ],'write');
        console.log(`Migration ${migration.file} appliquée (${ddl} DDL, empreinte ${hash.slice(0,12)}…)`);
      }
    }

    const after = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const names = after.rows.map(row => String(row.name));
    const expected = MIGRATIONS.flatMap(migration => migration.creates);
    if (names.length !== EXPECTED_TABLE_COUNT || expected.some(name => !names.includes(name)))
      throw Error('Contrôle post-migration à examiner');
    const receipt = await client.execute('SELECT version, checksum FROM schema_migrations ORDER BY version');
    const seen = receipt.rows.map(row => [Number(row.version), String(row.checksum)]);
    if (seen.length !== MIGRATIONS.length ||
        MIGRATIONS.some((migration, index) => seen[index][0] !== migration.version || seen[index][1] !== migration.sha256))
      throw Error('Reçu de migration à examiner');
    console.log('Staging vérifié :', names.join(', '));
    console.log('Aucune donnée étudiante, formation, paiement ou droit n’a été écrite.');
  }
} catch (error) {
  console.error('ARRÊT :', error instanceof Error ? error.message : 'erreur inconnue');
  process.exitCode = 1;
} finally {client.close();}
