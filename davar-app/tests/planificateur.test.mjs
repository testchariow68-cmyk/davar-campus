/**
 * LE ROBOT DU DIMANCHE — ce que la plateforme fait sans qu'on la réveille.
 *
 * Le propriétaire charge son stock de motivations et l'enregistre. Ensuite la
 * plateforme distribue : une par dimanche, dans l'ordre, sans jamais repartir
 * deux fois la même semaine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { ajouterMotivations, lireMotivations } from '../lib/server/motivations.ts';
import { estLeMomentDuDimanche, tachesPlanifiees } from '../lib/server/planificateur.ts';

/** Un dimanche 9 h, heure du serveur (les Worker comptent en UTC). */
const DIMANCHE_9H = Date.UTC(2026, 9, 25, 9, 5); // 25 octobre 2026 est un dimanche
const DIMANCHE_8H = Date.UTC(2026, 9, 25, 8, 55);
const SAMEDI_9H = Date.UTC(2026, 9, 24, 9, 5);

async function base() {
  const db = createClient({
    url: pathToFileURL(join(mkdtempSync(join(tmpdir(), 'davar-robot-')), 'test.db')).href,
  });
  await applyAllMigrations(db);
  await db.execute(
    "INSERT INTO users(id,email_normalized,display_name,password_hash,role,status,created_at_ms) VALUES ('u-test','a@b.test','Awa','x','student','active',1)"
  );
  await db.execute(
    "INSERT INTO users(id,email_normalized,display_name,password_hash,role,status,created_at_ms) VALUES ('u-test2','c@d.test','Bko','x','student','active',1)"
  );
  return db;
}

test('le robot ne connaît que le dimanche, à partir de 9 h', () => {
  assert.equal(estLeMomentDuDimanche(DIMANCHE_9H), true);
  assert.equal(estLeMomentDuDimanche(DIMANCHE_8H), false, 'pas avant l’heure dite');
  assert.equal(estLeMomentDuDimanche(SAMEDI_9H), false, 'pas un autre jour');
});

test('un dimanche, la motivation part toute seule à tout le monde', async () => {
  const db = await base();
  const avant = await lireMotivations(db, DIMANCHE_9H);
  // Le stock de départ est celui du projet ; on y ajoute deux motivations, à la suite.
  await ajouterMotivations(db, '11. La constance vaut mieux que l’élan.\n12. Chaque dimanche, une marche de plus.', DIMANCHE_9H);
  const garni = await lireMotivations(db, DIMANCHE_9H);
  assert.equal(garni.restantes, avant.restantes + 2);

  const rapport = await tachesPlanifiees(db, DIMANCHE_9H);
  assert.equal(rapport.motivation?.ok, true);
  assert.equal(rapport.motivation?.numero, 1, 'la première du stock, dans l’ordre');
  assert.equal(rapport.motivation?.envoyees, 2, 'les deux étudiants');

  const apres = await lireMotivations(db, DIMANCHE_9H);
  assert.equal(apres.restantes, garni.restantes - 1, 'une seule est partie');

  const recues = await db.execute({ sql: 'SELECT user_id, title, body FROM notifications ORDER BY user_id' });
  assert.equal(recues.rows.length, 2);
  assert.equal(recues.rows[0].title, 'Votre motivation de la semaine 💪');
});

test('le robot peut repasser quinze fois : la motivation ne part qu’une fois par semaine', async () => {
  const db = await base();
  await tachesPlanifiees(db, DIMANCHE_9H);
  const deuxieme = await tachesPlanifiees(db, DIMANCHE_9H + 15 * 60 * 1000);
  assert.equal(deuxieme.motivation, null, 'rien ne repart le même dimanche');
  const troisieme = await tachesPlanifiees(db, DIMANCHE_9H + 3 * 24 * 3600 * 1000);
  assert.equal(troisieme.motivation, null, 'ni en milieu de semaine');
  const dimancheSuivant = await tachesPlanifiees(db, DIMANCHE_9H + 7 * 24 * 3600 * 1000);
  assert.equal(dimancheSuivant.motivation?.numero, 2, 'le dimanche suivant, la suivante');
});

test('un samedi, le robot ne distribue rien du tout', async () => {
  const db = await base();
  const avant = await lireMotivations(db, SAMEDI_9H);
  const rapport = await tachesPlanifiees(db, SAMEDI_9H);
  assert.equal(rapport.motivation, null);
  const etat = await lireMotivations(db, SAMEDI_9H);
  assert.equal(etat.restantes, avant.restantes, 'le stock est intact');
});
