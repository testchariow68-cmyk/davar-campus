import { notFound, redirect } from 'next/navigation';
import { LecteurAudio } from '@/components/campus/LecteurAudio';
import { currentSession } from '@/lib/server/auth';
import { accesRessource, pistesDeLAudio, positionLecture } from '@/lib/server/medias';

export const dynamic = 'force-dynamic';

/** ÉCOUTE D'UN AUDIO — reprise automatique là où l'étudiant s'était arrêté. */
export default async function AudioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { id } = await params;

  const acces = await accesRessource(session.db, {
    userId: session.user.id,
    estProprietaire: session.reel.role === 'admin',
    resourceId: id,
  });
  if (!acces.ok) notFound();

  const pistes = await pistesDeLAudio(session.db, id);
  const position = session.vueTest ? null : await positionLecture(session.db, session.user.id, id);

  return (
    <LecteurAudio
      resourceId={id}
      titre={acces.title ?? 'Audio'}
      pistes={pistes.map((piste) => ({
        id: piste.id,
        position: piste.position,
        title: piste.title,
        durationSec: piste.durationSec,
        deposee: Boolean(piste.fileKey),
      }))}
      positionInitiale={position?.position ?? 0}
    />
  );
}
