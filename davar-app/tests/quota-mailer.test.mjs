/**
 * Protection des quotas et envoi d'e-mail gratuit.
 * Base libSQL locale (fichier temporaire) : aucun accès réseau réel — l'appel
 * Brevo est intercepté, aucun e-mail n'est envoyé, aucun secret réel utilisé.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.APP_ENV = 'development';
process.env.AUTH_PBKDF2_ITERATIONS = '10000';

const {
  DEFAULT_BUDGETS,
  budgetFor,
  countOp,
  flushCounters,
  resetLocalCounters,
  pendingTotals,
  quotaSnapshot,
  recordOpEvent,
  trackDynamicRequest,
  verdictFor,
  windowTagFor,
} = await import('../lib/server/quota.ts');
const { emailBudget, mailerConfigured, mailerKind, sendEmail, sendVerificationEmail, MailQuotaReachedError, MailerNotConfiguredError } =
  await import('../lib/server/mailer.ts');

const root = new URL('..', import.meta.url).pathname;

async function freshDb() {
  const client = createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), 'davar-quota-')), 'q.db')}` });
  await applyAllMigrations(client);
  return client;
}

function clearPending() {
  // Les compteurs en mémoire persistent entre tests : on les remet à zéro.
  resetLocalCounters();
}

test('budgets par défaut alignés sur les offres gratuites retenues', () => {
  assert.equal(DEFAULT_BUDGETS['worker.requests'].limit, 100_000);
  assert.equal(DEFAULT_BUDGETS['turso.rows_written'].limit, 10_000_000);
  assert.equal(DEFAULT_BUDGETS['turso.rows_read'].limit, 500_000_000);
  assert.equal(DEFAULT_BUDGETS['email.sent'].limit, 300);
  assert.equal(DEFAULT_BUDGETS['kdf.operations'].limit, 3_000);
  assert.equal(DEFAULT_BUDGETS['worker.requests'].period, 'day');
  assert.equal(DEFAULT_BUDGETS['turso.rows_written'].period, 'month');
});

test('surcharge des budgets par variable d’environnement, valeurs invalides ignorées', () => {
  process.env.QUOTA_DAILY_EMAILS = '120';
  assert.equal(budgetFor('email.sent').limit, 120);
  process.env.QUOTA_DAILY_EMAILS = '0';
  assert.equal(budgetFor('email.sent').limit, 300, 'un budget nul doit être ignoré');
  process.env.QUOTA_DAILY_EMAILS = 'beaucoup';
  assert.equal(budgetFor('email.sent').limit, 300);
  delete process.env.QUOTA_DAILY_EMAILS;
});

test('verdicts de quota progressifs', () => {
  assert.equal(verdictFor(0, 100), 'ok');
  assert.equal(verdictFor(69, 100), 'ok');
  assert.equal(verdictFor(70, 100), 'warning');
  assert.equal(verdictFor(90, 100), 'critical');
  assert.equal(verdictFor(100, 100), 'exhausted');
  assert.equal(verdictFor(150, 100), 'exhausted');
});

test('fenêtres de comptage jour et mois', () => {
  const reference = Date.UTC(2026, 9, 6, 23, 30);
  assert.equal(windowTagFor('day', reference), '2026-10-06');
  assert.equal(windowTagFor('month', reference), '2026-10');
});

test('budget dur : refus au-delà de la limite, jamais de dépassement silencieux', () => {
  process.env.QUOTA_DAILY_KDF = '3';
  try {
    const results = [
      countOp('kdf.operations'),
      countOp('kdf.operations'),
      countOp('kdf.operations'),
      countOp('kdf.operations'),
    ];
    assert.deepEqual(results, [true, true, true, false]);
  } finally {
    delete process.env.QUOTA_DAILY_KDF;
  }
});

test('compteurs vidés en base par lots et relus dans l’instantané de quota', async () => {
  const db = await freshDb();
  clearPending();
  process.env.QUOTA_DAILY_EMAILS = '10';
  try {
    for (let index = 0; index < 4; index += 1) countOp('email.sent');
    await flushCounters(db);
    const email = (await quotaSnapshot(db)).find((line) => line.bucket === 'email.sent');
    assert.equal(email.used, 4);
    assert.equal(email.limit, 10);
    assert.equal(email.verdict, 'ok', '4/10 reste sous le seuil d’alerte de 70 %');
    // Second vidage : les compteurs s'additionnent dans la même fenêtre.
    for (let index = 0; index < 4; index += 1) countOp('email.sent');
    await flushCounters(db);
    const after = (await quotaSnapshot(db)).find((line) => line.bucket === 'email.sent');
    assert.equal(after.used, 8);
    assert.equal(after.verdict, 'warning', '8/10 dépasse le seuil d’alerte');
  } finally {
    delete process.env.QUOTA_DAILY_EMAILS;
  }
});

test('une écriture Turso pour N requêtes comptées : le quota d’écritures est protégé', async () => {
  const db = await freshDb();
  clearPending();
  delete process.env.QUOTA_FLUSH_EVERY;
  for (let index = 0; index < 20; index += 1) await trackDynamicRequest(db);
  const written = await db.execute("SELECT count FROM ops_counters WHERE bucket = 'worker.requests'");
  assert.equal(Number(written.rows[0].count), 20, 'les compteurs doivent être vidés après le lot');
  const remaining = pendingTotals().filter((entry) => entry.bucket === 'worker.requests');
  assert.equal(remaining.length, 0, 'aucun compteur ne doit rester en mémoire après un lot complet');
});

test('journal d’opérations : aucune donnée personnelle, seuls des types d’événement', async () => {
  const db = await freshDb();
  await recordOpEvent(db, 'kdf_hash');
  await recordOpEvent(db, 'email_sent');
  const rows = (await db.execute('SELECT kind, window_tag FROM ops_events ORDER BY id')).rows;
  assert.deepEqual(rows.map((row) => row.kind), ['kdf_hash', 'email_sent']);
  const columns = (await db.execute('PRAGMA table_info(ops_events)')).rows.map((row) => row.name);
  assert.deepEqual(columns, ['id', 'kind', 'window_tag', 'occurred_at_ms']);
});

test('envoi d’e-mail : configuration Brevo gratuite reconnue, sinon refus explicite', async () => {
  delete process.env.MAILER_KIND;
  assert.equal(mailerKind(), 'none');
  assert.equal(mailerConfigured(), false);
  await assert.rejects(() => sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' }), MailerNotConfiguredError);

  process.env.MAILER_KIND = 'brevo';
  process.env.BREVO_API_KEY = 'cle-api-factice-de-test-1234567890';
  process.env.MAIL_FROM_EMAIL = 'campus@davaracademie.ci';
  assert.equal(mailerConfigured(), true);
  assert.equal(emailBudget().kind, 'brevo');
  assert.equal(emailBudget().dailyLimit, 300);

  process.env.MAIL_FROM_EMAIL = 'adresse-invalide';
  assert.equal(mailerConfigured(), false, 'une adresse d’expédition invalide doit fermer l’envoi');
  process.env.MAIL_FROM_EMAIL = 'campus@davaracademie.ci';
});

test('appel Brevo : charge utile conforme, secret uniquement en en-tête', async () => {
  process.env.MAILER_KIND = 'brevo';
  process.env.BREVO_API_KEY = 'cle-api-factice-de-test-1234567890';
  process.env.MAIL_FROM_EMAIL = 'campus@davaracademie.ci';
  process.env.MAIL_FROM_NAME = 'Davar Campus';
  process.env.QUOTA_DAILY_EMAILS = '300';

  let captured;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return new Response('{"messageId":"test"}', { status: 201 });
  };
  try {
    await sendEmail({ to: 'etudiant@example.com', subject: 'Confirmez', text: 'Lien : https://exemple.ci/x' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(captured.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(captured.init.headers['api-key'], process.env.BREVO_API_KEY);
  assert.equal(JSON.stringify(captured.body).includes(process.env.BREVO_API_KEY), false, 'la clé ne doit pas être dans le corps');
  assert.deepEqual(captured.body.to, [{ email: 'etudiant@example.com' }]);
  assert.equal(captured.body.sender.email, 'campus@davaracademie.ci');
  assert.equal(captured.body.sender.name, 'Davar Campus');
  assert.equal(captured.body.subject, 'Confirmez');
  assert.match(captured.body.textContent, /exemple\.ci/);
  delete process.env.QUOTA_DAILY_EMAILS;
});

test('relais Google Apps Script : contrat exact attendu par le script fourni', async () => {
  // Le script `apps-script/Relais-E-mail.gs` est écrit pour ce contrat précis.
  // Ce test le fige : si le format change d'un côté, l'autre casse bruyamment.
  // On restaure l'environnement en sortie : les tests voisins partagent le processus.
  const avant = { ...process.env };
  process.env.MAILER_KIND = 'apps_script';
  process.env.MAIL_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/exemple/exec';
  process.env.MAIL_APPS_SCRIPT_TOKEN = 'jeton-de-test-de-plus-de-seize-caracteres';
  process.env.QUOTA_DAILY_EMAILS = '300';

  assert.equal(mailerKind(), 'apps_script');
  assert.equal(mailerConfigured(), true);
  assert.equal(emailBudget().kind, 'apps_script');

  let captured;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return new Response('{"ok":true}', { status: 200 });
  };
  try {
    await sendVerificationEmail({ to: 'etudiant@example.com', displayName: 'Awa', verifyUrl: 'https://campus.ci/verifier-email?token=abc' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(captured.url, process.env.MAIL_APPS_SCRIPT_URL);
  assert.deepEqual(Object.keys(captured.body).sort(), ['secret', 'subject', 'text', 'to']);
  assert.equal(captured.body.secret, process.env.MAIL_APPS_SCRIPT_TOKEN);
  assert.equal(captured.body.to, 'etudiant@example.com');
  assert.match(captured.body.subject, /confirm/i);
  assert.match(captured.body.text, /verifier-email\?token=abc/, 'le lien de confirmation doit être dans le texte');
  assert.equal(JSON.stringify(captured.body.text).includes('Awa'), true, 'le prénom est utilisé dans le message');

  // Un jeton trop court ne doit jamais être accepté.
  process.env.MAIL_APPS_SCRIPT_TOKEN = 'trop-court';
  assert.equal(mailerConfigured(), false, 'un jeton de moins de 16 caractères doit fermer l’envoi');

  for (const cle of Object.keys(process.env)) if (!(cle in avant)) delete process.env[cle];
  Object.assign(process.env, avant);
});

test('quota d’e-mails atteint : refus net et journalisation, aucune tentative d’envoi', async () => {
  const db = await freshDb();
  clearPending();
  process.env.QUOTA_DAILY_EMAILS = '1';
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{}', { status: 201 });
  };
  try {
    await sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' }, db);
    await assert.rejects(() => sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' }, db), MailQuotaReachedError);
    assert.equal(calls, 1, 'le fournisseur ne doit être appelé qu’une fois');
    const refused = await db.execute("SELECT COUNT(*) AS c FROM ops_events WHERE kind = 'email_refused'");
    assert.equal(Number(refused.rows[0].c), 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.QUOTA_DAILY_EMAILS;
    clearPending();
  }
});
