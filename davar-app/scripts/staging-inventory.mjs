/* Prévol lecture SEULE, sans .env.local, sans donnée nominative ni SQL de migration.
 * Exécuter uniquement avec des variables d'environnement privées hors chat.
 * Ne lit ni n'imprime les valeurs des secrets. N'ajoute aucune table.
 */
import {createClient} from '@libsql/client/web';
import {createHash} from 'node:crypto';

const {APP_ENV,TURSO_DATABASE_URL: url,TURSO_AUTH_TOKEN: authToken,
  TURSO_EXPECTED_HOST: host}=process.env;
if (APP_ENV !== 'staging' || !url || !authToken || !host) {
  console.error('REFUS : configuration staging incomplète'); process.exit(2);
}
let parsed;
try {parsed=new URL(url);} catch {console.error('REFUS : URL invalide');process.exit(2);}
if (!['libsql:','https:'].includes(parsed.protocol) || parsed.hostname!==host ||
    !host.toLowerCase().includes('staging')) {
  console.error('REFUS : hôte staging attendu absent ou incohérent');process.exit(2);
}
const client=createClient({url,authToken});
try {
  const ping=await client.execute('SELECT 1 AS ok');
  if (Number(ping.rows[0]?.ok)!==1) throw new Error('Sonde invalide');
  const result=await client.execute("SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type,name");
  console.log('Lecture seule réussie ; structure trouvée (aucune ligne métier lue) :');
  for (const row of result.rows) {
    const hash=createHash('sha256').update(String(row.sql ?? '')).digest('hex').slice(0,16);
    console.log(`${row.type} ${row.name} ddl_sha256_prefix=${hash}`);
  }
  const required=['schema_migrations','users','sessions','trainings','verified_purchases',
    'pulse_deliveries','enrollments','payment_intents','payment_events'];
  console.log('tables attendues absentes :',required.filter(n=>!result.rows.some(r=>r.type==='table' && r.name===n)).join(', ')||'(aucune)');
} catch {
  console.error('REFUS : inventaire impossible (aucune migration effectuée)');process.exitCode=1;
} finally {client.close();}
