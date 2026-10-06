/* Vérification métier PURE : ne valide pas la signature, ni l'appel réseau.
 * Le Pulse ET la réponse GET /sales/{id} doivent être contrôlés séparément.
 * Aucune donnée du navigateur n'entre ici ; aucune attribution de cours ici.
 */
function obj(x: unknown): Record<string, unknown> | null {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
    ? x as Record<string, unknown> : null;
}
function string(x: unknown): x is string { return typeof x === 'string' && x.length > 0; }

export type VerifiedChariowSale = {
  saleId: string; emailNormalized: string; productId: string;
  amountText: string; currency: string;
};

/** Renvoie null si la vente ne peut pas être rapprochée sans ambiguïté. */
export function matchVerifiedChariowSale(
  pulseBody: unknown, apiSaleBody: unknown, expectedStoreId: string
): VerifiedChariowSale | null {
  const pulse = obj(pulseBody), sale = obj(apiSaleBody);
  if (!pulse || !sale || pulse.event !== 'successful.sale' || !string(expectedStoreId)) return null;
  const psale=obj(pulse.sale), pproduct=obj(pulse.product), pcustomer=obj(pulse.customer);
  const product=obj(sale.product), customer=obj(sale.customer), store=obj(sale.store), pstore=obj(pulse.store);
  const amount=obj(sale.amount), pamount=obj(psale?.amount), payment=obj(sale.payment);
  if (!psale || !pproduct || !pcustomer || !pstore || !product || !customer || !store || !amount || !pamount || !payment)
    return null;
  if (!string(sale.id) || !/^sal_[a-zA-Z0-9_-]{3,100}$/.test(sale.id) ||
      sale.id !== psale.id || !['completed','settled'].includes(String(sale.status)) || psale.status !== 'completed' ||
      payment.status !== 'success' || store.id !== expectedStoreId || pstore.id !== expectedStoreId ||
      !string(product.id) || product.id !== pproduct.id ||
      !string(customer.email) || !string(pcustomer.email)) return null;
  const email = customer.email.trim().toLowerCase();
  if (email !== pcustomer.email.trim().toLowerCase() ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (!string(amount.currency) || amount.currency !== pamount.currency ||
      typeof amount.value !== 'number' || !Number.isFinite(amount.value) || amount.value <= 0 ||
      amount.value !== pamount.value) return null;
  return {saleId: sale.id, emailNormalized: email, productId: product.id,
    amountText: String(amount.value), currency: amount.currency};
}
