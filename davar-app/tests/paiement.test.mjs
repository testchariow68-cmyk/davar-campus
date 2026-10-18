/**
 * Le rattachement d'un paiement à une formation, exécuté sur SQLite local.
 *
 * Aucun appel réseau, aucune clé marchande : c'est le SQL réel qui est testé,
 * et surtout les trois refus — car c'est là que se joue l'argent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { registerUser } from '../lib/server/auth-core.ts';
import { attribuerApresPaiement, creerIntention, fraisDe } from '../lib/server/paiement.ts';

process.env.APP_ENV = 'development';
process.env.AUTH_PBKDF2_ITERATIONS = '10000';

const { pathToFileURL } = await import('node:url');

async function baseFraiche() {
  const client = createClient({
    url: pathToFileURL(join(mkdtempSync(join(tmpdir(), 'davar-paiement-')), 'test.db')).href,
  });
  await applyAllMigrations(client);
  await client.execute(
    "INSERT INTO trainings(id,title,price_cfa,published) VALUES ('t-orateur','Devenir un excellent orateur',45000,1)"
  );
  const inscription = await registerUser(client, {
    email: 'marie@example.com',
    displayName: 'Marie',
    password: 'Orateur-2026',
  });
  const userId = inscription?.userId ?? inscription?.user?.id ?? inscription?.id;
  assert.ok(userId, 'inscription attendue');
  return { db: client, userId };
}

const MONTANT = 45_000 + fraisDe(45_000);

test('les frais de traitement sont de 3,5 % du prix, arrondis', () => {
  assert.equal(fraisDe(45_000), 1_575);
  assert.equal(fraisDe(0), 0);
});

test('paiement confirmé : la formation est attribuée et annoncée', async () => {
  const { db, userId } = await baseFraiche();
  const intention = await creerIntention(db, {
    userId,
    trainingId: 't-orateur',
    montantCfa: MONTANT,
    devise: 'XOF',
    provider: 'flutterwave',
  });

  const resultat = await attribuerApresPaiement(db, {
    provider: 'flutterwave',
    eventId: 'charge.completed:123456',
    intentionId: intention,
    montant: MONTANT,
    devise: 'XOF',
  });
  assert.equal(resultat, 'attribue');

  const inscriptions = await db.execute({
    sql: 'SELECT source FROM enrollments WHERE user_id = ? AND training_id = ?',
    args: [userId, 't-orateur'],
  });
  assert.equal(inscriptions.rows.length, 1);
  assert.equal(inscriptions.rows[0].source, 'verified_purchase');

  const intentions = await db.execute({
    sql: 'SELECT status FROM payment_intents WHERE id = ?',
    args: [intention],
  });
  assert.equal(String(intentions.rows[0].status), 'verified');
});

test('le même événement rejoué n’attribue jamais deux fois', async () => {
  const { db, userId } = await baseFraiche();
  const intention = await creerIntention(db, {
    userId,
    trainingId: 't-orateur',
    montantCfa: MONTANT,
    devise: 'XOF',
    provider: 'flutterwave',
  });
  const evenement = {
    provider: 'flutterwave',
    eventId: 'charge.completed:999',
    intentionId: intention,
    montant: MONTANT,
    devise: 'XOF',
  };
  assert.equal(await attribuerApresPaiement(db, evenement), 'attribue');
  assert.equal(await attribuerApresPaiement(db, evenement), 'deja');

  const inscriptions = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM enrollments WHERE user_id = ?',
    args: [userId],
  });
  assert.equal(Number(inscriptions.rows[0].n), 1);
});

test('un montant qui ne correspond pas à l’intention n’ouvre aucun accès', async () => {
  const { db, userId } = await baseFraiche();
  const intention = await creerIntention(db, {
    userId,
    trainingId: 't-orateur',
    montantCfa: MONTANT,
    devise: 'XOF',
    provider: 'flutterwave',
  });

  // Quelqu'un annonce avoir payé, mais pas le montant attendu.
  const resultat = await attribuerApresPaiement(db, {
    provider: 'flutterwave',
    eventId: 'charge.completed:1',
    intentionId: intention,
    montant: 100,
    devise: 'XOF',
  });
  assert.equal(resultat, 'ecart');

  const inscriptions = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM enrollments WHERE user_id = ?',
    args: [userId],
  });
  assert.equal(Number(inscriptions.rows[0].n), 0);
});

test('une intention inconnue n’ouvre aucun accès', async () => {
  const { db, userId } = await baseFraiche();
  const resultat = await attribuerApresPaiement(db, {
    provider: 'flutterwave',
    eventId: 'charge.completed:1',
    intentionId: 'pay_inexistant',
    montant: MONTANT,
    devise: 'XOF',
  });
  assert.equal(resultat, 'inconnu');
  const inscriptions = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM enrollments WHERE user_id = ?',
    args: [userId],
  });
  assert.equal(Number(inscriptions.rows[0].n), 0);
});
