/**
 * MOTIVATIONS ET DÉCOUVERTE — les décisions du propriétaire, verrouillées.
 * Exécution : npm test — base libSQL temporaire, aucun réseau.
 *
 * Ce qui est protégé ici :
 *   - le stock est numéroté ; un numéro déjà pris est REFUSÉ, jamais écrasé ;
 *   - retirer une motivation recale les numéros suivants ;
 *   - le dimanche est le rendez-vous : la date annoncée est un vrai dimanche ;
 *   - un envoi ne tombe jamais deux fois sur la même motivation, et prévient
 *     quand le stock approche de la fin ;
 *   - une formation déjà achetée n'affiche plus son prix ni de bouton d'achat ;
 *   - un lien d'achat n'est proposé que s'il est réellement https.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { lienAchatChariow, listFormationsADecouvrir } from '../lib/server/campus.ts';
import {
  ajouterMotivations,
  envoyerMotivation,
  lireMotivations,
  prochainDimanche,
  remplacerListe,
  retirerMotivation,
} from '../lib/server/motivations.ts';

process.env.APP_ENV = 'development';

const MAINTENANT = 1_760_000_000_000; // 9 octobre 2025, un jeudi

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-motivations-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

async function etudiant(db, id, isTest = 0) {
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES (?,?,?,?,?,'student','active',?,?)`,
    args: [id, `${id}@davar.test`, `Nom ${id}`, 'peu-importe', MAINTENANT, MAINTENANT, isTest],
  });
}

test('le stock est numéroté : un numéro pris est refusé, et une ligne libre prend le suivant', async () => {
  const db = await baseVide();

  // Au départ, le stock est celui du propriétaire : ses dix motivations, déjà numérotées.
  let etat = await lireMotivations(db);
  assert.equal(etat.liste.length, 10);
  assert.equal(etat.restantes, 10);
  assert.equal(etat.index, 0);

  // Coller « 1. … » alors que le numéro 1 est pris : refus net, rien n'est écrit.
  const conflit = await ajouterMotivations(db, '1. Une autre idée');
  assert.equal(conflit.ok, false);
  assert.match(conflit.erreur, /numeros_deja_utilises/);
  assert.equal((await lireMotivations(db)).liste[0], etat.liste[0], 'la liste n’a pas bougé');

  // Une ligne SANS numéro prend le premier numéro libre : la série reste continue.
  const ajout = await ajouterMotivations(db, 'Une idée neuve\nUne seconde idée');
  assert.equal(ajout.ok, true);
  assert.equal(ajout.ajoutees, 2);
  assert.equal(ajout.total, 12);
  etat = await lireMotivations(db);
  assert.equal(etat.liste[10], 'Une idée neuve');
  assert.equal(etat.liste[11], 'Une seconde idée');

  // Retirer la n°1 recale toute la série.
  assert.equal(await retirerMotivation(db, 1), true);
  const apres = await lireMotivations(db);
  assert.equal(apres.liste.length, 11);
  assert.equal(apres.liste[0], etat.liste[1], 'la n°2 est devenue la n°1');
  assert.equal(await retirerMotivation(db, 99), false);
  await db.close();
});

test('le rendez-vous est le dimanche, une motivation par envoi et par étudiant', async () => {
  const db = await baseVide();
  await etudiant(db, 'usr_1');
  await etudiant(db, 'usr_2');
  await etudiant(db, 'usr_test', 1);

  const dimanche = new Date(prochainDimanche(new Date('2025-10-09T10:00:00').getTime()));
  assert.equal(dimanche.getDay(), 0, 'la date annoncée est bien un dimanche');

  const etat = await lireMotivations(db);
  const premier = await envoyerMotivation(db, MAINTENANT);
  assert.equal(premier.ok, true);
  assert.equal(premier.numero, 1);
  assert.equal(premier.envoyees, 2, 'les comptes de test ne reçoivent rien');
  assert.equal(premier.restantes, 9);

  const notifications = await db.execute('SELECT title, body FROM notifications ORDER BY user_id');
  assert.equal(notifications.rows.length, 2);
  assert.match(String(notifications.rows[0].title), /motivation/i);
  assert.equal(String(notifications.rows[0].body), etat.liste[0], 'un seul envoi, jamais doublé');

  const second = await envoyerMotivation(db, MAINTENANT + 7 * 86_400_000);
  assert.equal(second.numero, 2);
  assert.equal(second.restantes, 8, 'la motivation suivante, jamais la même');
  await db.close();
});

test('une liste enregistrée d’avance prend le relais à l’épuisement, et le stock bas alerte', async () => {
  const db = await baseVide();
  await etudiant(db, 'usr_1');
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES ('usr_admin','direction@davar.test','M. Yapo','peu-importe',?,'admin','active',?,0)`,
    args: [MAINTENANT, MAINTENANT],
  });

  const suivante = await remplacerListe(db, '1. Nouvelle A\n2. Nouvelle B');
  assert.equal(suivante.ok, true);
  assert.equal(suivante.active, false, 'la liste actuelle n’est pas encore épuisée');
  let etat = await lireMotivations(db);
  assert.deepEqual(etat.suivante, ['Nouvelle A', 'Nouvelle B']);
  assert.equal(etat.restantes, 10, 'la liste en cours reste la liste active');

  // Le stock arrive à son terme : le prochain envoi bascule sur la liste suivante.
  await db.execute({
    sql: `INSERT INTO app_settings(key,value,updated_at_ms) VALUES ('motivations.index','10',?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [MAINTENANT],
  });
  const bascule = await envoyerMotivation(db, MAINTENANT + 7 * 86_400_000);
  assert.equal(bascule.ok, true);
  assert.equal(bascule.numero, 1, 'la liste suivante repart au numéro 1');
  assert.equal(bascule.motivationSuivante, 'Nouvelle B');
  etat = await lireMotivations(db);
  assert.deepEqual(etat.suivante, []);
  assert.equal(etat.courante, 'Nouvelle B');

  const alertes = await db.execute("SELECT title FROM notifications WHERE user_id = 'usr_admin'");
  assert.ok(alertes.rows.length >= 1, 'le propriétaire est prévenu quand le stock devient bas');
  assert.match(String(alertes.rows[0].title), /motivations/i);
  await db.close();
});

test('découvrir : le prix et le bouton n’existent que pour ce qui n’est PAS acheté', async () => {
  const db = await baseVide();
  await etudiant(db, 'usr_1');
  await db.execute({
    sql: `INSERT INTO trainings(id,title,description,price_cfa,chariow_product_id,buy_url,published)
          VALUES ('trn_orateur','Devenir un excellent orateur','Vaincre le trac',39900,'prd_6wx1czzp',NULL,1)`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO trainings(id,title,description,price_cfa,chariow_product_id,buy_url,published)
          VALUES ('trn_autre','Prise de parole avancée','Perfectionnement',49900,'prd_autre','https://exemple.test/achat',1)`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,published) VALUES ('trn_cachee','Brouillon',1000,0)`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_1','usr_1@davar.test','trn_orateur','70.57','USD',?)`,
    args: [MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms)
          VALUES ('usr_1','trn_orateur','verified_purchase','sale_1',?)`,
    args: [MAINTENANT],
  });

  const aDecouvrir = await listFormationsADecouvrir(db, 'usr_1');
  assert.deepEqual(aDecouvrir.map((formation) => formation.id), ['trn_autre'], 'ce qui est acheté sort de la liste, ce qui est brouillon n’y entre jamais');
  assert.equal(aDecouvrir[0].prixCfa, 49900);
  assert.equal(aDecouvrir[0].lienAchat, 'https://exemple.test/achat');

  assert.equal(lienAchatChariow(null, 'prd_6wx1czzp'), 'https://d-ueo.mychariow.co/prd_6wx1czzp/checkout');
  assert.equal(lienAchatChariow('', 'pas-un-produit'), null, 'sans produit ni lien : pas de bouton');
  assert.equal(lienAchatChariow('https://exemple.test/achat', 'prd_x'), 'https://exemple.test/achat', 'le lien enregistré prime');
  assert.equal(
    lienAchatChariow('http://exemple.test', 'prd_x'),
    'https://d-ueo.mychariow.co/prd_x/checkout',
    'un lien non https est ignoré au profit du produit'
  );
  await db.close();
});
