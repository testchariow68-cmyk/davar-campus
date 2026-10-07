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
import { cibleAutorisee, listerComptesTest, peutTesterUneVue } from '../lib/server/vue-test.ts';

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
