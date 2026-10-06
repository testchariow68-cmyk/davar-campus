import {createClient} from '@libsql/client/web';
import {checkedConnection} from './turso';
import type {VerifiedChariowSale} from '../payments/chariow-validate';

/** Batch libSQL transactionnel. N'accuse réception qu'après validation durable.
 * Le lien produit -> formation est dans Turso, pas dans les données du Pulse.
 * L'email d'un compte n'est utilisable qu'après vérification explicite.
 */
export async function recordVerifiedChariowSale(sale: VerifiedChariowSale, deliveryId: string): Promise<void> {
  const client = createClient(checkedConnection());
  const now = Date.now();
  try {
    await client.batch([
      {sql:`INSERT INTO verified_purchases
        (sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
        SELECT ?,?,id,?,?,? FROM trainings WHERE chariow_product_id=? AND published=1
        ON CONFLICT(sale_id) DO NOTHING`,
       args:[sale.saleId,sale.emailNormalized,sale.amountText,sale.currency,now,sale.productId]},
      {sql:`INSERT INTO pulse_deliveries(delivery_id,sale_id,received_at_ms)
        SELECT ?,p.sale_id,? FROM verified_purchases p JOIN trainings t ON t.id=p.training_id
        WHERE p.sale_id=? AND p.buyer_email_normalized=? AND p.amount_value_text=?
        AND p.currency=? AND t.chariow_product_id=? AND t.published=1
        ON CONFLICT(delivery_id) DO NOTHING`,
       args:[deliveryId,now,sale.saleId,sale.emailNormalized,sale.amountText,sale.currency,sale.productId]},

      {sql:`INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms)
        SELECT u.id,p.training_id,'verified_purchase',p.sale_id,?
        FROM verified_purchases p JOIN users u ON u.email_normalized=p.buyer_email_normalized
        JOIN pulse_deliveries d ON d.sale_id=p.sale_id
        WHERE p.sale_id=? AND d.delivery_id=? AND u.email_verified_at_ms IS NOT NULL
        ON CONFLICT(user_id,training_id) DO NOTHING`,args:[now,sale.saleId,deliveryId]},
    ], 'write');
    // Fail closed si produit absent, identité de vente déjà associée à d'autres
    // valeurs, ou delivery_id déjà attaché à une autre vente.
    const check=await client.execute({sql:`SELECT p.buyer_email_normalized, p.amount_value_text,
      p.currency, t.chariow_product_id, d.sale_id AS delivery_sale_id
      FROM verified_purchases p JOIN trainings t ON t.id=p.training_id
      JOIN pulse_deliveries d ON d.delivery_id=? WHERE p.sale_id=?`,args:[deliveryId,sale.saleId]});
    const row=check.rows[0];
    if (!row || row.buyer_email_normalized!==sale.emailNormalized ||
        row.amount_value_text!==sale.amountText || row.currency!==sale.currency ||
        row.chariow_product_id!==sale.productId || row.delivery_sale_id!==sale.saleId)
      throw new Error('Chariow: produit ou reçu non concordant');
  } finally {client.close();}
}

/** À appeler UNIQUEMENT après confirmation serveur de l'email du compte.
 * Une vente pré-inscription reste en attente jusqu'à cette preuve de possession.
 */
export async function claimChariowPurchasesForVerifiedUser(userId: string): Promise<void> {
  const client=createClient(checkedConnection());
  try {
    await client.execute({sql:`INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms)
      SELECT u.id,p.training_id,'verified_purchase',p.sale_id,?
      FROM users u JOIN verified_purchases p ON p.buyer_email_normalized=u.email_normalized
      WHERE u.id=? AND u.email_verified_at_ms IS NOT NULL
      ON CONFLICT(user_id,training_id) DO NOTHING`,args:[Date.now(),userId]});
  } finally {client.close();}
}
