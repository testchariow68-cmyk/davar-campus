import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AssistantPanel } from '@/components/campus/AssistantPanel';
import { ExerciceBloc } from '@/components/campus/ExerciceBloc';
import { Icon } from '@/components/campus/Icon';
import { SupportFab } from '@/components/campus/SupportFab';
import { CoursDetail } from '@/components/campus/CoursDetail';
import { currentSession } from '@/lib/server/auth';
import { getTrainingApercu, getTrainingForUser, progressionFormation } from '@/lib/server/campus';
import { lireConfig, nomAssistant } from '@/lib/server/assistant';
import { pedagogieDeFormation } from '@/lib/server/pedagogie';
import { lireReglages } from '@/lib/server/settings';
import type { Chapitre, Module } from '@/lib/server/campus';

export const dynamic = 'force-dynamic';

/**
 * CONTENU D'UNE FORMATION — trois niveaux, exactement comme le prototype :
 *
 *   1. les CHAPITRES — seul le chapitre en cours paraît ; le suivant n'entre
 *      dans la liste QUE lorsque le précédent est terminé ;
 *   2. les MODULES du chapitre — tous sont listés, mais seul le premier est
 *      ouvrable. Les autres sont grisés et ne s'ouvrent pas ;
 *   3. les COURS du module — les leçons, les exercices, les évaluations.
 *
 * Un module demandé alors qu'il est encore verrouillé ramène au chapitre : on
 * ne contourne pas la règle en tapant une adresse.
 */
export default async function FormationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chapitre?: string; module?: string; cours?: string }>;
}) {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { id } = await params;
  const { chapitre: chapitreDemande, module: moduleDemande, cours: coursDemande } = await searchParams;

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

  const { pct: percent } = progressionFormation(training);
  const [config, reglages, pedagogie] = await Promise.all([
    lireConfig(session.db),
    lireReglages(session.db),
    // Vue test : on montre l'entraînement réel, mais rien ne s'enregistre (l'API le refuse).
    pedagogieDeFormation(session.db, session.user.id, training.id),
  ]);
  const pedagogieParModule = new Map(pedagogie.map((entree) => [entree.moduleId, entree]));
  const nom = nomAssistant(config);
  const apercu = session.vueTest !== null;

  const chapitres = training.chapitres;
  const chapitreOuvert = chapitres.find((chapitre) => chapitre.id === chapitreDemande) ?? null;
  const moduleOuvert =
    chapitreOuvert?.modules.find((module) => module.id === moduleDemande && module.ouvrable) ?? null;

  const base = `/campus/formation/${training.id}`;

  /* ---- Niveau 3 : le module OUVRÉ révèle son contenu, comme au prototype ----
   * Toucher un module n'ouvre pas une liste : on tombe directement sur le cours,
   * sa vidéo principale, ses vidéos complémentaires et ses ressources. S'il
   * reste plusieurs cours dans le module, un simple rang les relie entre eux. */
  const lecons = moduleOuvert?.lessons ?? [];
  const coursOuvert =
    lecons.find((lecon) => lecon.id === coursDemande) ??
    lecons.find((lecon) => !lecon.completed) ??
    lecons[0] ??
    null;

  if (chapitreOuvert && moduleOuvert) {
    const hrefModule = `${base}?chapitre=${encodeURIComponent(chapitreOuvert.id)}&module=${encodeURIComponent(moduleOuvert.id)}`;
    const hrefCours = (id: string) => `${hrefModule}&cours=${encodeURIComponent(id)}`;

    // Le cours suivant : d'abord dans le module, puis le premier cours du module
    // suivant si celui-ci est achevé et que le suivant est ouvert.
    let suivant: { titre: string; href: string } | null = null;
    if (coursOuvert) {
      const index = lecons.findIndex((lecon) => lecon.id === coursOuvert.id);
      const leconSuivante = lecons[index + 1];
      if (leconSuivante) suivant = { titre: leconSuivante.title, href: hrefCours(leconSuivante.id) };
      else if (moduleOuvert.termine) {
        const rangModule = chapitreOuvert.modules.findIndex((m) => m.id === moduleOuvert.id);
        const moduleSuivant = chapitreOuvert.modules[rangModule + 1];
        if (moduleSuivant?.ouvrable && moduleSuivant.lessons[0])
          suivant = { titre: moduleSuivant.title, href: hrefCours(moduleSuivant.lessons[0].id) };
      }
    }
    // Le chapitre suivant n'est proposé que lorsqu'il est réellement débloqué.
    const rangActuel = chapitres.findIndex((c) => c.id === chapitreOuvert.id);
    const apres = chapitres[rangActuel + 1];
    const chapitreSuivant =
      chapitreOuvert.termine && apres?.visible
        ? { titre: apres.title, href: `${base}?chapitre=${encodeURIComponent(apres.id)}` }
        : null;

    return (
      <div>
        <Link href={`${base}?chapitre=${encodeURIComponent(chapitreOuvert.id)}`} className="small">
          ← {chapitreOuvert.title}
        </Link>
        <h1 style={{ fontSize: 24, marginTop: 6 }}>{moduleOuvert.title}</h1>
        {moduleOuvert.summary && <p className="muted">{moduleOuvert.summary}</p>}

        {coursOuvert ? (
          <>
            {lecons.length > 1 && (
              <div className="row mt16" style={{ gap: 8, flexWrap: 'wrap' }}>
                {lecons.map((lecon) => (
                  <Link
                    key={lecon.id}
                    href={hrefCours(lecon.id)}
                    className={lecon.id === coursOuvert.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                    title={lecon.title}
                  >
                    {lecon.completed ? '✓ ' : ''}
                    {lecon.title}
                  </Link>
                ))}
              </div>
            )}
            <div className="mt16">
              <CoursDetail
                lesson={coursOuvert}
                chapitreTitre={chapitreOuvert.title}
                rangChapitre={chapitreOuvert.position}
                suivant={suivant}
                chapitreSuivant={chapitreSuivant}
                retourHref={`${base}?chapitre=${encodeURIComponent(chapitreOuvert.id)}`}
              />
            </div>
          </>
        ) : (
          <div className="banner info mt16">
            <span>Ce module n&apos;a pas encore de cours. Ils seront publiés ici.</span>
          </div>
        )}

        {(() => {
          const entrainement = pedagogieParModule.get(moduleOuvert.id);
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
            moduleId={moduleOuvert.id}
            moduleTitre={moduleOuvert.title}
            messagesIA={[]}
            messagesCoach={[]}
            apercu={apercu}
          />
        </div>

        <SupportFab
          whatsapp={reglages['support.whatsapp']}
          telephone={reglages['support.phone']}
          courriel={reglages['support.email']}
        />
      </div>
    );
  }

  /* ---- Niveau 2 : les modules d'un chapitre ---- */
  if (chapitreOuvert) {
    return (
      <div>
        <Link href={base} className="small">
          ← {training.title}
        </Link>
        <h1 style={{ fontSize: 24, marginTop: 6 }}>{chapitreOuvert.title}</h1>
        {chapitreOuvert.summary && <p className="muted">{chapitreOuvert.summary}</p>}
        <p className="small muted mt16">
          {chapitreOuvert.modules.filter((module) => module.termine).length} / {chapitreOuvert.modules.length} modules
          terminés
          {chapitreOuvert.termine ? ' · chapitre terminé ✓' : ''}
        </p>

        {chapitreOuvert.modules.length === 0 && (
          <div className="banner info mt16">
            <span>Ce chapitre n&apos;a pas encore de modules. Ils seront publiés ici.</span>
          </div>
        )}

        {chapitreOuvert.modules.map((module) =>
          module.ouvrable ? (
            <Link
              key={module.id}
              href={`${base}?chapitre=${encodeURIComponent(chapitreOuvert.id)}&module=${encodeURIComponent(module.id)}`}
              className="card card-pad mt16 row between"
              style={{ textDecoration: 'none', color: 'inherit', alignItems: 'center', gap: 12 }}
            >
              <span className="row" style={{ gap: 10, alignItems: 'center' }}>
                <span className={`step-ico ${module.termine ? 's-done' : 's-cur'}`}>
                  <Icon nom={module.termine ? 'check' : 'play'} taille={13} />
                </span>
                <span>
                  <span style={{ fontWeight: 600 }}>{module.title}</span>
                  <span className="small muted" style={{ display: 'block' }}>
                    Module {module.position} · {module.lessons.length} cours
                    {module.termine ? ' · terminé ✓' : ' · à suivre maintenant'}
                  </span>
                </span>
              </span>
              <Icon nom="chevR" taille={14} />
            </Link>
          ) : (
            <div
              key={module.id}
              className="card card-pad mt16 row between"
              aria-disabled="true"
              title="Terminez le module précédent pour ouvrir celui-ci"
              style={{ alignItems: 'center', gap: 12, opacity: 0.4, filter: 'grayscale(1)', cursor: 'not-allowed' }}
            >
              <span className="row" style={{ gap: 10, alignItems: 'center' }}>
                <span className="step-ico s-lock">
                  <Icon nom="lock" taille={13} />
                </span>
                <span>
                  <span style={{ fontWeight: 600 }}>{module.title}</span>
                  <span className="small muted" style={{ display: 'block' }}>
                    Module {module.position} · verrouillé
                  </span>
                </span>
              </span>
              <Icon nom="lock" taille={13} />
            </div>
          )
        )}

        <SupportFab
          whatsapp={reglages['support.whatsapp']}
          telephone={reglages['support.phone']}
          courriel={reglages['support.email']}
        />
      </div>
    );
  }

  /* ---- Niveau 1 : les chapitres ---- */
  const visibles = chapitres.filter((chapitre) => chapitre.visible);
  return (
    <div>
      <Link href="/campus/formations" className="small">
        ← Mes formations
      </Link>
      <h1 style={{ fontSize: 24, marginTop: 6 }}>{training.title}</h1>
      {training.description && <p className="muted">{training.description}</p>}

      {training.lessonCount > 0 && (
        <>
          <p className="small muted mt16">
            Progression : {training.completedCount} / {training.lessonCount} cours
            {training.evaluationCount > 0
              ? ` · ${training.evaluationsReussies} / ${training.evaluationCount} évaluations`
              : ''}{' '}
            ({percent} %)
          </p>
          <div className="pbar" style={{ height: 8 }}>
            <i style={{ width: `${percent}%` }} />
          </div>
        </>
      )}

      {visibles.length === 0 && (
        <div className="banner info mt16">
          <span>
            Votre accès à cette formation est bien enregistré. Les chapitres seront publiés ici au fur et à mesure de
            leur mise en ligne.
          </span>
        </div>
      )}

      {visibles.map((chapitre) => (
        <Link
          key={chapitre.id}
          href={`${base}?chapitre=${encodeURIComponent(chapitre.id)}`}
          className="card card-pad mt16 row between"
          style={{ textDecoration: 'none', color: 'inherit', alignItems: 'center', gap: 12 }}
        >
          <span className="row" style={{ gap: 10, alignItems: 'center' }}>
            <span className={`step-ico ${chapitre.termine ? 's-done' : 's-cur'}`}>
              <Icon nom={chapitre.termine ? 'check' : 'layers'} taille={14} />
            </span>
            <span>
              <span style={{ fontWeight: 600 }}>{chapitre.title}</span>
              <span className="small muted" style={{ display: 'block' }}>
                {chapitre.modules.length} module{chapitre.modules.length > 1 ? 's' : ''} ·{' '}
                {chapitre.modules.filter((module) => module.termine).length} terminé
                {chapitre.modules.filter((module) => module.termine).length > 1 ? 's' : ''}
                {chapitre.termine ? ' · chapitre terminé ✓' : ' · à suivre'}
              </span>
            </span>
          </span>
          <Icon nom="chevR" taille={14} />
        </Link>
      ))}

      <SupportFab
        whatsapp={reglages['support.whatsapp']}
        telephone={reglages['support.phone']}
        courriel={reglages['support.email']}
      />
    </div>
  );
}

/** Exported for type reuse in the admin preview if needed. */
export type { Chapitre, Module };
