/**
 * Simule UNIQUEMENT en local ce que fait le Pulse Chariow vérifié : enregistrer
 * une vente payée pour une adresse e-mail, avant même que le compte existe.
 *
 *   node --experimental-strip-types scripts/simulate-chariow-sale.mjs <produit> <email> <sale_id>
 *
 * Ce script n'appelle AUCUNE API Chariow, ne vérifie AUCUNE signature et ne
 * remplace pas la recette marchande : il sert à éprouver le chemin
 * « achat externe -> confirmation d'e-mail -> accès automatique » sur la base
 * de développement locale. Refusé si APP_ENV n'est pas development ou si la
 * base n'est pas un fichier local.
 */
import { createClient } from '@libsql/client';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { recordVerifiedChariowSale } from '../lib/server/chariow-ledger.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.TURSO_DATABASE_URL?.trim();
const env = process.env.APP_ENV ?? 'development';

if (env !== 'development' || process.env.NODE_ENV === 'production') {
  console.error('REFUS : simulation réservée au développement local.');
  process.exit(2);
}
if (url && !url.startsWith('file:')) {
  console.error('REFUS : TURSO_DATABASE_URL ne pointe pas vers un fichier local.');
  process.exit(2);
}

const [productId, email, saleId] = process.argv.slice(2);
if (!productId || !email || !saleId) {
  console.error('Usage : node --experimental-strip-types scripts/simulate-chariow-sale.mjs <prd_…> <email> <sal_…>');
  process.exit(2);
}

const db = createClient({ url: url ?? `file:${resolve(root, 'dev-data/davar-dev.db')}` });
try {
  const price = await db.execute({
    sql: 'SELECT price_cfa FROM trainings WHERE chariow_product_id = ? AND published = 1',
    args: [productId],
  });
  if (price.rows.length === 0) {
    console.error('Aucune formation publiée ne correspond à ce produit.');
    process.exit(2);
  }
  await recordVerifiedChariowSale(
    db,
    {
      saleId,
      emailNormalized: email.trim().toLowerCase(),
      productId,
      amountText: String(price.rows[0].price_cfa),
      currency: 'XOF',
    },
    `dlv_${saleId}`
  );
  console.log(`+ vente simulée enregistrée : ${saleId} → ${email.trim().toLowerCase()} (${productId})`);
  const state = await db.execute({
    sql: `SELECT (SELECT COUNT(*) FROM verified_purchases) AS purchases,
                 (SELECT COUNT(*) FROM enrollments) AS enrollments`,
  });
  console.log('état local :', JSON.stringify(state.rows[0]));
} catch (error) {
  console.error('Échec de la simulation :', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  db.close();
}
