/**
 * RECETTE DES SERVICES — la garantie qui compte, verrouillée par un test.
 *
 * Le propriétaire va lancer `npm run recette:services` avec de VRAIS secrets
 * dans `.env.local`. La sortie de ce script peut donc être copiée, collée,
 * montrée : elle ne doit JAMAIS contenir la valeur d'un secret. C'est la
 * propriété que ce test protège — en donnant au script des valeurs de
 * remplacement reconnaissables, puis en vérifiant qu'aucune n'apparaît.
 *
 * Le test n'appelle aucun service : les valeurs R2 posées sont volontairement
 * d'un format invalide, donc le script s'arrête au diagnostic de format sans
 * toucher au réseau ; l'adresse du relais d'e-mail est en http, donc refusée
 * avant tout envoi.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const RACINE = new URL('..', import.meta.url).pathname;

/** Valeurs de remplacement : reconnaissables, jamais de vrais secrets. */
const FAUX = {
  R2_ACCOUNT_ID: 'PAS-UN-IDENTIFIANT-DE-COMPTE-0123456789abcdef',
  R2_ACCESS_KEY_ID: 'FAUSSE-CLE-ACCES-0000000000000000',
  R2_SECRET_ACCESS_KEY: 'FAUSSE-CLE-SECRETE-0000000000000000',
  R2_BUCKET: 'Seau.Invalide',
  MAIL_APPS_SCRIPT_URL: 'http://relais.example/exec',
  MAIL_APPS_SCRIPT_TOKEN: 'FAUX-JETON-DE-RELAIS-000000000000',
  CHARIOW_PULSE_SECRET: 'FAUX-SECRET-PULSE-0000000000000000',
  CHARIOW_PULSE_ID: 'FAUX-IDENTIFIANT-PULSE',
  CHARIOW_API_KEY: 'FAUSSE-CLE-API-CHARIOW-000000',
  CHARIOW_STORE_ID: 'FAUX-MAGASIN',
  TURSO_DATABASE_URL: '',
  TURSO_AUTH_TOKEN: '',
  MAILER_KIND: '',
  BREVO_API_KEY: '',
  MAIL_FROM_EMAIL: '',
  // Vidées pour que le test ne dépende pas du .env.local de la machine : un
  // fichier local bien rempli ne doit pas changer le verdict de la recette.
  AUTH_PARAMS_SECRET: '',
  AUTH_VERIFIER_PEPPER: '',
  APP_DIAGNOSTIC_TOKEN: '',
};

/** Les mêmes noms, tous vidés : l'état « rien n'est encore branché ». */
const SANS_RIEN = Object.fromEntries(Object.keys(FAUX).map((nom) => [nom, '']));

function lancer(env) {
  const resultat = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/recette-services.mjs'], {
    cwd: RACINE,
    env: { ...process.env, ...FAUX, ...env },
    encoding: 'utf8',
  });
  return { code: resultat.status, sortie: `${resultat.stdout ?? ''}${resultat.stderr ?? ''}` };
}

test('la recette des services n’affiche jamais la valeur d’un secret', () => {
  const { sortie } = lancer({});
  for (const [nom, valeur] of Object.entries(FAUX)) {
    if (valeur.length < 8) continue; // les champs vidés ne prouvent rien
    assert.equal(sortie.includes(valeur), false, `la valeur de ${nom} apparaît dans la sortie de la recette`);
  }
  // Elle nomme les variables et donne leur ÉTAT, sans leur contenu.
  assert.match(sortie, /R2_ACCOUNT_ID : posée/);
  assert.match(sortie, /RECETTE/);
});

test('une valeur mal collée est nommée, et compte comme un échec', () => {
  const { code, sortie } = lancer({ MAILER_KIND: 'apps_script' });
  assert.match(sortie, /l’identifiant de compte a le bon format/);
  assert.match(sortie, /le nom du seau est utilisable/);
  assert.match(sortie, /l’adresse du relais est bien en https/);
  assert.equal(code, 1, 'un service configuré qui ne répond pas doit faire sortir la recette en erreur');
});

test('des valeurs posées sans mode d’envoi déclaré sont signalées', () => {
  const { code, sortie } = lancer({
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: '',
    MAIL_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/xxx/exec',
    MAIL_APPS_SCRIPT_TOKEN: 'FAUX-JETON-DE-RELAIS-000000000000',
    MAILER_KIND: '',
  });
  assert.match(sortie, /le mode d’envoi est déclaré/);
  assert.equal(code, 1);
});

test('un service en attente n’est pas un échec : la recette sort en succès', () => {
  const { code, sortie } = lancer(SANS_RIEN);
  assert.match(sortie, /en attente/);
  assert.match(sortie, /CHARIOW_ENABLE_PULSE : false/);
  assert.equal(sortie.includes('ÉCHEC'), false, `aucun contrôle ne devrait échouer :\n${sortie}`);
  assert.equal(code, 0);
});

test('un mode d’envoi déclaré mais rien de posé reste un ÉTAT, pas un échec', () => {
  const { code, sortie } = lancer({
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: '',
    MAIL_APPS_SCRIPT_URL: '',
    MAIL_APPS_SCRIPT_TOKEN: '',
    MAILER_KIND: 'apps_script',
    TURSO_DATABASE_URL: '',
  });
  assert.match(sortie, /en attente : aucune inscription réelle ne partira/);
  assert.equal(sortie.includes('ÉCHEC'), false, `aucun contrôle ne devrait échouer :\n${sortie}`);
  assert.equal(code, 0);
});

test('les trois clés internes sont nommées, jamais montrées, et une trop courte est un échec', () => {
  const { code, sortie } = lancer({
    AUTH_PARAMS_SECRET: 'aa71' + '0'.repeat(60),
    AUTH_VERIFIER_PEPPER: 'court',
    APP_DIAGNOSTIC_TOKEN: 'bb82' + '1'.repeat(60),
  });
  // Nommées…
  for (const nom of ['AUTH_PARAMS_SECRET', 'AUTH_VERIFIER_PEPPER', 'APP_DIAGNOSTIC_TOKEN']) {
    assert.equal(sortie.includes(`${nom} : posée`), true, `${nom} devrait être listée comme posée :\n${sortie}`);
  }
  // …et jamais montrées, même en partie.
  for (const valeur of ['aa71' + '0'.repeat(60), 'bb82' + '1'.repeat(60)]) {
    assert.equal(sortie.includes(valeur), false, 'une valeur de clé interne apparaît dans la sortie');
  }
  // Le poivre trop court est un échec — c'est ce qui casse la production en silence.
  assert.match(sortie, /AUTH_VERIFIER_PEPPER est assez long/);
  assert.equal(code, 1);
});

test('les trois clés internes absentes restent un état, sans échec', () => {
  const { code, sortie } = lancer(SANS_RIEN);
  assert.match(sortie, /1\. VOS CLÉS INTERNES/);
  assert.match(sortie, /AUTH_PARAMS_SECRET : ABSENTE/);
  assert.match(sortie, /lancez « npm run env:local » et les trois sont écrites pour vous/);
  assert.equal(code, 0);
});

test('le jeton du relais d’e-mail n’est jamais envoyé sans le mode d’envoi', () => {
  // Garde-fou : sans MAILER_KIND, aucune requête ne part vers l’adresse posée.
  // L’adresse utilisée ici est un domaine qui n’existe pas ; si le script y
  // touchait, la sortie cesserait de dire « en attente ».
  const { sortie } = lancer({
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: '',
    MAIL_APPS_SCRIPT_URL: 'https://ce-domaine-ne-doit-jamais-etre-appele.example/exec',
    MAIL_APPS_SCRIPT_TOKEN: '',
    MAILER_KIND: '',
  });
  assert.match(sortie, /le mode d’envoi est déclaré/);
  assert.equal(sortie.includes('relais Google répond en ligne'), false, `aucune requête ne doit partir :\n${sortie}`);
  assert.equal(sortie.includes('injoignable'), false);
});
