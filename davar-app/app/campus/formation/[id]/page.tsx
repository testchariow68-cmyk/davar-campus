import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AssistantPanel } from '@/components/campus/AssistantPanel';
import { ExerciceBloc } from '@/components/campus/ExerciceBloc';
import { Icon } from '@/components/campus/Icon';
import { SupportFab } from '@/components/campus/SupportFab';
import { LessonList } from '@/components/LessonList';
import { currentSession } from '@/lib/server/auth';
import { getTrainingApercu, getTrainingForUser } from '@/lib/server/campus';
import { lireConfig, nomAssistant } from '@/lib/server/assistant';
import { pedagogieDeFormation } from '@/lib/server/pedagogie';
import { lireReglages } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/**
 * CONTENU D'UNE FORMATION — progression, modules, leçons, et l'assistant.
 * Un utilisateur sans droit vérifié n'obtient rien (404).
 */
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
  const [config, reglages, pedagogie] = await Promise.all([
    lireConfig(session.db),
    lireReglages(session.db),
    // Vue test : on montre l'entraînement réel, mais rien ne s'enregistre (l'API le refuse).
    pedagogieDeFormation(session.db, session.user.id, training.id),
  ]);
  const pedagogieParModule = new Map(pedagogie.map((entree) => [entree.moduleId, entree]));
  const nom = nomAssistant(config);
  const apercu = session.vueTest !== null;

  return (
    <div>
      <Link href="/campus" className="small">
        ← Mon campus
      </Link>
      <h1 style={{ fontSize: 24, marginTop: 6 }}>{training.title}</h1>
      {training.description && <p className="muted">{training.description}</p>}

      {training.lessonCount > 0 && (
        <>
          <p className="small muted mt16">
            Progression : {training.completedCount} / {training.lessonCount} leçons ({percent} %)
          </p>
          <div className="pbar" style={{ height: 8 }}>
            <i style={{ width: `${percent}%` }} />
          </div>
        </>
      )}

      {training.modules.length === 0 && (
        <div className="banner info mt16">
          <span>
            Votre accès à cette formation est bien enregistré. Les modules et leçons seront publiés ici
            au fur et à mesure de leur mise en ligne.
          </span>
        </div>
      )}

      {training.modules.map((module) => (
        <section className="card card-pad mt16" key={module.id}>
          <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 17 }}>
                Module {module.position} — {module.title}
              </h2>
              {module.summary && <p className="muted small">{module.summary}</p>}
            </div>
            <span className="badge b-grey">
              <Icon nom="layers" taille={12} /> {module.lessons.length} leçon{module.lessons.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="mt16">
            <LessonList lessons={module.lessons} />
          </div>

          {(() => {
            const entrainement = pedagogieParModule.get(module.id);
            if (!entrainement) return null;
            return (
              <>
                {entrainement.exercices.map((entree) => (
                  <ExerciceBloc
                    key={entree.exercice.id}
                    exercice={{
                      ...entree.exercice,
                      questions: entree.exercice.questions.map((question) => ({ ...question, explication: question.explain })),
                    }}
                    evaluation={null}
                  />
                ))}
                {entrainement.evaluations.map((entree) => (
                  <ExerciceBloc
                    key={entree.evaluation.id}
                    exercice={null}
                    evaluation={{
                      ...entree.evaluation,
                      questions: entree.evaluation.questions.map((question) => ({ ...question, explication: question.explain })),
                    }}
                  />
                ))}
              </>
            );
          })()}

          <div className="col mt16" style={{ gap: 6, alignItems: 'center' }}>
            <AssistantPanel
              nom={nom}
              hue={config.hue}
              formationId={training.id}
              formationTitre={training.title}
              moduleId={module.id}
              moduleTitre={module.title}
              messagesIA={[]}
              messagesCoach={[]}
              apercu={apercu}
            />
          </div>
        </section>
      ))}

      <SupportFab
        whatsapp={reglages['support.whatsapp']}
        telephone={reglages['support.phone']}
        courriel={reglages['support.email']}
      />
    </div>
  );
}
