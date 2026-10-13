/* Migration contrôlée : DAVAR Campus, Turso libSQL — CIBLE STAGING PAR DÉFAUT.
 * AUCUNE écriture par défaut. Ne jamais charger .env.local.
 * --inspect : métadonnées seules ; --apply : écriture UNIQUEMENT après revue
 * du plan, jeton dédié et confirmation humaine dans le terminal.
 *
 * DAVAR_SCHEMA_TARGET=production (défaut : staging) change la cible ET les règles :
 *   - staging    : APP_ENV=staging, hôte `davar-campus-staging-*.turso.io`,
 *                  phrase « APPLIQUER DAVAR STAGING »
 *   - production : APP_ENV=production, hôte EXACT déclaré, JAMAIS un hôte
 *                  contenant « staging », phrase « APPLIQUER DAVAR PRODUCTION »
 * Un hôte staging ne peut donc pas être migré en croyant viser la production,
 * et inversement.
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
  {
    version: 3,
    file: '003_quota_counters.sqlite.sql',
    sha256: 'aa766d2f4081ba7dd4450b78db4536510cdd439490ad05d91a4498964acd2c4e',
    ddl: 4, // 2 tables + 2 index : compteurs de quota et journal d'opérations
    creates: ['ops_counters','ops_events'],
  },
  {
    version: 4,
    file: '004_client_side_kdf.sqlite.sql',
    sha256: '45a6eec2ca0a0d2e0575c478f7a10be2a80a9fc921e4c5b00ce2266d8305a140',
    ddl: 3, // 3 colonnes additives sur users : aucun objet détruit
    creates: [],
  },
  {
    version: 5,
    file: '005_comptes_test.sqlite.sql',
    sha256: '31022f91f6430b4f393d8b767ad0a7347ca5eb44bd0a2a74f5d4a3fbb18c20fb',
    ddl: 2, // 1 colonne additive + 1 index : les comptes de test sont marqués, pas déplacés
    creates: [],
  },
  {
    version: 6,
    file: '006_assistant_echanges_notifications.sqlite.sql',
    sha256: '4c40f35fb38da4243690c6227381cd49696658100b43d155df465a574a15fb22',
    ddl: 13, // 8 tables + 4 index + 1 colonne additive : assistant, conversations, notifications, réglages
    creates: ['assistant_config','assistant_kb','assistant_provider_days','assistant_user_days',
      'conversations','conversation_messages','notifications','app_settings'],
  },
  {
    version: 7,
    file: '007_pedagogie_certificats_recompenses.sqlite.sql',
    sha256: '52f551f6466762c47fffd5a104c7f4004f2b37cc710fec9f1f45df0bd162fa33',
    ddl: 23, // exercices, évaluations, devoirs, certificats, badges, avis, ressources
    creates: ['lesson_exercises','lesson_assessments','quiz_questions','quiz_answers','assessment_attempts',
      'submissions','certificate_requests','certificates','badge_defs','badge_awards','reviews',
      'resources','resource_allocations'],
  },
  {
    version: 8,
    file: '008_livres_audios_lecture.sqlite.sql',
    sha256: '616f0ade317fd330be6e2f8426f8b95a88e825afa1d0117f0483119ae5ab6ff3',
    ddl: 4, // 3 tables + 1 index : pages de livre, pistes audio, reprise de lecture
    creates: ['book_pages','audio_tracks','media_progress'],
  },
  {
    version: 9,
    file: '009_cles_api_exports.sqlite.sql',
    sha256: 'e3ea69cb6363bf3eaa6d37cfd964813eabcdc00fd21679aa3765b23f13570313',
    ddl: 4, // 2 tables + 2 index : clés d'accès révocables, journal des exports
    creates: ['api_keys','exports_log'],
  },
  {
    version: 10,
    file: '010_cycle_de_vie.sqlite.sql',
    sha256: '803a31621cdf45e0eaab7e68c7dc03cd5f6eee26c0eb871f6c213992eac4832e',
    ddl: 4, // 2 tables + 2 index : journal de purge et quarantaine des comptes
    creates: ['purge_log','purge_pending'],
  },
  {
    version: 11,
    file: '011_invitations_transfert.sqlite.sql',
    sha256: 'e67f64a0a4538db5f9ee7b7c990162790b59e45a44a35884b7b9fe1b45eb4293',
    ddl: 4, // 2 tables + 2 index : invitations et transfert de propriété
    creates: ['invites','ownership_transfers'],
  },
  {
    version: 12,
    file: '012_reseaux_sociaux.sqlite.sql',
    sha256: 'abf78f0adcfc8cd9971239805111e998671686369af817eda019ba0a0418de2b',
    ddl: 2, // 1 table + 1 index : confirmation d'abonnement aux réseaux
    creates: ['social_subscriptions'],
  },
  {
    version: 13,
    file: '013_preferences_utilisateur.sqlite.sql',
    sha256: 'e6e983b49a67e4e1bf56cece01cb7d6634bcbd7187db584ae1f5fd0bb6ced600',
    ddl: 1, // 1 table : préférences personnelles
    creates: ['user_prefs'],
  },
  {
    version: 14,
    file: '014_roles_equipe.sqlite.sql',
    sha256: '953e999cbb32187287dcf978760f6a6721fdd9fc258bab3d6e8a2aa106e034c9',
    ddl: 1, // 1 colonne ajoutée : les rôles du membre du staff
    creates: [],
  },
  {
    version: 15,
    file: '015_motif_badges.sqlite.sql',
    sha256: 'd7f3077f9443562fc1174eab92fb1c241ec84ebbb10730ba2b2226e9cb1e01da',
    ddl: 1, // 1 colonne ajoutée : le motif d'une attribution manuelle
    creates: [],
  },
  {
    version: 16,
    file: '016_journal_equipe.sqlite.sql',
    sha256: 'e600d77a5831917f9ce1fbcd7a1b32dac604a85b5463c26cec7e7df58e16434e',
    ddl: 3, // la table du journal et ses deux index
    creates: ['staff_events'],
  },
];
const EXPECTED_TABLE_COUNT = 49; // 48 après 013 — 014 et 015 ajoutent des colonnes, 016 ajoute le journal de l'équipe
const FORBIDDEN = /\b(drop|truncate|delete\s+from)\b/i;

const mode = process.argv[2];
// --manifest : lecture seule, sans environnement ni réseau. Permet à l'outillage
// et aux tests de vérifier que les fichiers correspondent au manifeste revu.
if (mode === '--manifest' && process.argv.length === 3) {
  console.log(JSON.stringify({ migrations: MIGRATIONS, expectedTableCount: EXPECTED_TABLE_COUNT }, null, 2));
  process.exit(0);
}
if (!['--inspect','--apply'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node scripts/staging-schema.mjs --inspect|--apply|--manifest');process.exit(2);
}
const target = (process.env.DAVAR_SCHEMA_TARGET ?? 'staging').trim();
if (target !== 'staging' && target !== 'production') {
  console.error('REFUS : DAVAR_SCHEMA_TARGET inconnu (valeurs admises : staging, production)');process.exit(2);
}
const isProduction = target === 'production';
const {APP_ENV,TURSO_DATABASE_URL:url,TURSO_EXPECTED_HOST:host,TURSO_AUTH_TOKEN:authToken} = process.env;
let parsed;
try {parsed = new URL(url);} catch {}
const looksStaging = /(^|[.-])staging([.-]|$)/i.test(host ?? '');
const commonChecks = APP_ENV === target && Boolean(authToken) && Boolean(host) && Boolean(parsed) &&
  ['libsql:','https:'].includes(parsed.protocol) && parsed.hostname === host && host.endsWith('.turso.io');
const targetChecks = isProduction
  ? !looksStaging                       // production : jamais un hôte de recette
  : host?.startsWith('davar-campus-staging-');
if (!commonChecks || !targetChecks) {
  console.error(`REFUS : cible DAVAR libSQL ${target} non vérifiée`);process.exit(2);
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
  console.log(`Moteur déclaré par opérateur: libSQL | cible: ${target}`);
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
      const phrase = isProduction ? 'APPLIQUER DAVAR PRODUCTION' : 'APPLIQUER DAVAR STAGING';
      try {answer = await rl.question(`ÉCRITURE ${target.toUpperCase()} uniquement. Tapez exactement ${phrase} : `);}
      finally {rl.close();}
      if (answer !== phrase) throw Error('Confirmation absente, aucune écriture');
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
    console.log(`Base ${target} vérifiée :`, names.join(', '));
    console.log('Aucune donnée étudiante, formation, paiement ou droit n’a été écrite.');
  }
} catch (error) {
  console.error('ARRÊT :', error instanceof Error ? error.message : 'erreur inconnue');
  process.exitCode = 1;
} finally {client.close();}
