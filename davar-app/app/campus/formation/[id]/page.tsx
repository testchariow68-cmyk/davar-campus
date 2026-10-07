import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LessonList } from '@/components/LessonList';
import { currentSession } from '@/lib/server/auth';
import { getTrainingApercu, getTrainingForUser } from '@/lib/server/campus';

export const dynamic = 'force-dynamic';

/** Contenu d'une formation. Un utilisateur sans droit vérifié n'obtient rien (404). */
export default async function FormationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { id } = await params;

  let training: Awaited<ReturnType<typeof getTrainingForUser>> = null;
  try {
    // Vue test : même contenu réel, en lecture seule (aucune progression, aucune écriture).
    training = session.vueTest
      ? await getTrainingApercu(session.db, id)
      : await getTrainingForUser(session.db, session.user.id, id);
  } catch {
    return (
      <div className="banner err" role="alert">
        <span>Lecture impossible pour le moment. Réessayez dans un instant.</span>
      </div>
    );
  }
  if (!training) notFound();

  const percent = training.lessonCount === 0 ? 0 : Math.round((training.completedCount / training.lessonCount) * 100);

  return (
    <div>
      <Link href="/campus" className="small">← Mon campus</Link>
      <h1 style={{ fontSize: 24, marginTop: 6 }}>{training.title}</h1>
      {training.description && <p className="muted">{training.description}</p>}

      {training.lessonCount > 0 && (
        <>
          <p className="small muted mt16">
            Progression : {training.completedCount} / {training.lessonCount} leçons ({percent} %)
          </p>
          <div
            aria-hidden="true"
            style={{ height: 8, borderRadius: 99, background: 'var(--violet-soft)', overflow: 'hidden', marginBottom: 16 }}
          >
            <div style={{ width: `${percent}%`, height: '100%', background: 'var(--grad)' }} />
          </div>
        </>
      )}

      {training.modules.length === 0 && (
        <div className="banner info mt16">
          <span>
            Votre accès à cette formation est bien enregistré. Les modules et leçons seront publiés
            ici au fur et à mesure de leur mise en ligne.
          </span>
        </div>
      )}

      {training.modules.map((module) => (
        <section className="card card-pad mt16" key={module.id}>
          <h2 style={{ fontSize: 17 }}>
            Module {module.position} — {module.title}
          </h2>
          {module.summary && <p className="muted small">{module.summary}</p>}
          <div className="mt16">
            <LessonList lessons={module.lessons} />
          </div>
        </section>
      ))}
    </div>
  );
}
