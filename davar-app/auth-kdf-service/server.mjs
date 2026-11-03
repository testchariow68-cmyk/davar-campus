#!/usr/bin/env node
/**
 * DAVAR Campus — service de dérivation de mot de passe (auto-hébergeable).
 *
 * POURQUOI CE SERVICE EXISTE
 * Le hachage d'un mot de passe coûte ~121 ms de CPU (PBKDF2-HMAC-SHA256,
 * 600 000 itérations). C'est indispensable face au cassage hors ligne, mais
 * cela dépasse le plafond de 10 ms par requête de l'offre Cloudflare Workers
 * gratuite. Ce service exécute donc l'opération coûteuse sur une offre gratuite
 * mesurée en TEMPS CPU MENSUEL (Oracle Cloud Always Free, Google Cloud Run free
 * tier, ou votre propre machine) — jamais en payant, et jamais en affaiblissant
 * le hachage.
 *
 * GARANTIES
 *  - aucun mot de passe ni empreinte n'est journalisé, à aucun niveau ;
 *  - requête signée HMAC-SHA256 sur `horodatage.corps` (anti-rejeu, ±60 s) ;
 *  - comparaison en temps constant côté node:crypto ;
 *  - plafond journalier explicite : on protège le quota, on ne le dépense pas ;
 *  - refuse de démarrer sans jeton fort, et n'accepte du HTTP clair que sur la
 *    boucle locale ou avec un aveu explicite de terminaison TLS en amont.
 *
 * Lancer : DAVAR_KDF_TOKEN="<32+ caractères>" node server.mjs
 */
import { createServer } from 'node:http';
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import process from 'node:process';

const derive = promisify(pbkdf2);

const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.DAVAR_KDF_HOST ?? '0.0.0.0';
const TOKEN = process.env.DAVAR_KDF_TOKEN ?? '';
const ITERATIONS = Number(process.env.DAVAR_KDF_ITERATIONS ?? 600_000);
const MIN_ITERATIONS = 210_000;
const DAILY_MAX = Number(process.env.DAVAR_KDF_DAILY_MAX ?? 3000);
const MAX_SKEW_MS = 60_000;
const MAX_BODY_BYTES = 16 * 1024;
const TRUST_PROXY = process.env.DAVAR_KDF_TRUST_PROXY === 'true';
const ALLOW_INSECURE = process.env.DAVAR_KDF_ALLOW_INSECURE === 'true';

/* ------------------------------------------------------------- démarrage sûr */

function fatal(message) {
  console.error(`ARRÊT : ${message}`);
  process.exit(2);
}

if (TOKEN.length < 32) fatal('DAVAR_KDF_TOKEN doit faire au moins 32 caractères.');
if (!Number.isInteger(ITERATIONS) || ITERATIONS < MIN_ITERATIONS)
  fatal(`DAVAR_KDF_ITERATIONS doit être un entier ≥ ${MIN_ITERATIONS}.`);
if (!Number.isInteger(DAILY_MAX) || DAILY_MAX < 1) fatal('DAVAR_KDF_DAILY_MAX invalide.');

const loopback = ['127.0.0.1', '::1', 'localhost'].includes(HOST);
if (!loopback && !TRUST_PROXY && !ALLOW_INSECURE)
  fatal(
    'Exposition réseau non confirmée : placez ce service derrière un terminateur TLS ' +
      '(Caddy, Cloudflare Tunnel, Cloud Run) et posez DAVAR_KDF_TRUST_PROXY=true.'
  );

/* ------------------------------------------------------------- compteurs */

const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
let day = dayKey();
let usedToday = 0;
const perMinute = new Map();

function allowRequest(now = Date.now()) {
  if (dayKey(now) !== day) {
    day = dayKey(now);
    usedToday = 0;
    perMinute.clear();
  }
  if (usedToday >= DAILY_MAX) return { allowed: false, reason: 'daily_cap' };
  const minute = Math.floor(now / 60_000);
  const count = (perMinute.get(minute) ?? 0) + 1;
  perMinute.set(minute, count);
  if (count > 120) return { allowed: false, reason: 'rate_limited' };
  for (const key of perMinute.keys()) if (key < minute - 1) perMinute.delete(key);
  return { allowed: true };
}

/* ------------------------------------------------------------- dérivation */

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await derive(password, salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2-sha256$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return { valid: false, needsRehash: false };
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 5_000_000)
    return { valid: false, needsRehash: false };
  const salt = fromBase64Url(parts[2]);
  const expected = fromBase64Url(parts[3]);
  const candidate = await derive(password, salt, iterations, expected.length || 32, 'sha256');
  const valid = candidate.length === expected.length && timingSafeEqual(candidate, expected);
  if (!valid) return { valid: false, needsRehash: false };
  if (iterations === ITERATIONS) return { valid: true, needsRehash: false };
  return { valid: true, needsRehash: true, upgradedHash: await hashPassword(password) };
}

/* ------------------------------------------------------------- signature */

async function sign(timestamp, body) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(TOKEN),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  return Buffer.from(digest).toString('hex');
}

async function signatureValid(timestamp, body, provided) {
  if (!/^\d{10,17}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > MAX_SKEW_MS) return false;
  const expected = Buffer.from(await sign(timestamp, body), 'utf8');
  const given = Buffer.from(String(provided ?? ''), 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/* ------------------------------------------------------------- serveur HTTP */

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') {
    return send(response, 200, {
      ok: true,
      service: 'davar-kdf',
      iterations: ITERATIONS,
      usedToday,
      dailyMax: DAILY_MAX,
      day,
    });
  }
  if (request.method !== 'POST' || request.url !== '/v1/kdf') return send(response, 404, { error: 'not_found' });

  const verdict = allowRequest();
  if (!verdict.allowed) return send(response, 429, { error: verdict.reason, retryAfterSeconds: 60 });

  let raw;
  try {
    raw = await readBody(request);
  } catch {
    return send(response, 413, { error: 'body_too_large' });
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return send(response, 400, { error: 'invalid_json' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return send(response, 400, { error: 'invalid_body' });
  if (!(await signatureValid(request.headers['x-davar-timestamp'], raw, request.headers['x-davar-signature'])))
    return send(response, 401, { error: 'unauthorized' });

  const { op, password, stored } = payload;
  if (op !== 'hash' && op !== 'verify') return send(response, 400, { error: 'invalid_op' });
  if (typeof password !== 'string' || password.length < 1 || password.length > 200)
    return send(response, 400, { error: 'invalid_password' });
  if (op === 'verify' && (typeof stored !== 'string' || stored.length < 20 || stored.length > 400))
    return send(response, 400, { error: 'invalid_stored' });

  try {
    usedToday += 1;
    if (op === 'hash') return send(response, 200, { ok: true, hash: await hashPassword(password) });
    const result = await verifyPassword(password, stored);
    return send(response, 200, {
      ok: true,
      valid: result.valid,
      needsRehash: result.needsRehash === true,
      upgradedHash: result.upgradedHash,
    });
  } catch {
    // Aucun détail technique ne sort : ni trace, ni identifiant, ni secret.
    return send(response, 500, { error: 'kdf_failed' });
  }
});

server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.listen(PORT, HOST, () => {
  console.log(
    `davar-kdf prêt sur ${HOST}:${PORT} — ${ITERATIONS} itérations PBKDF2-SHA256, ` +
      `plafond ${DAILY_MAX}/jour${TRUST_PROXY ? ', TLS terminé en amont' : ', boucle locale'}`
  );
});

for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
