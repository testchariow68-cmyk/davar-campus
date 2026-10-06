/* Migration contrôlée : DAVAR Campus, Turso libSQL staging uniquement.
 * AUCUNE écriture par défaut. Ne jamais charger .env.local.
 * --inspect : métadonnées seules ; --apply : écriture UNIQUEMENT après revue
 * du plan, jeton staging dédié et confirmation humaine dans le terminal.
 */
import {createClient} from '@libsql/client/web';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';

const expectedHash='12fd057ec91ee43c60d806314cc950dfe4ff3af6332c5643477a49f52ca311f9';
const requiredNames=['schema_migrations','users','sessions','trainings','verified_purchases',
  'pulse_deliveries','enrollments','payment_intents','payment_events'];
const mode=process.argv[2];
if (!['--inspect','--apply'].includes(mode) || process.argv.length!==3) {
  console.error('Usage: node scripts/staging-schema.mjs --inspect|--apply');process.exit(2);
}
const {APP_ENV,TURSO_DATABASE_URL:url,TURSO_EXPECTED_HOST:host,TURSO_AUTH_TOKEN:authToken}=process.env;
let parsed;
try {parsed=new URL(url);}catch{}
if (APP_ENV!=='staging'||!authToken||!host||!parsed||
    !['libsql:','https:'].includes(parsed.protocol)||parsed.hostname!==host||
    !host.startsWith('davar-campus-staging-')||!host.endsWith('.turso.io')) {
  console.error('REFUS : cible DAVAR libSQL staging non vérifiée');process.exit(2);
}
const sql=readFileSync(new URL('../turso/migrations/001_core.sqlite.sql',import.meta.url));
const hash=createHash('sha256').update(sql).digest('hex');
if(hash!==expectedHash){console.error('REFUS : migration différente de celle revue');process.exit(2);}
const statements=sql.toString('utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
const ddl=statements.filter(s=>!/^PRAGMA\s+foreign_keys\s*=\s*ON$/i.test(s));
if (ddl.length!==12||ddl.some(s=>!/^CREATE\s+(TABLE|INDEX)\s+[a-z_]+\s*/i.test(s))) {
  console.error('REFUS : liste des DDL inattendue');process.exit(2);
}
const client=createClient({url,authToken});
try {
  const ping=await client.execute('SELECT 1 AS ok');
  if(Number(ping.rows[0]?.ok)!==1) throw Error('Sonde de lecture refusée');
  const before=await client.execute("SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
  console.log('Moteur déclaré par opérateur: libSQL | environnement: staging');
  console.log('Table(s) utilisateur présente(s) :',before.rows.length);
  if(before.rows.length) {console.log('Noms :',before.rows.map(r=>r.name).join(', '));throw Error('Base non vide : aucun CREATE appliqué');}
  console.log('SHA-256 migration :',hash);
  console.log('DDL attendus :',ddl.length,'(9 tables, 3 index) ; aucune donnée étudiante ou formation insérée');
  if(mode==='--inspect') {console.log('Inspection seule : 0 écriture demandée.');process.exitCode=0;}
  else {
    const fk=await client.execute('PRAGMA foreign_keys');
    if(Number(fk.rows[0]?.foreign_keys)!==1) throw Error('Clés étrangères inactives ; revue requise, aucune écriture');
    const rl=createInterface({input:stdin,output:stdout});
    let answer;
    try {answer=await rl.question('ÉCRITURE STAGING uniquement. Tapez exactement APPLIQUER DAVAR STAGING : ');}
    finally {rl.close();}
    if(answer!=='APPLIQUER DAVAR STAGING') throw Error('Confirmation absente, aucune écriture');
    // Une transaction libSQL : chaque échec annule la migration entière.
    await client.batch([
      ...ddl,
      {sql:'INSERT INTO schema_migrations(version,checksum,installed_at_ms) VALUES (?,?,?)',
       args:[1,hash,Date.now()]},
    ],'write');
    const after=await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const names=after.rows.map(r=>String(r.name));
    if(requiredNames.some(name=>!names.includes(name))||names.length!==requiredNames.length) throw Error('Contrôle post-migration à examiner');
    const receipt=await client.execute('SELECT version,checksum FROM schema_migrations');
    if(Number(receipt.rows[0]?.version)!==1||receipt.rows[0]?.checksum!==hash) throw Error('Reçu de migration à examiner');
    console.log('Migration staging appliquée et vérifiée :',names.join(', '));
  }
} catch (error) {
  console.error('ARRÊT :',error instanceof Error?error.message:'erreur inconnue');process.exitCode=1;
} finally {client.close();}
