/**
 * VENTES — la chaîne du prototype, sans deviner un centime.
 *
 * Protégé ici :
 *   - un achat vérifié qui n'a pas encore de compte passe dans « acheteurs sans compte » ;
 *   - quand le compte existe et que l'accès a été rattaché, la chaîne est complète ;
 *   - jamais de total mélangeant deux devises ;
 *   - les comptes de test n'apparaissent pas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { analyseVentes, formaterMontant } from '../lib/server/ventes.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-ventes-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

const MAINTENANT = 1_760_000_000_000;

/** Les séparateurs de milliers français utilisent une espace fine insécable. */
const lisible = (valeur) => valeur.replace(/[\u202f\u00a0]/g, ' ');

test('les montants se lisent dans la devise reçue, jamais convertis', () => {
  assert.equal(lisible(formaterMontant('39900', 'XOF')), '39 900 FCFA');
  assert.equal(lisible(formaterMontant('39900.00', 'XOF')), '39 900 FCFA');
  assert.equal(lisible(formaterMontant('70.57', 'USD')), '70,57 USD');
  assert.equal(formaterMontant('inconnu', 'USD'), 'inconnu USD');
  assert.equal(lisible(formaterMontant('39 900', 'XAF')), '39 900 FCFA');
});

test('la chaîne d’un achat : webhook, compte, formation', async () => {
  const db = await baseVide();
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('trn_1','Devenir un excellent orateur',39900,'prd_1',1)`,
  });
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES ('usr_1','acheteur@exemple.com','Awa Traoré','peu-importe',?,'student','active',?,0)`,
    args: [MAINTENANT, MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_1','acheteur@exemple.com','trn_1','39900','XOF',?)`,
    args: [MAINTENANT - 1000],
  });
  await db.execute({
    sql: `INSERT INTO pulse_deliveries(delivery_id,sale_id,received_at_ms) VALUES ('dlv_1','sale_1',?)`,
    args: [MAINTENANT - 900],
  });
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms)
          VALUES ('usr_1','trn_1','verified_purchase','sale_1',?)`,
    args: [MAINTENANT - 800],
  });
  // Un achat de la même journée, mais dont l'acheteur n'a pas encore de compte.
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_2','pas.encore@exemple.com','trn_1','70.57','USD',?)`,
    args: [MAINTENANT - 500],
  });
  // Un achat rattaché à un COMPTE DE TEST : il ne compte nulle part.
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES ('usr_test','test@exemple.com','Étudiant De Test','peu-importe',?,'student','active',?,1)`,
    args: [MAINTENANT, MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_3','test@exemple.com','trn_1','39900','XOF',?)`,
    args: [MAINTENANT - 100],
  });

  const analyse = await analyseVentes(db, MAINTENANT);
  assert.equal(analyse.total, 2, 'le compte de test est écarté');
  assert.equal(analyse.trenteJours, 2);
  assert.equal(analyse.attribuees, 1);
  assert.deepEqual(
    analyse.lignes.map((ligne) => ligne.saleId),
    ['sale_2', 'sale_1'],
    'la plus récente en tête'
  );

  const rattachee = analyse.lignes[1];
  assert.equal(rattachee.etudiant, 'Awa Traoré');
  assert.equal(rattachee.compteIdentifie, true);
  assert.equal(rattachee.compteNonConfirme, false);
  assert.equal(rattachee.webhookMs, MAINTENANT - 900);
  assert.equal(rattachee.attribueeMs, MAINTENANT - 800);
  assert.equal(rattachee.formation, 'Devenir un excellent orateur');

  assert.deepEqual(analyse.sansCompte.map((ligne) => ligne.saleId), ['sale_2']);

  // Deux devises, deux totaux : 39900 XOF et 70,57 USD, jamais additionnés.
  const xof = analyse.parDevise.find((totaux) => totaux.devise === 'XOF');
  const usd = analyse.parDevise.find((totaux) => totaux.devise === 'USD');
  assert.equal(lisible(xof.montantAffiche), '39 900 FCFA');
  assert.equal(lisible(xof.panierMoyenAffiche), '39 900 FCFA');
  assert.equal(usd.montantAffiche, '70,57 USD');
  await db.close();
});

test('un compte non confirmé est annoncé comme tel', async () => {
  const db = await baseVide();
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('trn_1','Orateur',39900,'prd_1',1)`,
  });
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,role,status,created_at_ms,is_test)
          VALUES ('usr_1','attente@exemple.com','Bakary Koffi','peu-importe','student','active',?,0)`,
    args: [MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_1','attente@exemple.com','trn_1','39900','XOF',?)`,
    args: [MAINTENANT],
  });
  const analyse = await analyseVentes(db, MAINTENANT);
  assert.equal(analyse.lignes[0].compteIdentifie, true);
  assert.equal(analyse.lignes[0].compteNonConfirme, true, 'l’adresse doit être confirmée pour recevoir l’accès');
  assert.equal(analyse.lignes[0].attribueeMs, null);
  await db.close();
});
