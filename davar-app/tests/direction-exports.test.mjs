/**
 * EXPORTS, FACTURES, CLÉS ET SHEETS — les décisions du propriétaire, verrouillées.
 * Exécution : npm test — base libSQL temporaire, aucun accès réseau réel.
 *
 * Ce qui est protégé ici :
 *   - une clé d'accès n'existe qu'en empreinte : jamais relisible, révocable ;
 *   - un export exige le mot de passe du propriétaire, et laisse une trace ;
 *   - un CSV est un vrai CSV français (point-virgule, accents, guillemets doublés) ;
 *   - une facture porte toujours le même numéro pour la même vente ;
 *   - le relais Sheets n'accepte QUE le script Google du propriétaire, en https.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { hashPassword } from '../lib/server/auth-core.ts';
import {
  TYPES_EXPORT,
  cellule,
  construireExport,
  derniersExports,
  factureDeVente,
  journaliserExport,
  motDePasseProprietaireValide,
  texteCsv,
  ventesPourFactures,
} from '../lib/server/exports.ts';
import { cleValide, creerCle, listerCles, revoquerCle } from '../lib/server/cles-api.ts';
import { envoyerVersSheets, urlSheetsValide } from '../lib/server/sheets.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-exports-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

const MAINTENANT = 1_760_000_000_000;

async function creerProprietaire(db, motDePasse = 'MotDePasse!2026') {
  const empreinte = await hashPassword(motDePasse, 1000);
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms)
          VALUES ('usr_proprietaire','proprietaire@davar.test','Propriétaire',?,?,'admin','active',?)`,
    args: [empreinte, MAINTENANT, MAINTENANT],
  });
  return 'usr_proprietaire';
}

/** Une base peuplée : une formation, deux étudiants dont un compte de test, une vente. */
async function basePeuplee() {
  const db = await baseVide();
  await creerProprietaire(db);
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('trn_orateur','Devenir un excellent orateur',39900,'prd_6wx1czzp',1)`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES ('usr_reel','etudiant@davar.test','Awa « la oratrice »','peu-importe',?, 'student','active',?,0)`,
    args: [MAINTENANT, MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES ('usr_test','essai@davar.test','Compte de test','peu-importe',?, 'student','active',?,1)`,
    args: [MAINTENANT, MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_0001','etudiant@davar.test','trn_orateur','70.57','USD',?)`,
    args: [MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms)
          VALUES ('usr_reel','trn_orateur','verified_purchase','sale_0001',?)`,
    args: [MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO course_modules(id,training_id,position,title) VALUES ('mod_1','trn_orateur',1,'Vaincre le trac')`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO course_lessons(id,module_id,position,title,kind,duration_min) VALUES ('lec_1','mod_1',1,'D’où vient le trac ?','video',12)`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES ('usr_reel','lec_1',?)`,
    args: [MAINTENANT],
  });
  return db;
}

test('une clé d’accès n’est rangée qu’en empreinte, jamais en clair', async () => {
  const db = await baseVide();
  const proprietaire = await creerProprietaire(db);

  const creation = await creerCle(db, { label: 'Mon outil', createur: proprietaire }, MAINTENANT);
  assert.equal(creation.ok, true);
  assert.match(creation.cle, /^dvk_[0-9a-f]{48}$/);

  // La clé en clair ne doit apparaître NULLE PART dans la base.
  const recherche = await db.execute({
    sql: `SELECT COUNT(*) AS trouves FROM api_keys WHERE instr(key_hash, ?) > 0`,
    args: [creation.cle],
  });
  assert.equal(Number(recherche.rows[0].trouves), 0, 'la clé en clair ne doit pas être rangée');

  const cles = await listerCles(db);
  assert.equal(cles.length, 1);
  assert.equal(cles[0].label, 'Mon outil');
  assert.equal(cles[0].prefix, creation.cle.slice(0, 12));
  assert.equal(cles[0].revokedAtMs, null);

  assert.equal(await cleValide(db, creation.cle, MAINTENANT + 1000), true);
  const usage = await listerCles(db);
  assert.equal(usage[0].lastUsedAtMs, MAINTENANT + 1000, 'l’usage d’une clé est daté');
  await db.close();
});

test('une clé révoquée cesse immédiatement de fonctionner — et une fausse clé ne passe jamais', async () => {
  const db = await baseVide();
  const proprietaire = await creerProprietaire(db);
  const { cle, id } = await creerCle(db, { label: 'Script maison', createur: proprietaire }, MAINTENANT);

  assert.equal(await revoquerCle(db, id, MAINTENANT + 10), true);
  assert.equal(await revoquerCle(db, id, MAINTENANT + 20), false, 'une clé déjà révoquée ne l’est pas deux fois');
  assert.equal(await cleValide(db, cle, MAINTENANT + 30), false);

  assert.equal(await cleValide(db, 'dvk_' + 'a'.repeat(48), MAINTENANT), false, 'une clé inventée ne doit pas passer');
  assert.equal(await cleValide(db, 'pas-une-cle', MAINTENANT), false);
  await db.close();
});

test('sortir des données exige le mot de passe du propriétaire, à l’instant du geste', async () => {
  const db = await baseVide();
  const proprietaire = await creerProprietaire(db, 'MotDePasse!2026');

  assert.equal(await motDePasseProprietaireValide(db, proprietaire, 'MotDePasse!2026'), true);
  assert.equal(await motDePasseProprietaireValide(db, proprietaire, 'presque-le-bon'), false);
  assert.equal(await motDePasseProprietaireValide(db, proprietaire, ''), false);
  assert.equal(await motDePasseProprietaireValide(db, 'usr_inconnu', 'MotDePasse!2026'), false);
  await db.close();
});

test('un CSV français : BOM, point-virgule, guillemets doublés, accents intacts', () => {
  assert.equal(cellule('simple'), 'simple');
  assert.equal(cellule('Awa « la oratrice »'), 'Awa « la oratrice »');
  assert.equal(cellule('nom;prénom'), '"nom;prénom"');
  assert.equal(cellule('dit "oui"'), '"dit ""oui"""');
  assert.equal(cellule(null), '');

  const csv = texteCsv(['Nom', 'Adresse e-mail'], [['Awa; Diallo', 'awa@davar.test']]);
  assert.equal(csv.charCodeAt(0), 0xfeff, 'le BOM UTF-8 permet à Excel d’ouvrir le fichier');
  assert.ok(csv.includes('"Awa; Diallo"'));
  assert.ok(csv.includes('awa@davar.test'));
  assert.ok(csv.includes('\r\n'), 'le CSV utilise des fins de ligne Windows, lues partout');
});

test('l’export des étudiants est complet et n’emporte JAMAIS un compte de test', async () => {
  const db = await basePeuplee();
  const table = await construireExport(db, 'etudiants');
  assert.deepEqual(table.entetes, ['Nom', 'Adresse e-mail', 'Statut', 'Inscrit le', 'Dernière connexion', 'Formations']);
  const courriels = table.lignes.map((ligne) => ligne[1]);
  assert.deepEqual(courriels, ['etudiant@davar.test'], 'le compte de test reste hors des exports');
  assert.equal(table.lignes[0][5], 1, 'le nombre de formations est compté');
  await db.close();
});

test('les ventes, les progressions et les avis s’exportent tels quels', async () => {
  const db = await basePeuplee();
  const ventes = await construireExport(db, 'ventes');
  assert.equal(ventes.lignes.length, 1);
  assert.equal(ventes.lignes[0][0], 'sale_0001');
  assert.equal(ventes.lignes[0][3], '70.57');
  assert.equal(ventes.lignes[0][4], 'USD');

  const progressions = await construireExport(db, 'progressions');
  assert.equal(progressions.lignes.length, 1);
  assert.equal(progressions.lignes[0][3], 1, 'une leçon faite');
  assert.equal(progressions.lignes[0][4], 1, 'une leçon au total');

  const avis = await construireExport(db, 'avis');
  assert.equal(avis.lignes.length, 0);

  assert.deepEqual([...TYPES_EXPORT], ['etudiants', 'ventes', 'progressions', 'avis', 'certifications', 'devoirs']);
  await db.close();
});

test('chaque export est journalisé — on sait toujours qui a fait sortir quoi', async () => {
  const db = await baseVide();
  await journaliserExport(db, 'etudiants', 12, 'usr_proprietaire', MAINTENANT);
  await journaliserExport(db, 'ventes', 3, 'usr_proprietaire', MAINTENANT + 5000);

  const journal = await derniersExports(db, 10);
  assert.equal(journal.length, 2);
  assert.equal(journal[0].kind, 'ventes', 'le plus récent d’abord');
  assert.equal(journal[0].rows, 3);
  assert.equal(journal[1].atMs, MAINTENANT);
  await db.close();
});

test('une facture garde toujours le même numéro pour la même vente', async () => {
  const db = await basePeuplee();
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_0002','autre@davar.test','trn_orateur','70.57','USD',?)`,
    args: [MAINTENANT + 86_400_000],
  });

  const premiere = await factureDeVente(db, 'sale_0001');
  const relue = await factureDeVente(db, 'sale_0001');
  assert.equal(premiere.numero, relue.numero);
  assert.match(premiere.numero, /^DAV-\d{4}-0001$/);

  const seconde = await factureDeVente(db, 'sale_0002');
  assert.equal(seconde.numero, 'DAV-2025-0002');
  assert.equal(seconde.acheteur, 'autre@davar.test');

  const inconnue = await factureDeVente(db, 'sale_fantome');
  assert.equal(inconnue, null);

  const toutes = await ventesPourFactures(db, 10);
  assert.equal(toutes.length, 2);
  assert.equal(toutes[0].reference, 'sale_0002', 'la plus récente d’abord');
  await db.close();
});

test('le relais Sheets n’accepte que le script Google du propriétaire, en https', async () => {
  assert.equal(urlSheetsValide('https://script.google.com/macros/s/AKfy/exec'), true);
  assert.equal(urlSheetsValide('http://script.google.com/macros/s/AKfy/exec'), false, 'https exigé');
  assert.equal(urlSheetsValide('https://exemple.test/collecte'), false, 'un inconnu ne reçoit pas les données');
  assert.equal(urlSheetsValide(''), false);

  const db = await basePeuplee();
  const refuse = await envoyerVersSheets(db, { url: 'https://exemple.test/collecte', kind: 'etudiants' });
  assert.equal(refuse.ok, false);

  let vu = null;
  const envoi = await envoyerVersSheets(db, {
    url: 'https://script.google.com/macros/s/AKfy/exec',
    kind: 'etudiants',
    fetchImpl: async (url, options) => {
      vu = { url, options };
      return new Response('{"ok":true}', { status: 200 });
    },
  });
  assert.equal(envoi.ok, true);
  assert.equal(envoi.lignes, 1);
  assert.equal(vu.url, 'https://script.google.com/macros/s/AKfy/exec');
  const corps = JSON.parse(vu.options.body);
  assert.equal(corps.feuille, 'Étudiants');
  assert.deepEqual(corps.entetes, ['Nom', 'Adresse e-mail', 'Statut', 'Inscrit le', 'Dernière connexion', 'Formations']);
  assert.equal(corps.lignes.length, 1);
  assert.equal(corps.lignes[0][1], 'etudiant@davar.test');

  const panne = await envoyerVersSheets(db, {
    url: 'https://script.google.com/macros/s/AKfy/exec',
    kind: 'ventes',
    fetchImpl: async () => {
      throw new Error('réseau coupé');
    },
  });
  assert.equal(panne.ok, false, 'une panne réseau se dit, elle ne casse rien');
  await db.close();
});
