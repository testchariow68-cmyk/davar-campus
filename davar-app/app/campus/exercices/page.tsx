import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { exercicesDeLEtudiant } from '@/lib/server/pedagogie';
import { listTrainingsApercu } from '@/lib/server/campus';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes exercices — Davar Académie Campus' };

/**
 * MES EXERCICES — `vExercises()` du prototype. Un exercice fait pratiquer :
 * il ne bloque jamais rien, et son score ne conditionne aucune progression.
 */
export default async function MesExercicesPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  // Vue test : le propriétaire voit ses vrais exercices, mais rien n'est encore fait.
  const exercices = session.vueTest ? [] : await exercicesDeLEtudiant(session.db, session.user.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes exercices</h1>
          <p>Des travaux corrigés personnellement par votre coach.</p>
        </div>
      </div>

      {exercices.length === 0 ? (
        <div className="empty">
          <Icon nom="edit" taille={30} />
          <div className="mt8" style={{ fontWeight: 700, color: 'var(--muted)' }}>
            Aucun exercice pour l’instant
          </div>
          <div className="xs mt4">
            Les exercices apparaîtront ici dès que votre formation en proposera.
          </div>
        </div>
      ) : (
        exercices.map((exercice) => (
          <div key={exercice.id} className="row card card-pad mb8">
            <div className="wrap">
              <b>{exercice.title}</b>
              <div className="xs muted">
                {exercice.formation} · Chapitre « {exercice.moduleTitre} »
              </div>
            </div>
            {exercice.repondu ? (
              <span className="badge b-green">
                Corrigé{exercice.pct !== null ? ` · ${exercice.pct} %` : ''}
              </span>
            ) : (
              <span className="badge">À faire</span>
            )}
            <Link className="btn btn-sm" href={`/campus/formation/${exercice.formationId}`}>
              {exercice.repondu ? 'Revoir' : 'Commencer'}
            </Link>
          </div>
        ))
      )}
    </>
  );
}
