/* Cloudflare Worker — POST /api/flutterwave/webhook
   Vérifie le webhook Flutterwave avant de créditer quoi que ce soit.
   Contrat officiel API v3 :
     — en-tête  verifi-hash = secret configuré dans le Dashboard (Settings → API → Webhook)
     — payload  { event:'charge.completed', data:{ id, tx_ref, flw_ref, status, amount, currency, customer } }
     — vérif    GET https://api.flutterwave.com/v3/transactions/:id/verify  (Authorization: Bearer <clé secrète>)
   Règles (identiques à Money Fusion) :
     1. Jamais confiance au webhook seul → toujours re-vérifier la transaction côté serveur.
     2. Dédoublonnage par identifiant de transaction (data.id, sinon flw_ref) : 1 tx = 1 crédit.
     3. Seul 'charge.completed' avec data.status === 'successful' est payable.
   Déploiement : wrangler deploy ; variables d'environnement FLW_WEBHOOK_SECRET + FLW_SECRET_KEY ;
   KV ou DO pour l'ensemble `seen` (dédoublonnage persistant). */

export function verifyHash(secret, header) {
  if (!secret || typeof header !== 'string' || !header) return false;
  if (header.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0; /* comparaison à temps constant */
}

export function payableData(body) {
  if (!body || body.event !== 'charge.completed') return null;
  const d = body.data;
  if (!d || d.status !== 'successful') return null;
  return d;
}

export function dedupeKey(data) {
  if (!data) return '';
  return String(data.id || data.flw_ref || '');
}

export async function verifyTransaction(id, secretKey) {
  const r = await fetch('https://api.flutterwave.com/v3/transactions/' + encodeURIComponent(id) + '/verify', {
    headers: { Authorization: 'Bearer ' + secretKey }
  });
  if (!r.ok) return null;
  return r.json();
}

export async function handleWebhook(request, env, seen) {
  const hash = request.headers.get('verifi-hash');
  if (!verifyHash(env.FLW_WEBHOOK_SECRET || '', hash)) {
    return new Response('invalid verifi-hash', { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const data = payableData(body);
  if (!data) return new Response('ignored', { status: 200 }); /* événement non payable : acquitter sans créditer */
  const key = dedupeKey(data);
  if (!key || seen.has(key)) return new Response('duplicate', { status: 200 });
  seen.add(key);
  const v = await verifyTransaction(data.id, env.FLW_SECRET_KEY || '');
  if (!v || v.status !== 'success' || !v.data || v.data.status !== 'successful') {
    return new Response('verify failed', { status: 202 }); /* ne pas créditer ; Flutterwave renverra l'événement */
  }
  /* À ce point seulement : transmettre tx_ref + montant au crédit (ensureEnrollment côté app). */
  return new Response(JSON.stringify({ credit: true, tx_ref: v.data.tx_ref, amount: v.data.amount, currency: v.data.currency }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
    const seen = env.SEEN_TX || new Set(); /* en production : KV/DO persistant */
    return handleWebhook(request, env, seen);
  }
};
