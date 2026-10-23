/**
 * NOTIFICATIONS POUSSÉES — la preuve que le message part, et qu'il est illisible
 * pour le service qui l'achemine.
 *
 * Le vecteur ci-dessous n'est pas inventé : il a été fabriqué par
 * `http_ece`, la bibliothèque de référence utilisée par `web-push`, avec des
 * clés et un sel fixés. Si notre chiffrement produit le même octet pour octet,
 * un vrai navigateur saura le déchiffrer. C'est la seule façon honnête
 * d'éprouver du chiffrement : comparer, pas supposer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  abonner,
  abonnementsDe,
  base64urlVersOctets,
  chiffrer,
  cleVapid,
  desabonner,
  jetonVapid,
  octetsVersBase64url,
  pousserNotifications,
  SUJET_VAPID,
} from '../lib/server/push.ts';

const VECTEUR = {
  uaPublique: 'BAIX5hfwtkQ5KCePlpmeaaI6TywVK99tbN9m5bgCgtTtGUp968uXcS0t2jyoWqh2Wlb0X8dYWZZS8ol8ZTBuV5Q',
  auth: 'MzMzMzMzMzMzMzMzMzMzMw',
  sel: 'RERERERERERERERERERERA',
  ephemere: {
    x: '1lqTl3yqPRsIGFL_V6eeRl8WYFdzBLrq1QXdOkhYnPM',
    y: 'UBheiVNy32Ih6joTdVfkc_3bZ1XwW9UHw8Uz_OnJEoU',
    d: 'IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI',
  },
  charge: JSON.stringify({
    titre: 'Votre motivation de la semaine 💪',
    corps: 'Un orateur ne naît pas, il se construit.',
    route: '',
  }),
  corps:
    'RERERERERERERERERERERAAAEABBBNZak5d8qj0bCBhS_1ennkZfFmBXcwS66tUF3TpIWJzzUBheiVNy32Ih6joTdVfkc_3bZ1XwW9UHw8Uz_OnJEoU6yQQesb9LBCKKP3z_V5OXIeapCpE9_3Yvtc3wcp-cjUQFCoQUHMFrDqYYeoXmRlE7cvNxQCNlO-oPqY4W7MMPT0mgphDHqodYPr46nqPek-lLcP3ZZWZL7H-K63y6hmDZI8htGYJRly_0ymfNJYQexCTdVIwTEHBEq137Z4Kr',
};

async function base() {
  const db = createClient({
    url: pathToFileURL(join(mkdtempSync(join(tmpdir(), 'davar-push-')), 'test.db')).href,
  });
  await applyAllMigrations(db);
  await db.execute(
    "INSERT INTO users(id,email_normalized,display_name,password_hash,role,status,created_at_ms) VALUES ('u-test','a@b.test','Awa','x','student','active',1)"
  );
  return db;
}

test('le chiffrement aes128gcm reproduit l’implémentation de référence, octet pour octet', async () => {
  const ephemere = {
    privateKey: await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', ...VECTEUR.ephemere },
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    ),
    publicKey: await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: VECTEUR.ephemere.x, y: VECTEUR.ephemere.y },
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    ),
  };
  const { corps } = await chiffrer(
    { p256dh: VECTEUR.uaPublique, auth: VECTEUR.auth },
    VECTEUR.charge,
    { sel: base64urlVersOctets(VECTEUR.sel), ephemere }
  );
  assert.equal(octetsVersBase64url(corps), VECTEUR.corps);
});

test('un envoi réel produit un en-tête lisible : sel, taille d’enregistrement, clé éphémère', async () => {
  const { corps } = await chiffrer({ p256dh: VECTEUR.uaPublique, auth: VECTEUR.auth }, 'coucou');
  const vue = new DataView(corps.buffer, corps.byteOffset, corps.byteLength);
  assert.equal(corps.length, 16 + 4 + 1 + 65 + 6 + 1 + 16); // sel + taille + longueur de clé + clé + « coucou » + délimiteur + étiquette
  assert.equal(vue.getUint32(16, false), 4096);
  assert.equal(corps[20], 65);
  assert.equal(corps[21], 4); // la clé éphémère commence par 0x04 (non compressée)
});

test('le jeton VAPID est un JWT ES256 signé par la clé du campus', async () => {
  const db = await base();
  const cle = await cleVapid(db);
  const maintenant = Date.now();
  const jeton = await jetonVapid('https://fcm.googleapis.com/fcm/send/abc123', cle, maintenant);
  const [entete, charge, signature] = jeton.split('.');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(base64urlVersOctets(entete))), {
    typ: 'JWT',
    alg: 'ES256',
  });
  const donnees = JSON.parse(new TextDecoder().decode(base64urlVersOctets(charge)));
  assert.equal(donnees.aud, 'https://fcm.googleapis.com');
  assert.equal(donnees.sub, SUJET_VAPID);
  assert.ok(donnees.exp > Math.floor(maintenant / 1000));

  // La signature doit se vérifier avec la clé publique seule : c'est la preuve
  // que le service de push peut nous identifier sans connaître notre secret.
  const brut = base64urlVersOctets(cle.publique);
  const publique = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: octetsVersBase64url(brut.slice(1, 33)),
      y: octetsVersBase64url(brut.slice(33, 65)),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  const valide = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publique,
    base64urlVersOctets(signature),
    new TextEncoder().encode(`${entete}.${charge}`)
  );
  assert.equal(valide, true);
});

test('la paire de clés est fabriquée une seule fois, puis relue telle quelle', async () => {
  const db = await base();
  const premiere = await cleVapid(db);
  const seconde = await cleVapid(db);
  assert.equal(premiere.publique, seconde.publique);
  assert.equal(octetsVersBase64url(premiere.priveePkcs8), octetsVersBase64url(seconde.priveePkcs8));
  assert.equal(base64urlVersOctets(premiere.publique).length, 65);
});

test('un appareil s’abonne, se relit, et se désabonne', async () => {
  const db = await base();
  await abonner(db, { userId: 'u-test', endpoint: 'https://fcm.googleapis.com/fcm/send/1', p256dh: 'AAA', auth: 'BBB' });
  await abonner(db, { userId: 'u-test', endpoint: 'https://fcm.googleapis.com/fcm/send/1', p256dh: 'AAA2', auth: 'BBB2' });
  let liste = await abonnementsDe(db, 'u-test');
  assert.equal(liste.length, 1, 'le même appareil réabonné ne fait pas doublon');
  assert.equal(liste[0].p256dh, 'AAA2', "et c'est la dernière clé qui compte");
  await abonner(db, { userId: 'u-test', endpoint: 'https://fcm.googleapis.com/fcm/send/2', p256dh: 'CCC', auth: 'DDD' });
  liste = await abonnementsDe(db, 'u-test');
  assert.equal(liste.length, 2);
  await desabonner(db, 'u-test', 'https://fcm.googleapis.com/fcm/send/1');
  liste = await abonnementsDe(db, 'u-test');
  assert.equal(liste.length, 1);
  assert.equal(liste[0].endpoint, 'https://fcm.googleapis.com/fcm/send/2');
});

test('chaque notification part une seule fois, et un appareil mort est retiré', async () => {
  const db = await base();
  const maintenant = Date.now();
  await abonner(db, { userId: 'u-test', endpoint: 'https://push.test/vivant', p256dh: VECTEUR.uaPublique, auth: VECTEUR.auth }, maintenant);
  await abonner(db, { userId: 'u-test', endpoint: 'https://push.test/mort', p256dh: VECTEUR.uaPublique, auth: VECTEUR.auth }, maintenant);
  await db.execute({
    sql: "INSERT INTO notifications(id, user_id, kind, title, body, route, created_at_ms, read_at_ms, expires_at_ms) VALUES ('n1','u-test','coach','Titre','Corps','/campus/questions',?,NULL,?)",
    args: [maintenant, maintenant + 86_400_000],
  });

  const appels = [];
  globalThis.fetch = async (url, options) => {
    appels.push({ url, options });
    if (url === 'https://push.test/mort') return { ok: false, status: 410 };
    return { ok: true, status: 201 };
  };
  try {
    const premier = await pousserNotifications(db, 40, maintenant);
    assert.equal(premier.envoyees, 1);
    assert.equal(premier.echecs, 0);
    assert.equal(premier.abonnementsRetires, 1, 'un appareil qui n’existe plus ne coûte plus rien');
    assert.equal(appels.length, 2);
    for (const appel of appels) {
      assert.equal(appel.options.method, 'POST');
      assert.equal(appel.options.headers['content-encoding'], 'aes128gcm');
      assert.match(appel.options.headers.authorization, /^vapid t=.+, k=.+/);
    }
    // Le lot est limité : un Worker gratuit ne peut pas ouvrir cinquante connexions.
    assert.ok(appels.length <= 40);

    const second = await pousserNotifications(db, 40, maintenant);
    assert.equal(second.envoyees, 0, 'la même notification ne repart jamais');
    const restants = await abonnementsDe(db, 'u-test');
    assert.equal(restants.length, 1);
    assert.equal(restants[0].endpoint, 'https://push.test/vivant');
  } finally {
    delete globalThis.fetch;
  }
});

test('une notification trop ancienne n’est plus poussée : elle reste dans la cloche', async () => {
  const db = await base();
  const maintenant = Date.now();
  await abonner(db, { userId: 'u-test', endpoint: 'https://push.test/vivant', p256dh: VECTEUR.uaPublique, auth: VECTEUR.auth }, maintenant);
  await db.execute({
    sql: "INSERT INTO notifications(id, user_id, kind, title, body, route, created_at_ms, read_at_ms, expires_at_ms) VALUES ('vieux','u-test','coach','T','C',NULL,?,NULL,?)",
    args: [maintenant - 48 * 3600 * 1000, maintenant + 86_400_000],
  });
  let appels = 0;
  globalThis.fetch = async () => {
    appels += 1;
    return { ok: true, status: 201 };
  };
  try {
    const resultat = await pousserNotifications(db, 40, maintenant);
    assert.equal(resultat.envoyees, 0);
    assert.equal(appels, 0, 'rien n’est dépensé pour un message qui a deux jours');
  } finally {
    delete globalThis.fetch;
  }
});
