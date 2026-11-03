/**
 * Délégation du hachage au service dédié (auth-kdf-service/server.mjs) :
 * le service RÉEL est lancé sur la boucle locale, aucun secret réel n'est
 * utilisé, la base n'est pas touchée. On vérifie le chemin complet
 * (signature HMAC, horodatage, plafonds) tel qu'il tournera en production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'jeton-de-test-local-32-caracteres-minimum';
const PORT = 8799;
const PORT_CAPPED = 8800;

process.env.APP_ENV = 'development';
process.env.AUTH_KDF_MODE = 'remote';
process.env.AUTH_KDF_URL = `http://127.0.0.1:${PORT}/v1/kdf`;
process.env.AUTH_KDF_TOKEN = TOKEN;
process.env.AUTH_PBKDF2_ITERATIONS = '10000'; // inutilisé en mode délégué

const { checkPassword, derivePasswordHash, kdfMode, kdfRemoteConfig, kdfStatus } = await import(
  '../lib/server/password-service.ts'
);

function startService(port, extraEnv) {
  return spawn(process.execPath, ['auth-kdf-service/server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      DAVAR_KDF_HOST: '127.0.0.1',
      PORT: String(port),
      DAVAR_KDF_TOKEN: TOKEN,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const service = startService(PORT, { DAVAR_KDF_ITERATIONS: '450000', DAVAR_KDF_DAILY_MAX: '500' });
const cappedService = startService(PORT_CAPPED, { DAVAR_KDF_ITERATIONS: '210000', DAVAR_KDF_DAILY_MAX: '2' });
await Promise.all([once(service.stdout, 'data'), once(cappedService.stdout, 'data')]);
test.after(() => {
  service.kill('SIGTERM');
  cappedService.kill('SIGTERM');
});

async function signedCall(port, payload) {
  const body = JSON.stringify({ v: 1, ...payload });
  const timestamp = String(Date.now());
  const response = await fetch(`http://127.0.0.1:${port}/v1/kdf`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-davar-timestamp': timestamp,
      'x-davar-signature': createHmac('sha256', TOKEN).update(`${timestamp}.${body}`).digest('hex'),
    },
    body,
  });
  return { status: response.status, payload: await response.json().catch(() => null) };
}

/** Empreinte volontairement plus faible que la politique du service. */
function weakHash(password) {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, 210_000, 32, 'sha256');
  const b64 = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `pbkdf2-sha256$210000$${b64(salt)}$${b64(derived)}`;
}

test('configuration déléguée : mode, URL et jeton validés', () => {
  assert.equal(kdfMode(), 'remote');
  assert.deepEqual(kdfRemoteConfig(), { url: `http://127.0.0.1:${PORT}/v1/kdf`, token: TOKEN });
  assert.equal(kdfStatus().remoteConfigured, true);
  assert.ok(kdfStatus().dailyKdfBudget > 0);
});

test('hachage délégué : le mot de passe en clair ne revient jamais', async () => {
  const hash = await derivePasswordHash('Formation-Davar-2026!');
  assert.match(hash, /^pbkdf2-sha256\$450000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(hash.includes('Formation-Davar-2026!'), false);
  assert.equal((await checkPassword('Formation-Davar-2026!', hash)).ok, true);
  assert.equal((await checkPassword('mauvais-mot-de-passe', hash)).ok, false);
});

test('politique du service : rehachage proposé si le coût stocké est dépassé', async () => {
  const legacy = weakHash('Formation-Davar-2026!');
  assert.equal((await checkPassword('Formation-Davar-2026!', legacy)).ok, true);
  const upgraded = await signedCall(PORT, { op: 'verify', password: 'Formation-Davar-2026!', stored: legacy });
  assert.equal(upgraded.status, 200);
  assert.equal(upgraded.payload.valid, true);
  assert.equal(upgraded.payload.needsRehash, true, 'un coût stocké dépassé doit être signalé pour mise à niveau');
  assert.match(upgraded.payload.upgradedHash, /^pbkdf2-sha256\$450000\$/);
});

test('signature invalide et horodatage périmé refusés', async () => {
  const body = JSON.stringify({ v: 1, op: 'hash', password: 'Formation-Davar-2026!' });
  const stale = String(Date.now() - 10 * 60 * 1000);
  const staleSignature = createHmac('sha256', TOKEN).update(`${stale}.${body}`).digest('hex');
  const staleResponse = await fetch(`http://127.0.0.1:${PORT}/v1/kdf`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-davar-timestamp': stale,
      'x-davar-signature': staleSignature,
    },
    body,
  });
  assert.equal(staleResponse.status, 401);

  const forgedResponse = await fetch(`http://127.0.0.1:${PORT}/v1/kdf`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-davar-timestamp': String(Date.now()),
      'x-davar-signature': 'a'.repeat(64),
    },
    body,
  });
  assert.equal(forgedResponse.status, 401);

  const noSignature = await fetch(`http://127.0.0.1:${PORT}/v1/kdf`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  assert.equal(noSignature.status, 401);
});

test('plafond journalier du service : refus plutôt que consommation illimitée', async () => {
  const first = await signedCall(PORT_CAPPED, { op: 'hash', password: 'Formation-Davar-2026-a!' });
  const second = await signedCall(PORT_CAPPED, { op: 'hash', password: 'Formation-Davar-2026-b!' });
  const third = await signedCall(PORT_CAPPED, { op: 'hash', password: 'Formation-Davar-2026-c!' });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.equal(third.payload.error, 'daily_cap');
});

test('corps trop volumineux et opération inconnue refusés', async () => {
  const oversized = await signedCall(PORT, { op: 'hash', password: 'x'.repeat(20_000) });
  assert.equal(oversized.status, 413);
  const unknown = await signedCall(PORT, { op: 'rot13', password: 'Formation-Davar-2026!' });
  assert.equal(unknown.status, 400);
  const short = await signedCall(PORT, { op: 'hash', password: '' });
  assert.equal(short.status, 400);
});

test('santé du service exposée sans aucun secret', async () => {
  const response = await fetch(`http://127.0.0.1:${PORT}/healthz`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.service, 'davar-kdf');
  assert.equal(payload.iterations, 450000);
  assert.equal(JSON.stringify(payload).includes(TOKEN), false, 'le jeton ne doit jamais apparaître');
});
