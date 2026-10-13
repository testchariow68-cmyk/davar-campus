/**
 * Tests locaux du noyau d'authentification : base libSQL sur fichier temporaire,
 * aucun accès réseau, aucun secret réel. Exécution :
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  AuthError,
  assertPasswordPolicy,
  claimPurchasesForVerifiedUser,
  consumeEmailToken,
  consumeRateLimit,
  createSession,
  hashPassword,
  loginUser,
  normalizeEmail,
  registerUser,
  resolveSession,
  revokeSession,
  verifyPassword,
} from '../lib/server/auth-core.ts';

// Itérations réduites : ici on teste la logique, pas le coût du hachage.
process.env.APP_ENV = 'development';
process.env.AUTH_PBKDF2_ITERATIONS = '10000';

async function freshDb() {
  const client = createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), 'davar-test-')), 'test.db')}` });
  await applyAllMigrations(client);
  return client;
}

const STRONG_PASSWORD = 'Formation-Davar-2026!';

test('schéma 002 présent : auth, contenu et progression', async () => {
  const db = await freshDb();
  const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).rows.map(
    (row) => row.name
  );
  for (const table of ['email_tokens', 'rate_limits', 'course_modules', 'course_lessons', 'lesson_completions'])
    assert.ok(tables.includes(table), `table manquante : ${table}`);
  const columns = (await db.execute('PRAGMA table_info(trainings)')).rows.map((row) => row.name);
  assert.ok(columns.includes('description') && columns.includes('buy_url'));
});

test('e-mail normalisé et mot de passe faible refusé', () => {
  assert.equal(normalizeEmail('  Etudiant@Exemple.COM '), 'etudiant@exemple.com');
  assert.throws(() => normalizeEmail('pas-un-email'), AuthError);
  assert.throws(() => assertPasswordPolicy('court', 'etudiant@exemple.com'), AuthError);
  assert.throws(() => assertPasswordPolicy('motdepasse', 'etudiant@exemple.com'), AuthError);
  assert.equal(assertPasswordPolicy(STRONG_PASSWORD, 'etudiant@exemple.com'), STRONG_PASSWORD);
});

test('hachage : jamais le mot de passe en clair, mauvais mot de passe refusé', async () => {
  const stored = await hashPassword(STRONG_PASSWORD);
  assert.ok(stored.startsWith('pbkdf2-sha256$'));
  assert.ok(!stored.includes(STRONG_PASSWORD));
  assert.equal((await verifyPassword(STRONG_PASSWORD, stored)).ok, true);
  assert.equal((await verifyPassword(`${STRONG_PASSWORD}x`, stored)).ok, false);
  assert.equal((await verifyPassword(STRONG_PASSWORD, 'pbkdf2-sha256$abc$zz$zz')).ok, false);
  assert.equal((await verifyPassword(STRONG_PASSWORD, 'argon2id$v=19$m=1,t=1,p=1$x$y')).ok, false);
});

test('inscription : compte non vérifié, connexion refusée, puis session après confirmation', async () => {
  const db = await freshDb();
  const registration = await registerUser(db, {
    email: 'Etudiant@Exemple.COM',
    displayName: 'Awa Koné',
    password: STRONG_PASSWORD,
  });

  const storedToken = await db.execute('SELECT token_hash, purpose, used_at_ms FROM email_tokens WHERE user_id = ?', [
    registration.userId,
  ]);
  assert.equal(storedToken.rows.length, 1);
  assert.notEqual(storedToken.rows[0].token_hash, registration.verificationToken, 'jeton stocké en clair');
  assert.equal(storedToken.rows[0].token_hash.length, 64);

  await assert.rejects(
    () => loginUser(db, { email: 'etudiant@exemple.com', password: STRONG_PASSWORD }),
    (error) => error instanceof AuthError && error.code === 'email_not_verified'
  );

  await assert.rejects(
    () => loginUser(db, { email: 'etudiant@exemple.com', password: 'mauvais-mot-de-passe' }),
    (error) => error instanceof AuthError && error.code === 'invalid_credentials'
  );

  const consumed = await consumeEmailToken(db, registration.verificationToken, 'verify_email');
  assert.equal(consumed.userId, registration.userId);
  await assert.rejects(
    () => consumeEmailToken(db, registration.verificationToken, 'verify_email'),
    (error) => error instanceof AuthError && error.code === 'invalid_token'
  );

  const session = await loginUser(db, { email: 'etudiant@exemple.com', password: STRONG_PASSWORD, ipHash: 'ip-de-test' });
  assert.equal(session.user.emailVerified, true);
  assert.equal(session.user.role, 'student');

  const resolved = await resolveSession(db, session.token);
  assert.equal(resolved?.id, registration.userId);
  assert.equal(await resolveSession(db, `${session.token.slice(0, -1)}X`), null);

  await revokeSession(db, session.token);
  assert.equal(await resolveSession(db, session.token), null);
});

test('inscription : adresse déjà utilisée refusée sans révéler le mot de passe', async () => {
  const db = await freshDb();
  await registerUser(db, { email: 'doublon@exemple.com', displayName: 'Premier', password: STRONG_PASSWORD });
  await assert.rejects(
    () => registerUser(db, { email: 'DOUBLON@exemple.com', displayName: 'Second', password: STRONG_PASSWORD }),
    (error) => error instanceof AuthError && error.code === 'email_taken'
  );
});

test('rattachement Chariow : rien avant confirmation, une seule fois après', async () => {
  const db = await freshDb();
  await db.execute({
    sql: "INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('t-orateur','Devenir un excellent orateur',45000,'prd_6wx1czzp',1)",
  });
  const registration = await registerUser(db, {
    email: 'acheteur@exemple.com',
    displayName: 'Acheteur Externe',
    password: STRONG_PASSWORD,
  });

  // Vente Chariow déjà vérifiée par le webhook, avant même la confirmation d'e-mail.
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sal_test_0001','acheteur@exemple.com','t-orateur','45000','XOF',?)`,
    args: [Date.now()],
  });
  await db.execute({
    sql: "INSERT INTO pulse_deliveries(delivery_id,sale_id,received_at_ms) VALUES ('dlv_test_0001','sal_test_0001',?)",
    args: [Date.now()],
  });

  assert.equal(await claimPurchasesForVerifiedUser(db, registration.userId), 0, 'accès accordé avant vérification');

  await consumeEmailToken(db, registration.verificationToken, 'verify_email');
  assert.equal(await claimPurchasesForVerifiedUser(db, registration.userId), 1);
  assert.equal(await claimPurchasesForVerifiedUser(db, registration.userId), 0, 'inscription dupliquée');

  const enrollments = await db.execute('SELECT training_id, source, sale_id FROM enrollments WHERE user_id = ?', [
    registration.userId,
  ]);
  assert.equal(enrollments.rows.length, 1);
  assert.equal(enrollments.rows[0].training_id, 't-orateur');
  assert.equal(enrollments.rows[0].source, 'verified_purchase');
  assert.equal(enrollments.rows[0].sale_id, 'sal_test_0001');
});

test('limitation de débit : troisième tentative bloquée dans la fenêtre', async () => {
  const db = await freshDb();
  const options = { limit: 2, windowMs: 60_000 };
  assert.equal((await consumeRateLimit(db, 'login.email:test', options)).allowed, true);
  assert.equal((await consumeRateLimit(db, 'login.email:test', options)).allowed, true);
  const blocked = await consumeRateLimit(db, 'login.email:test', options);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 60);
  const later = await consumeRateLimit(db, 'login.email:test', { ...options, now: Date.now() + 60_001 });
  assert.equal(later.allowed, true);
});

test('session expirée refusée et supprimée', async () => {
  const db = await freshDb();
  const registration = await registerUser(db, {
    email: 'expire@exemple.com',
    displayName: 'Compte Test',
    password: STRONG_PASSWORD,
  });
  await consumeEmailToken(db, registration.verificationToken, 'verify_email');
  const past = Date.now() - 40 * 24 * 60 * 60 * 1000;
  const { token } = await createSession(db, registration.userId, past, 30 * 24 * 60 * 60 * 1000);
  assert.equal(await resolveSession(db, token), null);
  const remaining = await db.execute('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?', [registration.userId]);
  assert.equal(Number(remaining.rows[0].c), 0);
});

test('suspension : un compte suspendu ne peut ni se connecter ni garder sa session', async () => {
  const db = await freshDb();
  const registration = await registerUser(db, {
    email: 'suspendu@exemple.com',
    displayName: 'Compte Suspendu',
    password: STRONG_PASSWORD,
  });
  await consumeEmailToken(db, registration.verificationToken, 'verify_email');
  const session = await loginUser(db, { email: 'suspendu@exemple.com', password: STRONG_PASSWORD });
  await db.execute({ sql: "UPDATE users SET status = 'suspended' WHERE id = ?", args: [registration.userId] });
  assert.equal(await resolveSession(db, session.token), null);
  await assert.rejects(
    () => loginUser(db, { email: 'suspendu@exemple.com', password: STRONG_PASSWORD }),
    (error) => error instanceof AuthError && error.code === 'account_suspended'
  );
});
