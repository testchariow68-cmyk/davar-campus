import { notFound, redirect } from 'next/navigation';
import { Commande } from '@/components/campus/Commande';
import { currentSession } from '@/lib/server/auth';
import { lireFormationPubliee } from '@/lib/server/campus';
import { attribuerApresPaiement, verifierTransactionFlutterwave } from '@/lib/server/paiement';
import { lireProfil } from '@/lib/server/profil';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Commande — Davar Académie Campus' };

/**
 * COMMANDE — l'écran du prototype, dans la coquille du campus.
 * Une formation non publiée n'existe pas : 404.
 *
 * C'est aussi l'adresse sur laquelle le fournisseur ramène l'étudiant après le
 * paiement : la vérification se fait donc ici, côté serveur. Ce que rapporte un
 * navigateur ne prouve rien — quelqu'un peut fabriquer la même adresse —, alors
 * on rappelle le fournisseur et on n'attribue la formation qu'ensuite.
 */
export default async function CommandePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; tx_ref?: string; transaction_id?: string }>;
}) {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { id } = await params;
  const retour = await searchParams;

  const transactionId = (retour.transaction_id ?? '').trim();
  const reference = (retour.tx_ref ?? '').trim();

  let etapeInitiale: 1 | 2 | 3 = 1;
  let echec: 'refuse' | 'attente' | null = null;

  if (transactionId && reference) {
    if (retour.status !== 'successful') {
      echec = 'refuse';
    } else {
      const verification = await verifierTransactionFlutterwave(session.db, transactionId);
      const intention = await session.db.execute({
        sql: 'SELECT user_id, amount_cfa, currency FROM payment_intents WHERE id = ?',
        args: [reference],
      });
      const ligne = intention.rows[0];
      const montantAttendu = Number(ligne?.amount_cfa);
      const deviseAttendue = ligne ? String(ligne.currency) : null;
      if (
        verification.ok &&
        ligne &&
        verification.reference === reference &&
        String(ligne.user_id) === session.user.id &&
        verification.montant === montantAttendu &&
        verification.devise === deviseAttendue
      ) {
        await attribuerApresPaiement(session.db, {
          provider: 'flutterwave',
          eventId: `charge.completed:${transactionId}`,
          intentionId: reference,
          montant: montantAttendu,
          devise: deviseAttendue ?? 'XOF',
        });
        etapeInitiale = 3;
      } else {
        echec = 'attente';
      }
    }
  }

  const formation = await lireFormationPubliee(session.db, id);
  if (!formation) notFound();

  const profil = await lireProfil(session.db, session.user.id);
  const possedee = session.vueTest
    ? false
    : (
        await session.db.execute({
          sql: 'SELECT 1 FROM enrollments WHERE user_id = ? AND training_id = ? LIMIT 1',
          args: [session.user.id, id],
        })
      ).rows.length > 0;

  return (
    <Commande
      formation={{ id: formation.id, title: formation.title, prixCfa: formation.prixCfa }}
      nom={session.user.displayName}
      email={session.user.email}
      telephoneInitial={profil?.telephone ?? ''}
      dejaAcquise={possedee}
      etapeInitiale={etapeInitiale}
      retourPaiement={echec}
    />
  );
}
