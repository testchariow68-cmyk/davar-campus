import { jsonNoStore } from '@/lib/server/http';
import { attribuerApresPaiement, lireClesPaiement, verifierTransactionFlutterwave } from '@/lib/server/paiement';
import { openDb } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';

/**
 * LE VRAI RATTACHEMENT — l'adresse que le propriétaire déclare dans
 * Flutterwave (« Settings → API → Webhook ») :
 *   https://SON-DOMAINE/api/flutterwave/webhook
 *
 * Le retour navigateur peut ne jamais arriver (onglet fermé, réseau coupé).
 * Le fournisseur rappelle donc notre serveur directement, et c'est ce message
 * qui fait foi pour attribuer la formation.
 *
 * Sans secret de webhook saisi dans son espace, la route refuse : mieux vaut
 * ne rien attribuer que d'attribuer sur la foi d'un inconnu.
 */
export async function POST(request: Request) {
  const db = await openDb();
  const cles = await lireClesPaiement(db);
  if (!cles.secret) return jsonNoStore({ error: 'webhook_non_configure' }, 503);
  if (request.headers.get('verif-hash') !== cles.secret)
    return jsonNoStore({ error: 'signature_refusee' }, 401);

  const corps = (await request.json().catch(() => ({}))) as {
    event?: string;
    data?: { id?: number | string; tx_ref?: string; status?: string };
  };
  const data = corps.data;
  if (corps.event !== 'charge.completed' || !data?.tx_ref || !data?.id)
    return jsonNoStore({ ok: true, ignore: true });
  if (data.status !== 'successful') return jsonNoStore({ ok: true, ignore: true });

  // Le message annonce un succès : on le fait confirmer par le fournisseur avant
  // d'ouvrir quoi que ce soit. Un message peut être rejoué, ou fabriqué.
  const verification = await verifierTransactionFlutterwave(db, String(data.id));
  if (!verification.ok || verification.reference !== data.tx_ref)
    return jsonNoStore({ ok: true, verifie: false });
  if (verification.montant === null || verification.devise === null)
    return jsonNoStore({ ok: true, verifie: false });

  const resultat = await attribuerApresPaiement(db, {
    provider: 'flutterwave',
    eventId: `charge.completed:${data.id}`,
    intentionId: data.tx_ref,
    montant: verification.montant,
    devise: verification.devise,
  });

  return jsonNoStore({ ok: true, resultat });
}
