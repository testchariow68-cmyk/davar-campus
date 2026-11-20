import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { listTrainingsApercu, listUserTrainings, progressionFormation } from '@/lib/server/campus';

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
            return (
              <Link key={formation.id} href={`/campus/formation/${formation.id}`} className="card card-pad">
                <div className="row between" style={{ gap: 8 }}>
                  <h3 style={{ fontSize: 16 }}>{formation.title}</h3>
                  {terminee ? (
                    <span className="badge b-green">terminée</span>
                  ) : pourcent > 0 ? (
                    <span className="badge b-violet">en cours</span>
                  ) : (
                    <span className="badge b-grey">à commencer</span>
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
            );
          })}
        </div>
      )}

    </>
  );
}
