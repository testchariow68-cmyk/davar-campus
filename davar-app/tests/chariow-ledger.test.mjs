/**
 * Chemin d'écriture du webhook Chariow, exécuté sur SQLite local.
 * Aucun appel réseau, aucun secret marchand : c'est le SQL réel qui est testé.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  claimPurchasesForVerifiedUser,
  consumeEmailToken,
  registerUser,
} from '../lib/server/auth-core.ts';
import { recordVerifiedChariowSale } from '../lib/server/chariow-ledger.ts';

process.env.APP_ENV = 'development';
process.env.AUTH_PBKDF2_ITERATIONS = '10000';

const root = new URL('..', import.meta.url).pathname;

async function freshDb() {
  const client = createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), 'davar-ledger-')), 'test.db')}` });
  await applyAllMigrations(client);
  await client.execute(
    "INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('t-orateur','Devenir un excellent orateur',45000,'prd_6wx1czzp',1)"
  );
  return client;
}

const SALE = {
  saleId: 'sal_abc123',
  emailNormalized: 'marie@example.com',
  productId: 'prd_6wx1czzp',
  amountText: '45000',
  currency: 'XOF',
};

test('vente vérifiée : reçue, livrée, mais aucun accès avant confirmation d’e-mail', async () => {
  const db = await freshDb();
  const registration = await registerUser(db, {
    email: SALE.emailNormalized,
    displayName: 'Marie Achat',
    password: 'Formation-Davar-2026!',
  });

  await recordVerifiedChariowSale(db, SALE, 'dlv_0001');
  assert.equal((await db.execute('SELECT COUNT(*) AS c FROM verified_purchases')).rows[0].c, 1);
  assert.equal((await db.execute('SELECT COUNT(*) AS c FROM pulse_deliveries')).rows[0].c, 1);
  assert.equal((await db.execute('SELECT COUNT(*) AS c FROM enrollments')).rows[0].c, 0);

  // Rejeu de la même livraison : idempotent.
  await recordVerifiedChariowSale(db, SALE, 'dlv_0001');
  assert.equal((await db.execute('SELECT COUNT(*) AS c FROM verified_purchases')).rows[0].c, 1);
  assert.equal((await db.execute('SELECT COUNT(*) AS c FROM pulse_deliveries')).rows[0].c, 1);

  await consumeEmailToken(db, registration.verificationToken, 'verify_email');
  assert.equal(await claimPurchasesForVerifiedUser(db, registration.userId), 1);
  const enrollment = (await db.execute('SELECT training_id, source, sale_id FROM enrollments')).rows[0];
  assert.equal(enrollment.training_id, 't-orateur');
  assert.equal(enrollment.source, 'verified_purchase');
  assert.equal(enrollment.sale_id, 'sal_abc123');
});

test('produit inconnu : la vente est refusée en mode fermé', async () => {
  const db = await freshDb();
  await assert.rejects(
    () => recordVerifiedChariowSale(db, { ...SALE, productId: 'prd_inconnu' }, 'dlv_0002'),
    /produit ou reçu non concordant/
  );
  assert.equal((await db.execute('SELECT COUNT(*) AS c FROM verified_purchases')).rows[0].c, 0);
  assert.equal((await db.execute('SELECT COUNT(*) AS c FROM pulse_deliveries')).rows[0].c, 0);
});

test('montant divergent sur la même vente : refus, aucune écriture incohérente', async () => {
  const db = await freshDb();
  await recordVerifiedChariowSale(db, SALE, 'dlv_0003');
  await assert.rejects(
    () => recordVerifiedChariowSale(db, { ...SALE, amountText: '1' }, 'dlv_0004'),
    /produit ou reçu non concordant/
  );
  const stored = (await db.execute('SELECT amount_value_text FROM verified_purchases')).rows;
  assert.deepEqual(
    stored.map((row) => row.amount_value_text),
    ['45000']
  );
});

test('formation non publiée : aucun droit accordé', async () => {
  const db = await freshDb();
  await db.execute("UPDATE trainings SET published = 0 WHERE id = 't-orateur'");
  const registration = await registerUser(db, {
    email: SALE.emailNormalized,
    displayName: 'Marie Achat',
    password: 'Formation-Davar-2026!',
  });
  await assert.rejects(() => recordVerifiedChariowSale(db, SALE, 'dlv_0005'), /non concordant/);
  await consumeEmailToken(db, registration.verificationToken, 'verify_email');
  assert.equal(await claimPurchasesForVerifiedUser(db, registration.userId), 0);
});
