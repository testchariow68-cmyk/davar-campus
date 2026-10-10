/**
 * ENVOI DES SECRETS VERS CLOUDFLARE — les pièges qui ne provoquent aucune erreur.
 *
 * La ligne de commande Cloudflare accepte un corps mal formé, répond 200, et
 * n'applique RIEN : le secret est absent en production alors que tout le monde a
 * vu « succès ». C'est le genre de panne qu'on découvre le jour où un étudiant
 * ne reçoit pas son e-mail. Ces tests verrouillent la forme et les garde-fous.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SECRETS_DECLARES,
  corpsSecrets,
  lireEnvLocale,
} from '../scripts/preparer-secrets.mjs';

const RACINE = new URL('..', import.meta.url).pathname;

test('la liste des secrets n’a pas divergé de cloudflare.config.ts', () => {
  // Un secret déclaré dans la configuration mais absent de la liste ne serait
  // jamais envoyé — et un secret de la liste absent de la configuration serait
  // inerte une fois en ligne. Les deux doivent donc rester identiques.
  const config = readFileSync(join(RACINE, 'cloudflare.config.ts'), 'utf8');
  const declares = [...config.matchAll(/^\s+([A-Z0-9_]+):\s*bindings\.secret\(\)/gm)].map((m) => m[1]);
  assert.deepEqual(
    [...SECRETS_DECLARES].sort(),
    [...declares].sort(),
    'les deux listes doivent être identiques — voir cloudflare.config.ts'
  );
});

test('le corps est ENVELOPPÉ : sans « secrets », l’API n’applique rien', () => {
  const corps = corpsSecrets(new Map([['GROQ_API_KEY', 'gsk_valeur']]));
  assert.ok(corps.secrets, 'l’enveloppe « secrets » est obligatoire (un corps à plat est ignoré)');
  assert.deepEqual(corps.secrets.GROQ_API_KEY, {
    type: 'secret_text',
    name: 'GROQ_API_KEY',
    text: 'gsk_valeur',
  });
});

test('une valeur vide est ignorée, jamais envoyée à vide', () => {
  const corps = corpsSecrets(
    new Map([
      ['GROQ_API_KEY', 'gsk_valeur'],
      ['GEMINI_API_KEY', ''],
      ['CHARIOW_PULSE_SECRET', '   '],
    ])
  );
  assert.deepEqual(Object.keys(corps.secrets), ['GROQ_API_KEY']);
  assert.equal(corps.secrets.GEMINI_API_KEY, undefined, 'un vide n’écrase pas une valeur déjà en ligne');
});

test('les guillemets autour d’une valeur sont retirés', () => {
  const valeurs = lireEnvLocale('GROQ_API_KEY="gsk_entre_guillemets"\nGEMINI_API_KEY=\'AIza_simple\'');
  assert.equal(valeurs.get('GROQ_API_KEY'), 'gsk_entre_guillemets');
  assert.equal(valeurs.get('GEMINI_API_KEY'), 'AIza_simple');
});

test('les commentaires et les lignes vides ne gênent pas', () => {
  const valeurs = lireEnvLocale('# un commentaire\n\nGROQ_API_KEY=gsk_ok\n# MAILER_KIND=apps_script\n');
  assert.equal(valeurs.size, 1);
  assert.equal(valeurs.get('GROQ_API_KEY'), 'gsk_ok');
});

test('MAILER_KIND et APP_PUBLIC_ORIGIN ne sont jamais envoyés comme secrets', () => {
  // Ils sont écrits par le déploiement lui-même ; les saisir à la main créerait
  // deux sources de vérité.
  const corps = corpsSecrets(new Map([['MAILER_KIND', 'apps_script'], ['APP_PUBLIC_ORIGIN', 'https://x.test']]));
  assert.deepEqual(corps.secrets, {});
  assert.equal(SECRETS_DECLARES.includes('MAILER_KIND'), false);
  assert.equal(SECRETS_DECLARES.includes('APP_PUBLIC_ORIGIN'), false);
});

test('la sortie ne contient JAMAIS la valeur d’un secret', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'davar-test-secrets-'));
  const cheminEnv = join(dossier, '.env.local');
  const VALEUR = 'valeur_ultra_secrete_qui_ne_doit_pas_apparaitre';
  writeFileSync(cheminEnv, `GROQ_API_KEY=${VALEUR}\n`);
  const cheminSortie = join(dossier, 'corps.json');

  const { main } = await import('../scripts/preparer-secrets.mjs');
  const sorties = [];
  const vraiLog = console.log;
  console.log = (...args) => sorties.push(args.join(' '));
  try {
    main(['--env', cheminEnv, '--out', cheminSortie], dossier);
  } finally {
    console.log = vraiLog;
  }

  const tout = sorties.join('\n');
  assert.ok(!tout.includes(VALEUR), `la valeur ne doit JAMAIS être imprimée :\n${tout}`);
  assert.ok(tout.includes('GROQ_API_KEY'), 'le nom, lui, doit apparaître');

  // Et le fichier, lui, la contient bien — c'est lui qui part vers Cloudflare.
  const corps = JSON.parse(readFileSync(cheminSortie, 'utf8'));
  assert.equal(corps.secrets.GROQ_API_KEY.text, VALEUR);
  rmSync(dossier, { recursive: true, force: true });
});

test('en production, une base de RECETTE est refusée', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'davar-test-staging-'));
  const cheminEnv = join(dossier, '.env.local');
  writeFileSync(cheminEnv, 'TURSO_DATABASE_URL=libsql://davar-campus-staging.turso.io\n');

  const { main } = await import('../scripts/preparer-secrets.mjs');
  const vraiErr = console.error;
  const erreurs = [];
  console.error = (...args) => erreurs.push(args.join(' '));
  const vraiLog = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(['--env', cheminEnv, '--production', '--dry-run'], dossier);
  } finally {
    console.error = vraiErr;
    console.log = vraiLog;
  }
  assert.equal(code, 1, 'le déploiement doit s’arrêter');
  assert.ok(erreurs.join('\n').includes('staging'));
  rmSync(dossier, { recursive: true, force: true });
});

test('sans aucun secret renseigné, rien n’est envoyé', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'davar-test-vide-'));
  const cheminEnv = join(dossier, '.env.local');
  writeFileSync(cheminEnv, 'APP_ENV=development\n');

  const { main } = await import('../scripts/preparer-secrets.mjs');
  const vraiErr = console.error;
  const vraiLog = console.log;
  console.error = () => {};
  console.log = () => {};
  let code;
  try {
    code = main(['--env', cheminEnv, '--dry-run'], dossier);
  } finally {
    console.error = vraiErr;
    console.log = vraiLog;
  }
  assert.equal(code, 1, 'un envoi vide ne doit pas être tenté');
  rmSync(dossier, { recursive: true, force: true });
});
