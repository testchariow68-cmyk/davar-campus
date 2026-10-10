/**
 * LE JOURNAL DE L'ÉQUIPE — chaque action de chaque membre, et la règle du prototype.
 *
 * Protégé ici :
 *   - une action inconnue est REFUSÉE : le vocabulaire du journal ne dérive pas ;
 *   - une action lourde est marquée « importante », une action de terrain non ;
 *   - le manager ne voit PAS les actions du Super Administrateur ;
 *   - une action importante prévient le propriétaire et les managers — jamais
 *     celui qui vient de la faire, et personne si le propriétaire agit seul.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { ACTIONS, enregistrerEvenement, lireJournal } from '../lib/server/journal.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-journal-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

const MAINTENANT = 1_760_000_000_000;

async function utilisateur(db, id, nom, role = 'staff', roles = '') {
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test,staff_roles)
          VALUES (?,?,?,'peu-importe',?,?,'active',?,0,?)`,
    args: [id, `${id}@davar.test`, nom, MAINTENANT, role, MAINTENANT, roles],
  });
}

test('le vocabulaire du journal est fermé : une action inconnue ne s’écrit pas', async () => {
  const db = await baseVide();
  await utilisateur(db, 'staff_1', 'Coach Réel');
  assert.equal(await enregistrerEvenement(db, { actorId: 'staff_1', action: 'inventee' }), false);
  assert.equal(await enregistrerEvenement(db, { actorId: 'staff_1', action: 'acces-accorde', detail: 'awa@davar.test' }), true);
  const lignes = await lireJournal(db);
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].libelle, ACTIONS['acces-accorde'].libelle);
  assert.equal(lignes[0].niveau, 'importante');
  await db.close();
});

test('le manager ne voit pas les actions du Super Administrateur', async () => {
  const db = await baseVide();
  await utilisateur(db, 'admin_1', 'M. Yapo', 'admin');
  await utilisateur(db, 'staff_1', 'Coach Réel');
  await enregistrerEvenement(
    db,
    { actorId: 'admin_1', action: 'reglages-campus', detail: 'palette' },
    MAINTENANT
  );
  await enregistrerEvenement(db, { actorId: 'staff_1', action: 'reponse-conversation', detail: 'conversation 1' }, MAINTENANT + 1);

  const complet = await lireJournal(db);
  assert.equal(complet.length, 2, 'le propriétaire voit tout');
  assert.deepEqual(complet.map((l) => l.acteur), ['Coach Réel', 'M. Yapo'], 'la plus récente en tête');

  const vueManager = await lireJournal(db, { horsProprietaire: true });
  assert.equal(vueManager.length, 1, 'le manager ne voit que les actions du staff');
  assert.equal(vueManager[0].acteur, 'Coach Réel');
  await db.close();
});

test('une action importante alerte le propriétaire et les managers — jamais son auteur', async () => {
  const db = await baseVide();
  await utilisateur(db, 'admin_1', 'M. Yapo', 'admin');
  await utilisateur(db, 'staff_1', 'Coach Réel', 'staff', 'manager');
  await utilisateur(db, 'staff_2', 'Correcteur Réel', 'staff', 'correcteur');

  await enregistrerEvenement(
    db,
    { actorId: 'staff_2', action: 'export-donnees', detail: 'etudiants' },
    MAINTENANT
  );

  const clocheAdmin = await db.execute("SELECT title, body FROM notifications WHERE user_id = 'admin_1'");
  assert.equal(clocheAdmin.rows.length, 1, 'le propriétaire est prévenu');
  assert.match(String(clocheAdmin.rows[0].body), /Correcteur Réel a exporté des données/);

  const clocheManager = await db.execute("SELECT title FROM notifications WHERE user_id = 'staff_1'");
  assert.equal(clocheManager.rows.length, 1, 'le manager est prévenu');

  const clocheAuteur = await db.execute("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'staff_2'");
  assert.equal(Number(clocheAuteur.rows[0].n), 0, 'celui qui a agi n’est pas prévenu de son propre geste');

  // Une action de terrain (routine) n'alerte personne.
  await enregistrerEvenement(db, { actorId: 'staff_2', action: 'reponse-conversation' }, MAINTENANT + 1);
  const total = await db.execute('SELECT COUNT(*) AS n FROM notifications');
  assert.equal(Number(total.rows[0].n), 2, 'aucune alerte de plus : la routine reste dans le journal');
  await db.close();
});

test('une action du propriétaire seul n’envoie d’alerte à personne', async () => {
  const db = await baseVide();
  await utilisateur(db, 'admin_1', 'M. Yapo', 'admin');
  await enregistrerEvenement(db, { actorId: 'admin_1', action: 'purge-contenu', detail: 'contenu d’essai' }, MAINTENANT);
  const total = await db.execute('SELECT COUNT(*) AS n FROM notifications');
  assert.equal(Number(total.rows[0].n), 0, 'se prévenir soi-même ne sert à rien');
  await db.close();
});
