import Link from 'next/link';
import { currentSession } from '@/lib/server/auth';
import { listUserTrainings } from '@/lib/server/campus';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Mon campus — Davar Académie' };
export const dynamic = 'force-dynamic';

/** Espace étudiant : uniquement les formations avec un droit vérifié en base. */
export default async function CampusPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');

  let trainings: Awaited<ReturnType<typeof listUserTrainings>> = [];
  let unavailable = false;
  try {
    trainings = await listUserTrainings(session.db, session.user.id);
  } catch {
    unavailable = true;
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, marginTop: 8 }}>Bonjour {session.user.displayName.split(' ')[0]} 👋</h1>

      {unavailable ? (
        <div className="banner err mt16" role="alert">
          <span>Impossible de lire vos formations pour le moment. Réessayez dans un instant.</span>
        </div>
      ) : trainings.length === 0 ? (
        <section className="card card-pad mt16">
          <h2 style={{ fontSize: 18 }}>Aucune formation active sur ce compte</h2>
          <div className="banner info mt16">
            <span>
              L’accès se rattache au compte après un achat sur notre boutique Chariow : il faut que
              l’adresse e-mail du compte soit confirmée et qu’elle soit la même que celle utilisée
              pour l’achat. Si votre accès n’apparaît pas, écrivez-nous : nous l’ouvrons à la main.
            </span>
          </div>
          <Link href="/" className="btn btn-primary mt16">Voir les formations</Link>
        </section>
      ) : (
        <div className="grid g2 mt16">
          {trainings.map((training) => {
            const percent = training.lessonCount === 0 ? 0 : Math.round((training.completedCount / training.lessonCount) * 100);
            return (
              <article className="card card-pad" key={training.id}>
                <h2 style={{ fontSize: 18 }}>{training.title}</h2>
                {training.description && <p className="muted small">{training.description}</p>}
                <p className="small muted">
                  {training.lessonCount === 0
                    ? 'Contenu en préparation.'
                    : `${training.completedCount} / ${training.lessonCount} leçons terminées`}
                </p>
                <div
                  aria-hidden="true"
                  style={{ height: 8, borderRadius: 99, background: 'var(--violet-soft)', overflow: 'hidden' }}
                >
                  <div style={{ width: `${percent}%`, height: '100%', background: 'var(--grad)' }} />
                </div>
                <Link href={`/campus/formation/${training.id}`} className="btn btn-primary mt16">
                  Ouvrir la formation
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
