import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { ChoisirFormationActive } from '@/components/campus/ChoisirFormationActive';
import { currentSession } from '@/lib/server/auth';
import { formationActivePour, listTrainingsApercu, listUserTrainings, progressionFormation } from '@/lib/server/campus';
import { lirePreferences } from '@/lib/server/profil';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes formations — Davar Académie Campus' };

/** MES FORMATIONS — reconstruction fidèle de `vMyTrainings()` du prototype. */
export default async function MesFormationsPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  // Vue test : le contenu réel du propriétaire, sans progression et sans écriture.
  const formations = session.vueTest
    ? await listTrainingsApercu(session.db)
    : await listUserTrainings(session.db, session.user.id);
  const preferences = session.vueTest ? null : await lirePreferences(session.db, session.user.id);
  const activeId = formationActivePour(formations, preferences?.formationActiveId)?.id ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes formations</h1>
          <p>Vos formations acquises, leur progression et les prochains parcours disponibles.</p>
        </div>
        <Link className="btn btn-primary btn-sm" href="/campus/catalogue">
          <Icon nom="search" taille={14} /> Découvrir d’autres formations
        </Link>
      </div>

      {formations.length === 0 ? (
        <div className="banner info">
          <Icon nom="cap" taille={15} />
          <span className="small">
            Votre parcours est en cours de synchronisation. Si vous venez d&apos;acheter, votre formation apparaîtra
            ici dès l&apos;ouverture de votre accès.
          </span>
        </div>
      ) : (
        <div className="grid g2">
          {formations.map((formation) => {
            const { pct: pourcent, terminee } = progressionFormation(formation);
            const estActive = activeId === formation.id;
            return (
              <article key={formation.id} className={`card card-pad formation-choice${estActive ? ' is-active' : ''}`}>
                <Link href={`/campus/formation/${formation.id}`} className="formation-choice-link">
                  <div className="row between" style={{ gap: 8 }}>
                    <h3 style={{ fontSize: 16 }}>{formation.title}</h3>
                    {terminee ? (
                      <span className="badge b-green">terminée</span>
                    ) : pourcent > 0 ? (
                      <span className="badge b-violet">Continuer</span>
                    ) : (
                      <span className="badge b-grey">Commencer</span>
                    )}
                  </div>
                  {formation.description && <p className="muted small mt8">{formation.description}</p>}
                  <div className="pbar mt16">
                    <i style={{ width: `${pourcent}%` }} />
                  </div>
                  <div className="xs faint mt4">
                    {formation.completedCount} sur {formation.lessonCount} leçon
                    {formation.lessonCount > 1 ? 's' : ''}
                    {formation.evaluationCount > 0
                      ? ` · ${formation.evaluationsReussies} sur ${formation.evaluationCount} évaluation${formation.evaluationCount > 1 ? 's' : ''}`
                      : ''}{' '}
                    · {pourcent} %
                  </div>
                </Link>
                {!session.vueTest && <ChoisirFormationActive trainingId={formation.id} active={estActive} />}
              </article>
            );
          })}
        </div>
      )}

    </>
  );
}
