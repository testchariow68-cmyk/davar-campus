/**
 * VUE TEST — les règles du propriétaire, verrouillées par des tests.
 * Exécution : npm test — base libSQL temporaire, aucun accès réseau.
 *
 * Ce qui est protégé ici (décision du 6 octobre 2026, reprise du prototype) :
 *   - seuls des comptes de test peuvent être ouverts ;
 *   - jamais un vrai étudiant, jamais un membre du staff, jamais un compte d'administration ;
 *   - jamais la personne réelle elle-même (le fondateur ne se regarde pas en vue test) ;
 *   - seul le Super Admin y a droit : le Manager attend l'écran de configuration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  COMPTES_TEST,
  cibleAutorisee,
  creerComptesTest,
  listerComptesTest,
  peutTesterUneVue,
  supprimerComptesTest,
} from '../lib/server/vue-test.ts';
import { AuthError, loginUser } from '../lib/server/auth-core.ts';
import { vueEnsemble } from '../lib/server/direction.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-vuetest-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

async function ajouterUtilisateur(db, { id, email, nom, role = 'student', estTest = 0, statut = 'active' }) {
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES (?,?,?,'peu-importe',?,?,?,?,?)`,
    args: [id, email, nom, Date.now(), role, statut, Date.now(), estTest],
  });
}

function sessionDe(id, role) {
  return { id, email: `${id}@davar.test`, displayName: id, role, emailVerified: true, sessionExpiresAtMs: Date.now() + 1000 };
}

test('la vue test est réservée au Super Admin', () => {
  assert.equal(peutTesterUneVue({ role: 'admin' }), true);
  assert.equal(peutTesterUneVue({ role: 'staff' }), false);
  assert.equal(peutTesterUneVue({ role: 'student' }), false);
});

test('la liste des vues ne contient QUE des comptes de test, jamais un vrai étudiant ni le staff', async () => {
  const db = await baseVide();
  await ajouterUtilisateur(db, { id: 'u-reel', email: 'vrai@davar.test', nom: 'Vraie Personne' });
  await ajouterUtilisateur(db, { id: 'u-test-etudiant', email: 'test-etudiant@davar.test', nom: 'Élève test', estTest: 1 });
  await ajouterUtilisateur(db, { id: 'u-test-equipe', email: 'test-equipe@davar.test', nom: 'Équipe test', role: 'staff', estTest: 1 });
  await ajouterUtilisateur(db, { id: 'u-proprietaire', email: 'patron@davar.test', nom: 'Propriétaire', role: 'admin' });

  const vues = await listerComptesTest(db);
  assert.deepEqual(
    vues.map((vue) => vue.id).sort(),
    ['u-test-equipe', 'u-test-etudiant']
  );
});

test('une vraie personne ne peut JAMAIS être ouverte en vue test', async () => {
  const db = await baseVide();
  await ajouterUtilisateur(db, { id: 'u-reel', email: 'vrai@davar.test', nom: 'Vraie Personne' });
  await ajouterUtilisateur(db, { id: 'u-test-etudiant', email: 'test-etudiant@davar.test', nom: 'Élève test', estTest: 1 });

  const proprietaire = sessionDe('u-proprietaire', 'admin');
  assert.equal(await cibleAutorisee(db, proprietaire, 'u-reel'), null, 'un vrai étudiant doit être refusé');
  assert.equal(await cibleAutorisee(db, proprietaire, 'u-inexistant'), null, 'une cible inconnue doit être refusée');

  const ouverte = await cibleAutorisee(db, proprietaire, 'u-test-etudiant');
  assert.ok(ouverte, 'un compte de test doit pouvoir être ouvert');
  assert.equal(ouverte.displayName, 'Élève test');
});

test('jamais un compte d’administration, jamais soi-même, jamais un membre du staff non marqué', async () => {
  const db = await baseVide();
  await ajouterUtilisateur(db, { id: 'u-autre-admin', email: 'autre-admin@davar.test', nom: 'Autre admin', role: 'admin', estTest: 1 });
  await ajouterUtilisateur(db, { id: 'u-equipe-vraie', email: 'equipe@davar.test', nom: 'Membre réel', role: 'staff' });

  const proprietaire = sessionDe('u-proprietaire', 'admin');
  assert.equal(await cibleAutorisee(db, proprietaire, 'u-autre-admin'), null, 'un compte admin reste refusé même marqué test');
  assert.equal(await cibleAutorisee(db, proprietaire, 'u-proprietaire'), null, 'on ne se regarde pas soi-même');
  assert.equal(await cibleAutorisee(db, proprietaire, 'u-equipe-vraie'), null, 'un membre du staff non marqué test est refusé');
});

test('sans rôle Super Admin, aucune cible n’est ouvrable — même un compte de test', async () => {
  const db = await baseVide();
  await ajouterUtilisateur(db, { id: 'u-test-etudiant', email: 'test-etudiant@davar.test', nom: 'Élève test', estTest: 1 });

  assert.equal(await cibleAutorisee(db, sessionDe('u-membre', 'staff'), 'u-test-etudiant'), null);
  assert.equal(await cibleAutorisee(db, sessionDe('u-eleve', 'student'), 'u-test-etudiant'), null);
});

test('un compte de test suspendu n’est pas ouvrable', async () => {
  const db = await baseVide();
  await ajouterUtilisateur(db, { id: 'u-test-suspendu', email: 'suspendu@davar.test', nom: 'Suspendu', estTest: 1, statut: 'suspended' });
  assert.equal(await cibleAutorisee(db, sessionDe('u-proprietaire', 'admin'), 'u-test-suspendu'), null);
});

test('les huit comptes du prototype se préparent en un geste, sans jamais de doublon', async () => {
  const db = await baseVide();
  const creation = await creerComptesTest(db);
  assert.equal(creation.crees, 8, 'un étudiant et sept rôles d’équipe');
  assert.equal(creation.total, 8);

  const vues = await listerComptesTest(db);
  assert.deepEqual(
    vues.map((vue) => vue.id),
    [
      'u-test-etudiant',
      'u-test-coach',
      'u-test-correcteur',
      'u-test-assistant',
      'u-test-contenu',
      'u-test-support',
      'u-test-analyste',
      'u-test-manager',
    ],
    'la vue étudiant d’abord, puis les rôles dans l’ordre du prototype'
  );
  assert.equal(vues[0].libelle, 'Vue Étudiant — Étudiant (test)');
  assert.equal(vues[1].libelle, 'Vue Coach — Coach (test)', 'la vue porte le nom du rôle, comme le prototype');
  assert.equal(vues[7].libelle, 'Vue Manager — Manager (test)');
  assert.deepEqual(vues[3].roles, ['assistant']);
  assert.equal(vues[0].courriel, 'etudiant.test@davarcampus.co', 'les adresses du prototype');

  const seconde = await creerComptesTest(db);
  assert.equal(seconde.crees, 0, 'rejouer la préparation ne crée aucun doublon');
  assert.equal(seconde.comptes.length, 8);
  await db.close();
});

test('un compte de test ne peut PAS se connecter, et ne compte dans aucun chiffre', async () => {
  const db = await baseVide();
  await ajouterUtilisateur(db, { id: 'u-reel', email: 'vrai@davar.test', nom: 'Vraie Personne' });
  const avant = await vueEnsemble(db);
  await creerComptesTest(db);
  const apres = await vueEnsemble(db);

  assert.equal(apres.etudiants, avant.etudiants, 'aucun étudiant réel de plus');
  assert.equal(apres.comptesTest, 8, 'les comptes de test sont comptés À PART');
  assert.equal(apres.membres, avant.membres, 'les vues d’équipe ne grossissent pas l’équipe réelle');

  // Le code secret est calculé sur un secret aléatoire jetable : aucune clé n’ouvre.
  const fausseCle = 'Z'.repeat(43);
  for (const courriel of ['etudiant.test@davarcampus.co', 'coach.test@davarcampus.co', 'manager.test@davarcampus.co']) {
    await assert.rejects(
      () => loginUser(db, { email: courriel, verifier: fausseCle }),
      (erreur) => erreur instanceof AuthError && erreur.code === 'invalid_credentials',
      `${courriel} ne doit pas pouvoir se connecter`
    );
  }
  await db.close();
});

test('retirer les comptes de test efface tout ce qu’ils ont laissé — et rien d’autre', async () => {
  const db = await baseVide();
  await creerComptesTest(db);
  await ajouterUtilisateur(db, { id: 'u-reel', email: 'vrai@davar.test', nom: 'Vraie Personne' });
  const maintenant = Date.now();

  // Ce qu'une visite test peut laisser derrière elle.
  await db.execute({
    sql: `INSERT INTO user_prefs(user_id,pref_key,pref_value,updated_at_ms) VALUES ('u-test-etudiant','notifications.actives','0',?)`,
    args: [maintenant],
  });
  await db.execute({
    sql: `INSERT INTO notifications(id,user_id,kind,title,body,route,created_at_ms,read_at_ms,expires_at_ms)
          VALUES ('ntf_test','u-test-etudiant','system','Essai',NULL,NULL,?,NULL,?)`,
    args: [maintenant, maintenant + 86_400_000],
  });
  await db.execute({
    sql: `INSERT INTO notifications(id,user_id,kind,title,body,route,created_at_ms,read_at_ms,expires_at_ms)
          VALUES ('ntf_reel','u-reel','system','Vraie',NULL,NULL,?,NULL,?)`,
    args: [maintenant, maintenant + 86_400_000],
  });

  const retrait = await supprimerComptesTest(db);
  assert.equal(retrait.supprimes, 8);
  assert.equal((await listerComptesTest(db)).length, 0);

  const restes = await db.execute("SELECT COUNT(*) AS n FROM user_prefs WHERE user_id = 'u-test-etudiant'");
  assert.equal(Number(restes.rows[0].n), 0, 'les préférences du compte de test partent avec lui');
  const notificationsTest = await db.execute("SELECT COUNT(*) AS n FROM notifications WHERE id = 'ntf_test'");
  assert.equal(Number(notificationsTest.rows[0].n), 0, 'la notification du compte de test aussi');
  const notificationReelle = await db.execute("SELECT COUNT(*) AS n FROM notifications WHERE id = 'ntf_reel'");
  assert.equal(Number(notificationReelle.rows[0].n), 1, 'celle d’une vraie personne reste intacte');
  const vraiePersonne = await db.execute("SELECT COUNT(*) AS n FROM users WHERE id = 'u-reel'");
  assert.equal(Number(vraiePersonne.rows[0].n), 1, 'aucune vraie personne n’est touchée');

  // Les comptes marqués à la main ne sont pas des comptes du prototype : on n'y touche pas.
  await ajouterUtilisateur(db, { id: 'u-test-manuel', email: 'manuel@davar.test', nom: 'Marqué à la main', estTest: 1 });
  const second = await supprimerComptesTest(db);
  assert.equal(second.supprimes, 0, 'un compte marqué à la main garde ses données');
  await db.close();
});
