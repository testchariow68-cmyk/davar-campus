/**
 * LIVRES, AUDIOS ET STOCKAGE — les règles du propriétaire, verrouillées.
 * Exécution : npm test — base libSQL temporaire, aucun accès réseau.
 *
 * Ce qui est protégé ici :
 *   - la signature des adresses de dépôt et de lecture (AWS4-HMAC-SHA256) ;
 *   - l'impossibilité de sortir de son dossier avec une clé fabriquée ;
 *   - les plafonds écrits dans les documents : 10 Mo document / 20 Mo audio / 128 Mo vidéo ;
 *   - l'accès à une ressource : à tous, ou attribuée nommément — jamais autrement ;
 *   - la reprise de lecture : la position ne recule pas toute seule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  PLAFONDS_OCTETS,
  clePropre,
  configStockage,
  encoderAws,
  libellePlafond,
  stockagePret,
  tailleAcceptable,
  urlDepot,
  urlLecture,
  urlSignee,
} from '../lib/server/stockage.ts';
import {
  accesRessource,
  ajouterPage,
  ajouterPiste,
  enregistrerPosition,
  pagesDuLivre,
  pistesDeLAudio,
  positionLecture,
  positionsDeLEtudiant,
} from '../lib/server/medias.ts';

process.env.APP_ENV = 'development';

const ENV_STOCKAGE = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_ACCESS_KEY_ID: 'cle-acces-de-test',
  R2_SECRET_ACCESS_KEY: 'secret-de-test',
  R2_BUCKET: 'davar-ressources',
};

async function avecStockage(fonction) {
  const sauvegarde = { ...process.env };
  Object.assign(process.env, ENV_STOCKAGE);
  try {
    // On ATTEND la fin : sinon l'environnement serait retiré avant la signature.
    return await fonction();
  } finally {
    for (const cle of Object.keys(ENV_STOCKAGE)) delete process.env[cle];
    Object.assign(process.env, sauvegarde);
  }
}

test('sans clés, le stockage se déclare NON relié (aucune adresse inventée)', async () => {
  for (const cle of Object.keys(ENV_STOCKAGE)) delete process.env[cle];
  assert.equal(stockagePret(), false);
  assert.equal(configStockage(), null);
  assert.equal(await urlLecture('ressources/x.pdf'), null, 'pas de clés → pas d’adresse, jamais une adresse cassée');
  assert.equal(await urlDepot('ressources/x.pdf'), null);

  // Un identifiant de compte mal formé est refusé, plutôt que de produire du vide.
  process.env.R2_ACCOUNT_ID = 'pas-un-identifiant';
  process.env.R2_ACCESS_KEY_ID = 'a';
  process.env.R2_SECRET_ACCESS_KEY = 'b';
  process.env.R2_BUCKET = 'c';
  assert.equal(configStockage(), null);
  for (const cle of Object.keys(ENV_STOCKAGE)) delete process.env[cle];
});

test('la clé d’un fichier ne peut pas sortir de son dossier', () => {
  assert.equal(clePropre('ressources/livres/orateur.pdf'), 'ressources/livres/orateur.pdf');
  assert.equal(clePropre('/etc/passwd'), null, 'chemin absolu refusé');
  assert.equal(clePropre('ressources/../../secret.txt'), null, 'remontée de dossier refusée');
  assert.equal(clePropre('ressources\\windows.txt'), null, 'barre inversée refusée');
  assert.equal(clePropre('ressources/éé.txt'), null, 'caractère inattendu refusé');
  assert.equal(clePropre(''), null);
  assert.equal(clePropre('a/b/c/d/e/f/g/h/i/j'), null, 'trop profond');
  assert.equal(clePropre('ressources//livres/x.pdf'), 'ressources/livres/x.pdf', 'les segments vides sont nettoyés');
});

test('l’adresse signée est bien formée, datée, et change avec la clé et le temps', async () => {
  await avecStockage(async () => {
    const quand = Date.UTC(2026, 9, 7, 12, 0, 0);
    const adresse = await urlLecture('ressources/livre.pdf', 300, quand);
    assert.ok(adresse, 'une adresse doit être produite');
    const url = new URL(adresse);
    assert.equal(url.hostname, '0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com');
    assert.equal(url.pathname, '/davar-ressources/ressources/livre.pdf');
    assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
    assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
    assert.equal(url.searchParams.get('X-Amz-Date'), '20261007T120000Z');
    assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
    assert.match(url.searchParams.get('X-Amz-Credential') ?? '', /^cle-acces-de-test\/20261007\/auto\/s3\/aws4_request$/);
    assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[A-Za-z0-9_-]{20,}$/);

    // Déterministe à horodatage égal, différent dès que la clé change.
    const meme = await urlLecture('ressources/livre.pdf', 300, quand);
    assert.equal(meme, adresse);
    const autre = await urlLecture('ressources/autre.pdf', 300, quand);
    assert.notEqual(autre, adresse);

    // Le dépôt est une autorisation d'écriture : même mécanique, autre méthode.
    const depot = await urlDepot('ressources/livre.pdf', 900, quand);
    assert.ok(depot);
    assert.notEqual(depot, adresse);

    // La durée est bornée : jamais une adresse éternelle.
    const longue = await urlSignee({ methode: 'GET', cle: 'a.pdf', expireSecondes: 999999, maintenant: quand });
    assert.equal(new URL(longue).searchParams.get('X-Amz-Expires'), '3600');
    const courte = await urlSignee({ methode: 'GET', cle: 'a.pdf', expireSecondes: 1, maintenant: quand });
    assert.equal(new URL(courte).searchParams.get('X-Amz-Expires'), '30');
  });
});

test('les plafonds des documents sont respectés : 10 Mo document, 20 Mo audio, 128 Mo vidéo', () => {
  assert.equal(PLAFONDS_OCTETS.document, 10 * 1024 * 1024);
  assert.equal(PLAFONDS_OCTETS.audio, 20 * 1024 * 1024);
  assert.equal(PLAFONDS_OCTETS.video, 128 * 1024 * 1024);
  assert.equal(libellePlafond('document'), '10 Mo');
  assert.equal(libellePlafond('audio'), '20 Mo');
  assert.equal(libellePlafond('video'), '128 Mo');

  assert.equal(tailleAcceptable('document', 9 * 1024 * 1024), true);
  assert.equal(tailleAcceptable('document', 11 * 1024 * 1024), false);
  assert.equal(tailleAcceptable('audio', 19 * 1024 * 1024), true);
  assert.equal(tailleAcceptable('audio', 21 * 1024 * 1024), false);
  assert.equal(tailleAcceptable('video', 120 * 1024 * 1024), true);
  assert.equal(tailleAcceptable('video', 200 * 1024 * 1024), false);
  assert.equal(tailleAcceptable('document', 0), false, 'un fichier vide n’est pas un fichier');
  assert.equal(tailleAcceptable('document', Number.NaN), false);
});

test('l’encodage des chemins suit la règle AWS', () => {
  assert.equal(encoderAws('a b'), 'a%20b');
  assert.equal(encoderAws('a/b'), 'a%2Fb');
  assert.equal(encoderAws("l'ete"), 'l%27ete');
});

async function basePrete() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-medias-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  const maintenant = Date.now();
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES ('u-awa','awa@davar.test','Awa Koné','x',?,'student','active',?,0)`,
    args: [maintenant, maintenant],
  });
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES ('u-ibrahim','ibrahim@davar.test','Ibrahim Diallo','x',?,'student','active',?,0)`,
    args: [maintenant, maintenant],
  });
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('t-orateur','Devenir un excellent orateur',39900,'prd',1)`,
  });
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_1','awa@davar.test','t-orateur','39900','XOF',?)`,
    args: [maintenant],
  });
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms) VALUES ('u-awa','t-orateur','verified_purchase','sale_1',?)`,
    args: [maintenant],
  });
  await db.execute({
    sql: `INSERT INTO resources(id,training_id,kind,title,description,position,published,created_at_ms)
          VALUES ('res-livre',NULL,'book','L’art de parler',NULL,1,1,?)`,
    args: [maintenant],
  });
  await db.execute({
    sql: `INSERT INTO resources(id,training_id,kind,title,description,position,published,created_at_ms)
          VALUES ('res-audio',NULL,'audio','Le livre audio',NULL,2,1,?)`,
    args: [maintenant],
  });
  return db;
}

test('un livre se remplit page par page, dans l’ordre', async () => {
  const db = await basePrete();
  const une = await ajouterPage(db, { resourceId: 'res-livre', title: 'Première', body: 'La maîtrise vient de la répétition.' });
  const deux = await ajouterPage(db, { resourceId: 'res-livre', body: 'Un objectif clair vaut mieux que dix intentions vagues.' });
  assert.deepEqual([une.position, deux.position], [1, 2]);

  const trop = await ajouterPage(db, { resourceId: 'res-livre', body: 'court' });
  assert.equal(trop.erreur, 'page_trop_courte');

  const pages = await pagesDuLivre(db, 'res-livre');
  assert.equal(pages.length, 2);
  assert.equal(pages[0].title, 'Première');
  assert.ok(pages[1].body.startsWith('Un objectif clair'));
});

test('les pistes d’un audio se suivent, et se déposent une à une', async () => {
  const db = await basePrete();
  await ajouterPiste(db, { resourceId: 'res-audio', title: 'Ouverture' });
  const deuxieme = await ajouterPiste(db, { resourceId: 'res-audio', title: 'Chapitre 1' });
  assert.equal(deuxieme.position, 2);

  const pistes = await pistesDeLAudio(db, 'res-audio');
  assert.deepEqual(
    pistes.map((piste) => piste.title),
    ['Ouverture', 'Chapitre 1']
  );
  assert.equal(pistes[0].fileKey, null, 'une piste créée sans fichier se dit non déposée');
});

test('l’accès est refusé à qui n’a pas le droit — et accordé à qui l’a', async () => {
  const db = await basePrete();

  // Ouverte à tous : tout étudiant passe.
  const tous = await accesRessource(db, { userId: 'u-ibrahim', estProprietaire: false, resourceId: 'res-livre' });
  assert.equal(tous.ok, true);

  // Attribuée nommément : seule la personne concernée passe.
  await db.execute({
    sql: `INSERT INTO resource_allocations(resource_id,user_id,allocated_by,at_ms) VALUES ('res-livre','u-awa','usr_p',?)`,
    args: [Date.now()],
  });
  const awa = await accesRessource(db, { userId: 'u-awa', estProprietaire: false, resourceId: 'res-livre' });
  const ibrahim = await accesRessource(db, { userId: 'u-ibrahim', estProprietaire: false, resourceId: 'res-livre' });
  assert.equal(awa.ok, true);
  assert.equal(ibrahim.ok, false);
  assert.equal(ibrahim.raison, 'acces_refuse');

  // Le propriétaire garde l'accès, quoi qu'il arrive.
  const proprietaire = await accesRessource(db, { userId: 'u-awa', estProprietaire: true, resourceId: 'res-livre' });
  assert.equal(proprietaire.ok, true);

  // Ressource retirée : plus personne, sauf le propriétaire.
  await db.execute("UPDATE resources SET published = 0 WHERE id = 'res-audio'");
  const retiree = await accesRessource(db, { userId: 'u-awa', estProprietaire: false, resourceId: 'res-audio' });
  assert.equal(retiree.ok, false);

  // Ressource inconnue : rien.
  const inconnue = await accesRessource(db, { userId: 'u-awa', estProprietaire: false, resourceId: 'res-inexistante' });
  assert.equal(inconnue.ok, false);
});

test('la reprise de lecture ne recule jamais toute seule', async () => {
  const db = await basePrete();
  await enregistrerPosition(db, { userId: 'u-awa', resourceId: 'res-livre', kind: 'book', position: 12 });
  assert.equal((await positionLecture(db, 'u-awa', 'res-livre'))?.position, 12);

  // Une remontée automatique (par exemple une synchronisation en retard) ne recule pas.
  await enregistrerPosition(db, { userId: 'u-awa', resourceId: 'res-livre', kind: 'book', position: 4 });
  assert.equal((await positionLecture(db, 'u-awa', 'res-livre'))?.position, 12);

  // Mais l'étudiant qui revient volontairement en arrière est respecté.
  await enregistrerPosition(db, { userId: 'u-awa', resourceId: 'res-livre', kind: 'book', position: 3, forcer: true });
  assert.equal((await positionLecture(db, 'u-awa', 'res-livre'))?.position, 3);

  // À l'écoute d'un audio, la seconde est mémorisée de la même façon.
  await enregistrerPosition(db, { userId: 'u-awa', resourceId: 'res-audio', kind: 'audio', position: 754 });
  const positions = await positionsDeLEtudiant(db, 'u-awa');
  assert.equal(positions['res-audio'], 754);
  assert.equal(positions['res-livre'], 3, 'chaque ressource garde sa propre position');

  // Un autre étudiant a la sienne : rien n'est partagé.
  assert.equal(await positionLecture(db, 'u-ibrahim', 'res-livre'), null);
});
