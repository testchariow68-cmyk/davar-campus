/**
 * Règles de l'Espace Direction, verrouillées par des tests.
 * Exécution : npm test — base libSQL temporaire, aucun accès réseau.
 *
 * Ces tests protègent des décisions du propriétaire, pas seulement du code :
 *   - la plateforme démarre VIDE (aucun contenu d'exemple) ;
 *   - une formation vide ne peut PAS être ouverte à la vente ;
 *   - la progression d'un étudiant ne se supprime jamais en silence ;
 *   - une vente est une pièce comptable : ni suppression, ni purge ;
 *   - le propriétaire est UNIQUE, et le dernier ne peut pas se rétrograder.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  accorderAcces,
  ajouterLecon,
  basculerCompteTest,
  ajouterModule,
  creerFormation,
  definirRole,
  deplacerLecon,
  listerEtudiants,
  listerFormations,
  lireStructure,
  modifierLecon,
  publierFormation,
  purgerContenu,
  retirerAcces,
  supprimerFormation,
  supprimerLecon,
  supprimerModule,
  vueEnsemble,
} from '../lib/server/direction.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-direction-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

async function creerProprietaire(db, email = 'proprietaire@davar.test') {
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms)
          VALUES ('usr_proprietaire',?, 'Propriétaire', 'peu-importe', ?, 'admin', 'active', ?)`,
    args: [email, Date.now(), Date.now()],
  });
  return 'usr_proprietaire';
}

async function creerEtudiant(db, email = 'etudiant@davar.test', confirme = true, id = 'usr_etudiant') {
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms)
          VALUES (?,?,'Étudiant','peu-importe',?,'student','active',?)`,
    args: [id, email, confirme ? now : null, now],
  });
  return id;
}

test('la plateforme démarre vide : la vue d’ensemble ne montre aucun contenu', async () => {
  const db = await baseVide();
  const vue = await vueEnsemble(db);
  assert.equal(vue.formations, 0);
  assert.equal(vue.modules, 0);
  assert.equal(vue.lecons, 0);
  assert.equal(vue.etudiants, 0);
  assert.equal(vue.acces, 0);
  assert.equal(vue.achats, 0);
  await db.close();
});

test('une formation naît FERMÉE et ne s’ouvre jamais sans leçon', async () => {
  const db = await baseVide();
  const creation = await creerFormation(db, { titre: 'Devenir un excellent orateur', prixCfa: 45000 });
  assert.equal(creation.ok, true);

  const [formation] = await listerFormations(db);
  assert.equal(formation.published, false, 'une formation neuve ne doit pas être visible');

  const refus = await publierFormation(db, formation.id, true);
  assert.equal(refus.ok, false);
  assert.match(refus.erreur, /aucune_lecon/);

  const module = await ajouterModule(db, formation.id, 'Vaincre le trac');
  assert.equal(module.ok, true);
  const structure = await lireStructure(db, formation.id);
  const lecon = await ajouterLecon(db, structure[0].id, 'D’où vient le trac ?', 'video', 12, '');
  assert.equal(lecon.ok, true);
  assert.match(lecon.message, /Ressource pas encore publiée/, 'une leçon sans ressource doit le dire');

  const ouverture = await publierFormation(db, formation.id, true);
  assert.equal(ouverture.ok, true);
  await db.close();
});

test('l’ordre des modules et des leçons se réorganise sans collision d’unicité', async () => {
  const db = await baseVide();
  await creerFormation(db, { titre: 'Formation test', prixCfa: 1000 });
  const [formation] = await listerFormations(db);
  await ajouterModule(db, formation.id, 'Premier');
  await ajouterModule(db, formation.id, 'Deuxième');
  let structure = await lireStructure(db, formation.id);
  assert.deepEqual(structure.map((module) => module.title), ['Premier', 'Deuxième']);

  const { deplacerModule } = await import('../lib/server/direction.ts');
  await deplacerModule(db, structure[1].id, 'haut');
  structure = await lireStructure(db, formation.id);
  assert.deepEqual(structure.map((module) => module.title), ['Deuxième', 'Premier']);
  assert.deepEqual(structure.map((module) => module.position), [1, 2], 'les positions restent 1..n');

  await ajouterLecon(db, structure[0].id, 'Leçon A', 'video', 5, '');
  await ajouterLecon(db, structure[0].id, 'Leçon B', 'text', 3, '');
  let lecons = (await lireStructure(db, formation.id))[0].lecons;
  assert.deepEqual(lecons.map((lecon) => lecon.title), ['Leçon A', 'Leçon B']);
  await deplacerLecon(db, lecons[1].id, 'haut');
  lecons = (await lireStructure(db, formation.id))[0].lecons;
  assert.deepEqual(lecons.map((lecon) => lecon.title), ['Leçon B', 'Leçon A']);
  await db.close();
});

test('seules les adresses https sont acceptées pour une ressource ou un lien', async () => {
  const db = await baseVide();
  await creerFormation(db, { titre: 'Formation test', prixCfa: 0 });
  const [formation] = await listerFormations(db);
  await ajouterModule(db, formation.id, 'Module');
  const structure = await lireStructure(db, formation.id);

  const insecurise = await ajouterLecon(db, structure[0].id, 'Vidéo', 'video', 5, 'http://exemple.test/video.mp4');
  assert.equal(insecurise.ok, false);
  assert.equal(insecurise.erreur, 'ressource_non_https');

  const lienInsecure = await creerFormation(db, { titre: 'Autre formation', prixCfa: 0, buyUrl: 'http://exemple.test/acheter' });
  assert.equal(lienInsecure.ok, false);
  assert.equal(lienInsecure.erreur, 'lien_non_https');
  await db.close();
});

test('la progression d’un étudiant protège sa leçon et son module', async () => {
  const db = await baseVide();
  await creerEtudiant(db);
  await creerFormation(db, { titre: 'Formation test', prixCfa: 1000 });
  const [formation] = await listerFormations(db);
  await ajouterModule(db, formation.id, 'Module protégé');
  const structure = await lireStructure(db, formation.id);
  await ajouterLecon(db, structure[0].id, 'Leçon terminée', 'video', 10, '');
  const lecon = (await lireStructure(db, formation.id))[0].lecons[0];
  await db.execute({
    sql: 'INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES (?,?,?)',
    args: ['usr_etudiant', lecon.id, Date.now()],
  });

  const suppressionLecon = await supprimerLecon(db, lecon.id);
  assert.equal(suppressionLecon.ok, false);
  assert.match(suppressionLecon.erreur, /progression_protegee/);

  const suppressionModule = await supprimerModule(db, structure[0].id);
  assert.equal(suppressionModule.ok, false);
  assert.match(suppressionModule.erreur, /progression_protegee/);

  // Enrichir reste toujours permis : c'est la règle de l'enrichissement silencieux.
  const renommage = await modifierLecon(db, lecon.id, 'Leçon enrichie', 'video', 12, 'https://exemple.test/video.mp4');
  assert.equal(renommage.ok, true);
  assert.equal((await lireStructure(db, formation.id))[0].lecons[0].terminees, 1);
  await db.close();
});

test('une formation achetée ne se supprime pas, elle se ferme', async () => {
  const db = await baseVide();
  await creerEtudiant(db);
  await creerFormation(db, { titre: 'Formation vendue', prixCfa: 45000 });
  const [formation] = await listerFormations(db);
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_test','etudiant@davar.test',?,'45000','XOF',?)`,
    args: [formation.id, Date.now()],
  });
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms)
          VALUES ('usr_etudiant',?,'verified_purchase','sale_test',?)`,
    args: [formation.id, Date.now()],
  });

  const suppression = await supprimerFormation(db, formation.id);
  assert.equal(suppression.ok, false);
  assert.match(suppression.erreur, /suppression_refusee/);

  const retrait = await retirerAcces(db, 'etudiant@davar.test', formation.id);
  assert.equal(retrait.ok, false);
  assert.match(retrait.erreur, /achat_verifie/);

  const purge = await purgerContenu(db, 'VIDER');
  assert.equal(purge.ok, false);
  assert.match(purge.erreur, /ventes_reelles/);
  await db.close();
});

test('un accès accordé à la main se retire, et exige une adresse confirmée', async () => {
  const db = await baseVide();
  await creerEtudiant(db, 'confirme@davar.test', true, 'usr_confirme');
  await creerEtudiant(db, 'non-confirme@davar.test', false, 'usr_non_confirme');
  await creerFormation(db, { titre: 'Formation offerte', prixCfa: 0 });
  const [formation] = await listerFormations(db);

  const refus = await accorderAcces(db, 'non-confirme@davar.test', formation.id);
  assert.equal(refus.ok, false);
  assert.match(refus.erreur, /email_non_confirme/);

  const octroi = await accorderAcces(db, 'confirme@davar.test', formation.id);
  assert.equal(octroi.ok, true);
  const lireEtudiant = async (email) => (await listerEtudiants(db, email)).find((item) => item.email === email);
  const etudiant = await lireEtudiant('confirme@davar.test');
  assert.equal(etudiant.acces.length, 1);
  assert.equal(etudiant.acces[0].source, 'staff_grant');

  const retrait = await retirerAcces(db, 'confirme@davar.test', formation.id);
  assert.equal(retrait.ok, true);
  assert.equal((await lireEtudiant('confirme@davar.test')).acces.length, 0);
  await db.close();
});

test('le propriétaire est unique, et le dernier ne peut pas être rétrogradé', async () => {
  const db = await baseVide();
  await creerProprietaire(db);
  await creerEtudiant(db, 'aide@davar.test', true, 'usr_aide');

  const deuxieme = await definirRole(db, 'aide@davar.test', 'admin');
  assert.equal(deuxieme.ok, false);
  assert.match(deuxieme.erreur, /proprietaire_unique/);

  const staff = await definirRole(db, 'aide@davar.test', 'staff');
  assert.equal(staff.ok, true);

  const demission = await definirRole(db, 'proprietaire@davar.test', 'student');
  assert.equal(demission.ok, false);
  assert.match(demission.erreur, /dernier_proprietaire/);
  await db.close();
});

test('la purge vide le contenu mais garde les formations', async () => {
  const db = await baseVide();
  await creerEtudiant(db);
  await creerFormation(db, { titre: 'Formation à vider', prixCfa: 1000 });
  const [formation] = await listerFormations(db);
  await ajouterModule(db, formation.id, 'Module');
  const structure = await lireStructure(db, formation.id);
  await ajouterLecon(db, structure[0].id, 'Leçon', 'video', 5, '');
  await accorderAcces(db, 'etudiant@davar.test', formation.id);
  await publierFormation(db, formation.id, true);

  const mauvaiseConfirmation = await purgerContenu(db, 'vider');
  assert.equal(mauvaiseConfirmation.ok, false);
  assert.match(mauvaiseConfirmation.erreur, /confirmation_absente/);

  const purge = await purgerContenu(db, 'VIDER');
  assert.equal(purge.ok, true);
  const vue = await vueEnsemble(db);
  assert.equal(vue.modules, 0);
  assert.equal(vue.lecons, 0);
  assert.equal(vue.acces, 0);
  assert.equal(vue.formations, 1, 'les formations sont conservées : c’est le catalogue du propriétaire');
  await db.close();
});

test('les comptes de test sont marqués et exclus des chiffres réels', async () => {
  const db = await baseVide();
  await creerEtudiant(db, 'reel@davar.test', true, 'usr_reel');
  await creerEtudiant(db, 'test@davar.test', true, 'usr_test');

  const avant = await vueEnsemble(db);
  assert.equal(avant.etudiants, 2);
  assert.equal(avant.comptesTest, 0);

  const bascule = await basculerCompteTest(db, 'test@davar.test', true);
  assert.equal(bascule.ok, true);

  const apres = await vueEnsemble(db);
  assert.equal(apres.etudiants, 1, 'un compte de test ne doit pas gonfler le chiffre des étudiants');
  assert.equal(apres.comptesTest, 1);

  /* La liste ordinaire ne montre QUE de vraies personnes : les comptes de test
     n'apparaissent que dans l'espace « Vue test », réservé au propriétaire. */
  const liste = await listerEtudiants(db);
  assert.equal(liste.find((etudiant) => etudiant.email === 'test@davar.test'), undefined);
  assert.equal(liste.find((etudiant) => etudiant.email === 'reel@davar.test').estTest, false);

  const listeVueTest = await listerEtudiants(db, '', 100, true);
  assert.equal(listeVueTest.find((etudiant) => etudiant.email === 'test@davar.test').estTest, true);

  const retour = await basculerCompteTest(db, 'test@davar.test', false);
  assert.equal(retour.ok, true);
  assert.equal((await vueEnsemble(db)).comptesTest, 0);
  assert.equal((await vueEnsemble(db)).etudiants, 2);

  const inconnu = await basculerCompteTest(db, 'personne@davar.test', true);
  assert.equal(inconnu.ok, false);
  await db.close();
});
