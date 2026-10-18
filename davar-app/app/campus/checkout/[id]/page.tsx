import { notFound, redirect } from 'next/navigation';
import { Commande } from '@/components/campus/Commande';
import { currentSession } from '@/lib/server/auth';
import { lireFormationPubliee } from '@/lib/server/campus';
import { lireProfil } from '@/lib/server/profil';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Commande — Davar Académie Campus' };

/**
 * COMMANDE — l'écran du prototype, dans la coquille du campus.
 * Une formation non publiée n'existe pas : 404.
 */
export default async function CommandePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paiement?: string }>;
}) {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { id } = await params;
  const { paiement } = await searchParams;

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
      retourPaiement={paiement === 'refuse' ? 'refuse' : paiement === 'attente' ? 'attente' : null}
    />
  );
}
