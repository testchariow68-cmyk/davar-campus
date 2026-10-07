import { notFound, redirect } from 'next/navigation';
import { LecteurLivre } from '@/components/campus/LecteurLivre';
import { currentSession } from '@/lib/server/auth';
import { accesRessource, pagesDuLivre, positionLecture } from '@/lib/server/medias';
import { urlLecture } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';

/** LECTURE D'UN LIVRE — la page est mémorisée, comme dans le prototype. */
export default async function LivrePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { id } = await params;

  const acces = await accesRessource(session.db, {
    userId: session.user.id,
    estProprietaire: session.reel.role === 'admin',
    resourceId: id,
  });
  if (!acces.ok) notFound();

  // Une vue test lit sans jamais écrire : sa position n'est ni lue ni enregistrée.
  const [pages, position] = session.vueTest
    ? [await pagesDuLivre(session.db, id), null]
    : await Promise.all([pagesDuLivre(session.db, id), positionLecture(session.db, session.user.id, id)]);

  const pdf = acces.fileKey ? await urlLecture(acces.fileKey, 600) : null;

  return (
    <LecteurLivre
      resourceId={id}
      titre={acces.title ?? 'Livre'}
      pages={pages}
      pageInitiale={position?.position ?? 1}
      pdfUrl={pdf}
    />
  );
}
