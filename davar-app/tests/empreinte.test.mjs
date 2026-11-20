/**
 * LA CONNEXION PAR EMPREINTE — ce qui doit être vrai pour qu'elle soit sûre.
 *
 * Un faux appareil est fabriqué ici, avec une vraie clé P-256 : il enregistre
 * une empreinte, puis se reconnecte. Les tests qui comptent sont les REFUS —
 * car c'est là que se joue l'identité d'une personne.
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
  desactiver,
  enregistrer,
  etatEmpreinte,
  preparerConnexion,
  preparerEnregistrement,
  verifierConnexion,
} from '../lib/server/passkeys.ts';
import { base64urlVersOctets, extraireClePublique, octetsVersBase64url } from '../lib/server/webauthn.ts';

process.env.APP_ENV = 'development';

const RP_ID = 'davar.test';
const ORIGINE = 'https://davar.test';

/* ---------- un encodeur CBOR minimal, pour fabriquer les réponses de l'appareil ---------- */
function tete(majeur, longueur) {
  if (longueur < 24) return new Uint8Array([(majeur << 5) | longueur]);
  if (longueur < 256) return new Uint8Array([(majeur << 5) | 24, longueur]);
  return new Uint8Array([(majeur << 5) | 25, longueur >> 8, longueur & 0xff]);
}
function entier(valeur) {
  return valeur >= 0 ? tete(0, valeur) : tete(1, -1 - valeur);
}
function octets(contenu) {
  return new Uint8Array([...tete(2, contenu.length), ...contenu]);
}
function texte(valeur) {
  const brut = new TextEncoder().encode(valeur);
  return new Uint8Array([...tete(3, brut.length), ...brut]);
}
function objet(paires) {
  const corps = [];
  for (const [cle, valeur] of paires) corps.push(...entier(cle), ...valeur);
  return new Uint8Array([...tete(5, paires.length), ...corps]);
}
/** L'`attestationObject` de l'appareil porte des clés TEXTE (« fmt », « authData »…). */
function objetTexte(paires) {
  const corps = [];
  for (const [cle, valeur] of paires) corps.push(...texte(cle), ...valeur);
  return new Uint8Array([...tete(5, paires.length), ...corps]);
}
function assembler(...morceaux) {
  const total = morceaux.reduce((somme, m) => somme + m.length, 0);
  const resultat = new Uint8Array(total);
  let p = 0;
  for (const m of morceaux) {
    resultat.set(m, p);
    p += m.length;
  }
  return resultat;
}

async function fabriquerAppareil() {
  const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const brut = await crypto.subtle.exportKey('raw', paire.publicKey);
  const vue = new Uint8Array(brut);
  const clePubliqueCose = objet([
    [1, entier(2)], // kty : EC2
    [3, entier(-7)], // alg : ES256
    [-1, entier(1)], // crv : P-256
    [-2, octets(vue.slice(1, 33))], // x
    [-3, octets(vue.slice(33, 65))], // y
  ]);
  return { privee: paire.privateKey, clePubliqueCose };
}

async function authData(rpId, flags, compteur, attestation) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
  const entete = new Uint8Array([
    ...hash,
    flags,
    (compteur >>> 24) & 0xff,
    (compteur >>> 16) & 0xff,
    (compteur >>> 8) & 0xff,
    compteur & 0xff,
  ]);
  if (!attestation) return entete;
  const identifiant = new TextEncoder().encode('cle-de-test');
  return assembler(
    entete,
    new Uint8Array(16), // aaguid
    new Uint8Array([0, identifiant.length]),
    identifiant,
    attestation
  );
}

function clientData({ type, challenge, origin }) {
  return octetsVersBase64url(new TextEncoder().encode(JSON.stringify({ type, challenge, origin })));
}

async function baseFraiche() {
  const db = createClient({
    url: pathToFileURL(join(mkdtempSync(join(tmpdir(), 'davar-empreinte-')), 'test.db')).href,
  });
  await applyAllMigrations(db);
  await db.execute(
    "INSERT INTO users(id,email_normalized,display_name,password_hash,role,status,created_at_ms) VALUES ('u-test','a@b.test','Awa','x','student','active',1)"
  );
  return db;
}

/** Enregistre une empreinte et rend la clé privée de l'appareil. */
async function appareilEnregistre(db, options = {}) {
  const appareil = await fabriquerAppareil();
  const { defiId, options: creees } = await preparerEnregistrement(
    db,
    { id: 'u-test', email: 'a@b.test', displayName: 'Awa' },
    RP_ID
  );
  const reponse = {
    id: octetsVersBase64url(new TextEncoder().encode('cle-de-test')),
    response: {
      clientDataJSON: clientData({
        type: options.type ?? 'webauthn.create',
        challenge: options.challenge ?? creees.challenge,
        origin: options.origin ?? ORIGINE,
      }),
      attestationObject: octetsVersBase64url(
        objetTexte([
          ['fmt', texte('none')],
          ['attStmt', objet([])],
          ['authData', octets(await authData(options.rpId ?? RP_ID, options.flags ?? 0x45, 0, appareil.clePubliqueCose))],
        ])
      ),
    },
  };
  const resultat = await enregistrer(
    db,
    { id: 'u-test' },
    options.defiId ?? defiId,
    reponse,
    options.rpIdServeur ?? RP_ID,
    options.originServeur ?? ORIGINE
  );
  return { appareil, resultat };
}

test('l’enregistrement garde la clé publique et allume l’interrupteur', async () => {
  const db = await baseFraiche();
  const { resultat } = await appareilEnregistre(db);
  assert.equal(resultat.ok, true, 'enregistrement accepté');
  const etat = await etatEmpreinte(db, 'u-test');
  assert.equal(etat.active, true);
  assert.equal(etat.appareils, 1);
});

test('un défi ne sert qu’une seule fois', async () => {
  const db = await baseFraiche();
  const appareil = await fabriquerAppareil();
  const { defiId, options } = await preparerEnregistrement(
    db,
    { id: 'u-test', email: 'a@b.test', displayName: 'Awa' },
    RP_ID
  );
  const reponse = {
    id: octetsVersBase64url(new TextEncoder().encode('cle-de-test')),
    response: {
      clientDataJSON: clientData({ type: 'webauthn.create', challenge: options.challenge, origin: ORIGINE }),
      attestationObject: octetsVersBase64url(
        objetTexte([
          ['fmt', texte('none')],
          ['attStmt', objet([])],
          ['authData', octets(await authData(RP_ID, 0x45, 0, appareil.clePubliqueCose))],
        ])
      ),
    },
  };
  const premier = await enregistrer(db, { id: 'u-test' }, defiId, reponse, RP_ID, ORIGINE);
  const second = await enregistrer(db, { id: 'u-test' }, defiId, reponse, RP_ID, ORIGINE);
  assert.equal(premier.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.erreur, 'defi_invalide');
});

test('une réponse venue d’un autre site est refusée', async () => {
  const db = await baseFraiche();
  const { resultat } = await appareilEnregistre(db, { originServeur: 'https://davar.test', origin: 'https://autre.test' });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.erreur, 'origine_refusee');
  assert.equal((await etatEmpreinte(db, 'u-test')).active, false, 'aucune clé gardée');
});

test('une empreinte non vérifiée (simple contact) ne suffit pas', async () => {
  const db = await baseFraiche();
  // 0x41 : présence seule, sans vérification de l'identité (bit 0x04 absent).
  const { resultat } = await appareilEnregistre(db, { flags: 0x41 });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.erreur, 'verification_absente');
});

test('la connexion par empreinte ouvre la session du bon compte', async () => {
  const db = await baseFraiche();
  const { appareil, resultat } = await appareilEnregistre(db);
  assert.equal(resultat.ok, true);

  const { defiId, options } = await preparerConnexion(db, RP_ID);
  const donnees = await authData(RP_ID, 0x05, 7);
  const json = base64urlVersOctets(clientData({ type: 'webauthn.get', challenge: options.challenge, origin: ORIGINE }));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      appareil.privee,
      assembler(donnees, new Uint8Array(await crypto.subtle.digest('SHA-256', json)))
    )
  );

  const userId = await verifierConnexion(
    db,
    defiId,
    {
      id: octetsVersBase64url(new TextEncoder().encode('cle-de-test')),
      response: {
        clientDataJSON: octetsVersBase64url(json),
        authenticatorData: octetsVersBase64url(donnees),
        signature: octetsVersBase64url(signature),
      },
    },
    RP_ID,
    ORIGINE
  );
  assert.equal(userId, 'u-test');
});

test('une signature faite avec une autre clé est refusée', async () => {
  const db = await baseFraiche();
  await appareilEnregistre(db);
  const intrus = await fabriquerAppareil();

  const { defiId, options } = await preparerConnexion(db, RP_ID);
  const donnees = await authData(RP_ID, 0x05, 1);
  const json = base64urlVersOctets(clientData({ type: 'webauthn.get', challenge: options.challenge, origin: ORIGINE }));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      intrus.privee,
      assembler(donnees, new Uint8Array(await crypto.subtle.digest('SHA-256', json)))
    )
  );
  const userId = await verifierConnexion(
    db,
    defiId,
    {
      id: octetsVersBase64url(new TextEncoder().encode('cle-de-test')),
      response: {
        clientDataJSON: octetsVersBase64url(json),
        authenticatorData: octetsVersBase64url(donnees),
        signature: octetsVersBase64url(signature),
      },
    },
    RP_ID,
    ORIGINE
  );
  assert.equal(userId, null, 'la clé de quelqu’un d’autre n’ouvre rien');
});

test('un défi de connexion rejoué ne vaut plus rien', async () => {
  const db = await baseFraiche();
  const { appareil } = await appareilEnregistre(db);
  const { defiId, options } = await preparerConnexion(db, RP_ID);
  const fabrication = async () => {
    const donnees = await authData(RP_ID, 0x05, 2);
    const json = base64urlVersOctets(clientData({ type: 'webauthn.get', challenge: options.challenge, origin: ORIGINE }));
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        appareil.privee,
        assembler(donnees, new Uint8Array(await crypto.subtle.digest('SHA-256', json)))
      )
    );
    return {
      id: octetsVersBase64url(new TextEncoder().encode('cle-de-test')),
      response: {
        clientDataJSON: octetsVersBase64url(json),
        authenticatorData: octetsVersBase64url(donnees),
        signature: octetsVersBase64url(signature),
      },
    };
  };
  const reponse = await fabrication();
  assert.equal(await verifierConnexion(db, defiId, reponse, RP_ID, ORIGINE), 'u-test');
  assert.equal(await verifierConnexion(db, defiId, reponse, RP_ID, ORIGINE), null, 'le défi a été consommé');
});

test('désactiver retire les clés : l’empreinte ne reconnecte plus', async () => {
  const db = await baseFraiche();
  await appareilEnregistre(db);
  assert.equal((await etatEmpreinte(db, 'u-test')).active, true);
  await desactiver(db, 'u-test');
  const etat = await etatEmpreinte(db, 'u-test');
  assert.equal(etat.active, false);
  assert.equal(etat.appareils, 0);
});

test('une clé publique illisible n’entre pas en base', () => {
  assert.equal(extraireClePublique(new Uint8Array([0x01, 0x02])), null, 'bloc tronqué');
  const courbeInconnue = objet([
    [1, entier(2)],
    [3, entier(-7)],
    [-1, entier(3)], // une autre courbe que P-256
    [-2, octets(new Uint8Array(32))],
    [-3, octets(new Uint8Array(32))],
  ]);
  assert.equal(extraireClePublique(courbeInconnue), null, 'courbe refusée');
});
