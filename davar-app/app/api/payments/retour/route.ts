import { currentSession } from '@/lib/server/auth';
import { attribuerApresPaiement, verifierTransactionFlutterwave } from '@/lib/server/paiement';
import { openDb } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';

/**
 * RETOUR DU FOURNISSEUR.
 *
 * Après le paiement, le fournisseur ramène l'étudiant ici — avec un statut et
 * un numéro de transaction. Ce que rapporte le navigateur ne prouve RIEN :
 * quelqu'un peut très bien fabriquer la même adresse. On rappelle donc le
 * fournisseur pour vérifier, et on n'attribue la formation qu'ensuite.
 *
 * Ce n'est pas un écran : l'étudiant ne fait qu'y passer et se retrouve sur sa
 * formation, ou sur sa commande si le paiement n'est pas confirmé.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const statut = url.searchParams.get('status') ?? '';
  const transactionId = url.searchParams.get('transaction_id') ?? '';
  const reference = url.searchParams.get('tx_ref') ?? '';

  const db = await openDb();
  const intention = reference
    ? await db.execute({
        sql: 'SELECT user_id, training_id, amount_cfa, currency FROM payment_intents WHERE id = ?',
        args: [reference],
      })
    : null;
  const ligne = intention?.rows[0];
  const formation = ligne ? String(ligne.training_id) : null;
  const commande = formation ? `/campus/checkout/${encodeURIComponent(formation)}` : '/campus/catalogue';

  if (statut !== 'successful' || !transactionId || !ligne)
    return Response.redirect(new URL(`${commande}?paiement=refuse`, url.origin), 303);

  const verification = await verifierTransactionFlutterwave(transactionId);
  if (!verification.ok || verification.reference !== reference)
    return Response.redirect(new URL(`${commande}?paiement=attente`, url.origin), 303);

  const session = await currentSession();
  if (!session) return Response.redirect(new URL('/connexion', url.origin), 303);

  const montant = Number(ligne.amount_cfa);
  const devise = String(ligne.currency);
  // On n'attribue jamais une intention qui n'appartient pas à l'étudiant
  // connecté : montant et devise sont revérifiés côté serveur, pas crus.
  if (String(ligne.user_id) !== session.user.id || verification.montant !== montant || verification.devise !== devise)
    return Response.redirect(new URL('/campus/catalogue', url.origin), 303);

  await attribuerApresPaiement(db, {
    provider: 'flutterwave',
    eventId: `charge.completed:${transactionId}`,
    intentionId: reference,
    montant,
    devise,
  });

  return Response.redirect(new URL(`/campus/formation/${encodeURIComponent(formation ?? '')}`, url.origin), 303);
}
