/**
 * LE PASSAGE D'UN ÉTUDIANT — ce que le prototype faisait à chaque connexion.
 *
 * Protégé ici :
 *   - le mot de bienvenue après une absence, avec ses cinq textes qui tournent ;
 *   - les distinctions du temps attribuées à la visite, et prévenues dans la cloche ;
 *   - le rappel du cycle en cours, une seule fois ;
 *   - le passage se limite lui-même : il ne tourne pas à chaque clic ;
 *   - rien ne se passe pour un compte de test ou une personne sans trace.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { RETOURS, passageEtudiant } from '../lib/server/assiduite.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-passage-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

const MAINTENANT = 1_760_000_000_000;
const JOUR_MS = 24 * 60 * 60 * 1000;

async function utilisateur(db, id, nom, estTest = 0) {
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES (?,?,?,'peu-importe',?,'student','active',?,?)`,
    args: [id, `${id}@davar.test`, nom, MAINTENANT, MAINTENANT, estTest],
  });
}

async function travailler(db, userId, id, jourMs) {
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,published) VALUES ('trn_1','Orateur',39900,1) ON CONFLICT(id) DO NOTHING`,
  });
  await db.execute({
    sql: `INSERT INTO course_modules(id,training_id,title,position) VALUES ('mod_1','trn_1','Module',1) ON CONFLICT(id) DO NOTHING`,
  });
  await db.execute({
    sql: `INSERT INTO course_lessons(id,module_id,title,kind,position) VALUES (?, 'mod_1', ?, 'text', ?) ON CONFLICT(id) DO NOTHING`,
    args: [id, `Leçon ${id}`, Number(String(id).replace(/\D/g, '')) || 1],
  });
  await db.execute({
    sql: `INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES (?,?,?)`,
    args: [userId, id, jourMs],
  });
}

test('le retour après absence dépose un mot, et les textes tournent', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await db.execute({
    sql: `INSERT INTO badge_defs(id,name,cat,icon,short_text,position,auto_rule) VALUES
          ('BADGE_REGULARITE','Régularité','parcours','x','x',3,'trois_jours'),
          ('BADGE_PERSEVERANCE','Persévérance','parcours','x','x',4,'retour_apres_pause'),
          ('BADGE_RETOUR_EN_FORCE','Retour en Force','parcours','x','x',5,'retour_avec_progres')`,
  });
  // Une longue pause, puis le travail d'aujourd'hui : le retour est réel.
  await travailler(db, 'usr_1', 'lec_1', MAINTENANT - 40 * JOUR_MS);
  await travailler(db, 'usr_1', 'lec_2', MAINTENANT - 1000);

  const passage = await passageEtudiant(db, 'usr_1', MAINTENANT);
  assert.equal(passage.retour, RETOURS[0], 'le premier texte du propriétaire');
  assert.deepEqual(passage.distinctions, ['Retour en Force']);
  assert.equal(passage.rappel, null, 'on ne relance pas quelqu’un qui vient de travailler');

  const cloche = await db.execute("SELECT kind, title, body FROM notifications WHERE user_id = 'usr_1'");
  assert.equal(cloche.rows.length, 2, 'le mot de retour + la distinction');
  const genres = cloche.rows.map((ligne) => String(ligne.kind)).sort();
  assert.deepEqual(genres, ['badge', 'retour'], 'la distinction et le mot de retour');
  const mot = cloche.rows.find((ligne) => String(ligne.kind) === 'retour');
  assert.equal(String(mot.body), RETOURS[0]);

  // Une seconde visite immédiate : rien de plus, et rien n'est relu.
  const seconde = await passageEtudiant(db, 'usr_1', MAINTENANT + 60_000);
  assert.deepEqual(seconde, { retour: null, distinctions: [], rappel: null }, 'le passage se limite lui-même');
  await db.close();
});

test('un rappel part pour un étudiant qui a décroché, une fois par cycle', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Bakary Koffi');
  await travailler(db, 'usr_1', 'lec_1', MAINTENANT - 16 * JOUR_MS);

  const passage = await passageEtudiant(db, 'usr_1', MAINTENANT);
  assert.equal(passage.rappel, 'Votre parcours vous attend');
  const cloche = await db.execute("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'usr_1' AND kind = 'rappel'");
  assert.equal(Number(cloche.rows[0].n), 1);

  const encore = await passageEtudiant(db, 'usr_1', MAINTENANT + 11 * 60 * 1000);
  assert.equal(encore.rappel, null, 'le même cycle ne repart pas');
  await db.close();
});

test('un compte de test, ou une personne sans trace, ne déclenche rien', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_test', 'Étudiant De Test', 1);
  await utilisateur(db, 'usr_2', 'Nouvelle Étudiante');
  await travailler(db, 'usr_test', 'lec_1', MAINTENANT - 40 * JOUR_MS);

  assert.deepEqual(await passageEtudiant(db, 'usr_test', MAINTENANT), { retour: null, distinctions: [], rappel: null });
  assert.deepEqual(await passageEtudiant(db, 'usr_2', MAINTENANT), { retour: null, distinctions: [], rappel: null });
  const total = await db.execute('SELECT COUNT(*) AS n FROM notifications');
  assert.equal(Number(total.rows[0].n), 0, 'aucun message pour personne');
  await db.close();
});

test('celui qui a coupé les notifications n’en reçoit aucune', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await db.execute({
    sql: `INSERT INTO badge_defs(id,name,cat,icon,short_text,position,auto_rule) VALUES
          ('BADGE_REGULARITE','Régularité','parcours','x','x',3,'trois_jours'),
          ('BADGE_PERSEVERANCE','Persévérance','parcours','x','x',4,'retour_apres_pause'),
          ('BADGE_RETOUR_EN_FORCE','Retour en Force','parcours','x','x',5,'retour_avec_progres')`,
  });
  await db.execute({
    sql: `INSERT INTO user_prefs(user_id, pref_key, pref_value, updated_at_ms) VALUES ('usr_1', 'notifications.actives', '0', ?)`,
    args: [MAINTENANT],
  });
  await travailler(db, 'usr_1', 'lec_1', MAINTENANT - 40 * JOUR_MS);
  await travailler(db, 'usr_1', 'lec_2', MAINTENANT - 1000);

  const passage = await passageEtudiant(db, 'usr_1', MAINTENANT);
  assert.equal(passage.retour, null);
  const total = await db.execute('SELECT COUNT(*) AS n FROM notifications');
  assert.equal(Number(total.rows[0].n), 0);
  await db.close();
});
