/**
 * Garde-fous HTTP : contrôle d'origine (CSRF) et construction des liens d'e-mail.
 * Ces fonctions ne dépendent ni de Next ni de la base : testables directement.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, isSameOrigin, linkOrigin, publicOrigin, readJsonBody } from '../lib/server/http.ts';

function request(headers, url = 'https://campus.exemple.ci/api/auth/login') {
  return new Request(url, { method: 'POST', headers });
}

function setEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('origine identique acceptée, origine étrangère refusée', () => {
  setEnv({ APP_ENV: 'production', NODE_ENV: 'production' });
  assert.equal(isSameOrigin(request({ origin: 'https://campus.exemple.ci', host: 'campus.exemple.ci' })), true);
  assert.equal(isSameOrigin(request({ origin: 'https://pirate.example.com', host: 'campus.exemple.ci' })), false);
  assert.equal(isSameOrigin(request({ host: 'campus.exemple.ci' })), false, 'absence d’Origin non refusée');
  assert.equal(isSameOrigin(request({ origin: 'pas-une-url', host: 'campus.exemple.ci' })), false);
  // L'hôte réécrit par un proxy inverse reste accepté s'il est déclaré.
  assert.equal(
    isSameOrigin(request({ origin: 'https://campus.exemple.ci', host: 'interne:3000', 'x-forwarded-host': 'campus.exemple.ci' })),
    true
  );
});

test('aperçu .e2b.app toléré en développement seulement', () => {
  setEnv({ APP_ENV: 'development', NODE_ENV: 'development' });
  assert.equal(
    isSameOrigin(request({ origin: 'https://3000-sandbox.e2b.app', host: '127.0.0.1:3000' })),
    true
  );
  setEnv({ APP_ENV: 'production', NODE_ENV: 'production' });
  assert.equal(
    isSameOrigin(request({ origin: 'https://3000-sandbox.e2b.app', host: 'campus.exemple.ci' })),
    false,
    'tolérance aperçu active en production'
  );
  setEnv({ APP_ENV: 'staging' });
  assert.equal(isSameOrigin(request({ origin: 'https://x.e2b.app', host: 'x.turso.io' })), false);
});

test('lien d’e-mail : origine configurée exigée hors développement', () => {
  setEnv({ APP_ENV: 'production', APP_PUBLIC_ORIGIN: undefined });
  assert.equal(publicOrigin(), null);
  assert.equal(linkOrigin(request({ origin: 'https://pirate.example.com' })), null, 'lien fabriqué sans origine configurée');

  setEnv({ APP_PUBLIC_ORIGIN: 'https://campus.davaracademie.ci' });
  assert.equal(linkOrigin(request({ origin: 'https://pirate.example.com' })), 'https://campus.davaracademie.ci');

  setEnv({ APP_PUBLIC_ORIGIN: 'http://campus.davaracademie.ci' });
  assert.equal(publicOrigin(), null, 'http accepté en production');

  setEnv({ APP_ENV: 'development', APP_PUBLIC_ORIGIN: undefined });
  assert.equal(linkOrigin(request({ origin: 'https://3000-sandbox.e2b.app' })), 'https://3000-sandbox.e2b.app');
  assert.equal(linkOrigin(request({})), 'https://campus.exemple.ci');
  setEnv({ APP_ENV: 'production', NODE_ENV: 'production' });
});

test('adresse d’origine : en-têtes Cloudflare puis proxy, sinon inconnue', () => {
  assert.equal(clientIp(request({ 'cf-connecting-ip': '196.0.0.9', 'x-forwarded-for': '10.0.0.1' })), '196.0.0.9');
  assert.equal(clientIp(request({ 'x-forwarded-for': '10.0.0.1, 10.0.0.2' })), '10.0.0.1');
  assert.equal(clientIp(request({})), 'unknown');
});

test('corps JSON borné et refusé au-delà d’1 Mio', async () => {
  const ok = await readJsonBody(new Request('https://exemple.ci/api', { method: 'POST', body: '{"a":1}' }));
  assert.deepEqual(ok, { a: 1 });
  assert.equal(await readJsonBody(new Request('https://exemple.ci/api', { method: 'POST', body: '[1,2]' })), null);
  assert.equal(await readJsonBody(new Request('https://exemple.ci/api', { method: 'POST', body: 'pas du json' })), null);
  const big = JSON.stringify({ a: 'x'.repeat(1_048_600) });
  assert.equal(await readJsonBody(new Request('https://exemple.ci/api', { method: 'POST', body: big })), null);
});
