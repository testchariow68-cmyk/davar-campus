/**
 * Dérivation côté client : le navigateur paie le coût CPU, le serveur ne fait
 * qu'un contrôle bon marché. Base libSQL locale, aucun accès réseau.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.APP_ENV = 'development';
process.env.AUTH_PBKDF2_ITERATIONS = '10000';
process.env.AUTH_VERIFIER_ITERATIONS = '2000';

import { applyAllMigrations } from './helpers/migrations.mjs';

const {
  CLIENT_KDF_ITERATIONS,
  SERVER_VERIFIER_ITERATIONS,
  consumeEmailToken,
  derivationParams,
  deterministicSalt,
  hashClientVerifier,
  isClientVerifier,
  loginUser,
  randomClientSalt,
  registerClientUser,
  registerUser,
  schemeOf,
  verifyClientVerifier,
} = await import('../lib/server/auth-core.ts');
const { deriveClientKey, DerivationError } = await import('../lib/client/derive.ts');

const SECRET = 'secret-de-test-pour-le-sel-factice-32-caracteres';
const PASSWORD = 'Formation-Davar-2026!';

async function freshDb() {
  const client = createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), 'davar-client-')), 'c.db')}` });
  await applyAllMigrations(client);
  return client;
}

/** Parcours complet d'un nouvel étudiant, tel que le fait le navigateur. */
async function registerAndLogin(db, email, password = PASSWORD) {
  const params = await derivationParams(db, email, SECRET);
  const verifier = await deriveClientKey(password, params);
  const registration = await registerClientUser(db, {
    email,
    displayName: 'Étudiant Client',
    verifier,
    salt: params.salt,
    iterations: params.iterations,
  });
  await consumeEmailToken(db, registration.verificationToken, 'verify_email');
  return { params, verifier, registration };
}

test('la dérivation navigateur produit une clé de 32 octets, jamais le mot de passe', async () => {
  const salt = randomClientSalt();
  const verifier = await deriveClientKey(PASSWORD, { salt, iterations: CLIENT_KDF_ITERATIONS });
  assert.equal(isClientVerifier(verifier), true);
  assert.equal(verifier.length, 43);
  assert.equal(verifier.includes(PASSWORD), false);
  // Déterminisme : le même couple (mot de passe, sel) redonne la même clé.
  assert.equal(await deriveClientKey(PASSWORD, { salt, iterations: CLIENT_KDF_ITERATIONS }), verifier);
  // Un sel différent change la clé : pas de table précalculée réutilisable.
  const other = await deriveClientKey(PASSWORD, { salt: randomClientSalt(), iterations: CLIENT_KDF_ITERATIONS });
  assert.notEqual(other, verifier);
  // Un mot de passe différent aussi.
  assert.notEqual(await deriveClientKey('Formation-Davar-2027!', { salt, iterations: CLIENT_KDF_ITERATIONS }), verifier);
});

test('garde-fous de la dérivation côté navigateur', async () => {
  await assert.rejects(() => deriveClientKey('', { salt: randomClientSalt(), iterations: CLIENT_KDF_ITERATIONS }), DerivationError);
  await assert.rejects(() => deriveClientKey(PASSWORD, { salt: '', iterations: CLIENT_KDF_ITERATIONS }), DerivationError);
  await assert.rejects(
    () => deriveClientKey(PASSWORD, { salt: randomClientSalt(), iterations: 1_000 }),
    DerivationError,
    'un nombre d’itérations trop faible doit être refusé par le client'
  );
});

test('vérificateur stocké : jamais la clé du client, et coût serveur borné', async () => {
  const verifier = await deriveClientKey(PASSWORD, { salt: randomClientSalt(), iterations: CLIENT_KDF_ITERATIONS });
  const stored = await hashClientVerifier(verifier, { verifierPepper: 'poivre-de-test-16-caracteres' });
  assert.match(stored, /^pbkdf2-sha256\$/);
  assert.equal(stored.includes(verifier), false, 'la clé client ne doit pas apparaître dans le vérificateur');
  assert.equal((await verifyClientVerifier(verifier, stored, { verifierPepper: 'poivre-de-test-16-caracteres' })).ok, true);
  assert.equal(
    (await verifyClientVerifier(verifier, stored, { verifierPepper: 'autre-poivre-de-16-caracteres!!' })).ok,
    false,
    'un poivre différent doit invalider la vérification'
  );

  // Coût serveur : la vérification doit rester très en deçà du plafond de 10 ms.
  const budget = SERVER_VERIFIER_ITERATIONS;
  assert.ok(budget <= 30_000, `itérations de vérification trop élevées : ${budget}`);
  assert.ok(CLIENT_KDF_ITERATIONS >= 600_000, 'la politique client ne doit jamais descendre sous 600 000 itérations');
});

test('paramètres de dérivation : sel stable et unique par adresse', async () => {
  const db = await freshDb();
  const first = await derivationParams(db, 'inconnu@exemple.com', SECRET);
  const second = await derivationParams(db, 'inconnu@exemple.com', SECRET);
  const other = await derivationParams(db, 'autre@exemple.com', SECRET);
  assert.equal(first.scheme, 'client-v1');
  assert.equal(first.salt, second.salt, 'le sel factice doit être déterministe');
  assert.notEqual(first.salt, other.salt);
  assert.equal(first.iterations, CLIENT_KDF_ITERATIONS);
  assert.ok(await deterministicSalt('un-autre-secret-de-32-caracteres-minimum', 'inconnu@exemple.com') !== first.salt);
});

test('anti-énumération : adresse connue et adresse inconnue sont indiscernables', async () => {
  const db = await freshDb();
  const known = await registerAndLogin(db, 'connu@exemple.com');
  const knownAgain = await derivationParams(db, 'connu@exemple.com', SECRET);
  const unknown = await derivationParams(db, 'jamais-vu@exemple.com', SECRET);
  // Même forme de réponse : mêmes clés, mêmes types, même longueur de sel.
  assert.deepEqual(Object.keys(knownAgain).sort(), Object.keys(unknown).sort());
  assert.equal(knownAgain.salt.length, unknown.salt.length);
  assert.equal(knownAgain.iterations, unknown.iterations);
  assert.equal(knownAgain.salt, known.params.salt, 'le sel enregistré doit être celui annoncé');
});

test('inscription et connexion client-v1 de bout en bout', async () => {
  const db = await freshDb();
  const { verifier, registration } = await registerAndLogin(db, 'marie@exemple.com');

  const row = await db.execute('SELECT kdf_scheme, client_salt, client_iterations FROM users WHERE id = ?', [
    registration.userId,
  ]);
  assert.equal(schemeOf(row.rows[0]), 'client-v1');
  assert.ok(typeof row.rows[0].client_salt === 'string' && row.rows[0].client_salt.length >= 16);
  assert.equal(Number(row.rows[0].client_iterations), CLIENT_KDF_ITERATIONS);

  const session = await loginUser(db, { email: 'marie@exemple.com', verifier, ipHash: 'ip-de-test' });
  assert.equal(session.user.email, 'marie@exemple.com');

  // Mauvaise clé : refus.
  const wrong = await deriveClientKey('Mauvais-Mot-De-Passe-2026!', {
    salt: (await derivationParams(db, 'marie@exemple.com', SECRET)).salt,
    iterations: CLIENT_KDF_ITERATIONS,
  });
  await assert.rejects(
    () => loginUser(db, { email: 'marie@exemple.com', verifier: wrong, ipHash: 'ip-de-test-2' }),
    (error) => error.code === 'invalid_credentials'
  );
});

test('un compte client-v1 refuse un mot de passe en clair, et inversement', async () => {
  const db = await freshDb();
  const { verifier } = await registerAndLogin(db, 'schema@exemple.com');
  await assert.rejects(
    () => loginUser(db, { email: 'schema@exemple.com', password: PASSWORD, ipHash: 'ip-a' }),
    (error) => error.code === 'kdf_scheme_mismatch'
  );

  // Compte hérité (hachage serveur) : la clé client doit être refusée, le mot de passe accepté.
  const legacy = await registerUser(db, { email: 'herite@exemple.com', displayName: 'Compte Hérité', password: PASSWORD });
  await consumeEmailToken(db, legacy.verificationToken, 'verify_email');
  const params = await derivationParams(db, 'herite@exemple.com', SECRET);
  assert.equal(params.scheme, 'server-v1', 'un compte hérité ne doit pas annoncer une dérivation client');
  await assert.rejects(
    () => loginUser(db, { email: 'herite@exemple.com', verifier, ipHash: 'ip-b' }),
    (error) => error.code === 'kdf_scheme_mismatch'
  );
  const session = await loginUser(db, { email: 'herite@exemple.com', password: PASSWORD, ipHash: 'ip-c' });
  assert.equal(session.user.email, 'herite@exemple.com');
});

test('inscription : sel et itérations non conformes refusés', async () => {
  const db = await freshDb();
  const params = await derivationParams(db, 'strict@exemple.com', SECRET);
  const verifier = await deriveClientKey(PASSWORD, params);
  await assert.rejects(
    () => registerClientUser(db, { email: 'strict@exemple.com', displayName: 'Strict', verifier, salt: 'court', iterations: params.iterations }),
    (error) => error.code === 'invalid_input'
  );
  await assert.rejects(
    () =>
      registerClientUser(db, {
        email: 'strict@exemple.com',
        displayName: 'Strict',
        verifier,
        salt: params.salt,
        iterations: 1_000,
      }),
    (error) => error.code === 'invalid_input',
    'un client ne doit pas pouvoir imposer un coût de dérivation dérisoire'
  );
  await assert.rejects(
    () =>
      registerClientUser(db, {
        email: 'strict@exemple.com',
        displayName: 'Strict',
        verifier: 'mot-de-passe-en-clair',
        salt: params.salt,
        iterations: params.iterations,
      }),
    (error) => error.code === 'invalid_input'
  );
});

test('le compte client reste inutilisable avant confirmation d’e-mail', async () => {
  const db = await freshDb();
  const params = await derivationParams(db, 'non-confirme@exemple.com', SECRET);
  const verifier = await deriveClientKey(PASSWORD, params);
  await registerClientUser(db, {
    email: 'non-confirme@exemple.com',
    displayName: 'Sans Confirmation',
    verifier,
    salt: params.salt,
    iterations: params.iterations,
  });
  await assert.rejects(
    () => loginUser(db, { email: 'non-confirme@exemple.com', verifier, ipHash: 'ip-d' }),
    (error) => error.code === 'email_not_verified'
  );
});
