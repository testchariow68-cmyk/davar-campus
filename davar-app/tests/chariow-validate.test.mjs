import test from 'node:test';
import assert from 'node:assert/strict';
import { matchVerifiedChariowSale } from '../lib/payments/chariow-validate.ts';

const store='str_test_store';
const fixture=()=>({pulse:{event:'successful.sale',sale:{id:'sal_abc123',status:'completed',amount:{value:45000,currency:'XOF'}},
  product:{id:'prd_test'},customer:{email:' AWA@Example.org '},store:{id:store}},
  sale:{id:'sal_abc123',status:'completed',payment:{status:'success'},store:{id:store},
    product:{id:'prd_test'},customer:{email:'awa@example.org'},amount:{value:45000,currency:'XOF'}}});

test('vente API concordante avec Pulse -> seulement des champs vérifiés',()=>{
  const {pulse,sale}=fixture();
  assert.deepEqual(matchVerifiedChariowSale(pulse,sale,store),{
    saleId:'sal_abc123',emailNormalized:'awa@example.org',productId:'prd_test',
    amountText:'45000',currency:'XOF'});
});
test('vente réglée ensuite reste admissible si le paiement est vérifié',()=>{
  const {pulse,sale}=fixture(); sale.status='settled';
  assert.equal(matchVerifiedChariowSale(pulse,sale,store)?.saleId,'sal_abc123');
});
test('refuse fausse boutique, faux produit, vente impayée, email ou montant divergent',()=>{
  const changes=[
    s=>{s.store.id='other';}, s=>{s.product.id='other';},
    s=>{s.status='failed';}, s=>{s.payment.status='pending';},
    s=>{s.customer.email='other@example.org';}, s=>{s.amount.value=1;},
    s=>{s.amount.currency='EUR';}, s=>{s.amount.value=0;}, s=>{s.id='sal_other';},
  ];
  for (const change of changes) {
    const {pulse,sale}=fixture(); change(sale);
    assert.equal(matchVerifiedChariowSale(pulse,sale,store),null);
  }
});
test('refuse un payload manquant ou événement non autorisé',()=>{
  const {pulse,sale}=fixture();
  assert.equal(matchVerifiedChariowSale(null,sale,store),null);
  pulse.event='abandoned.sale';
  assert.equal(matchVerifiedChariowSale(pulse,sale,store),null);
});
