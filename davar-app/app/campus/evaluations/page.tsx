import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { evaluationsDeLEtudiant } from '@/lib/server/pedagogie';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes évaluations — Davar Académie Campus' };

const STATUTS: Record<string, string> = {
  pending: 'en correction',
  approved: 'validé',
  rejected: 'refusé',
  retry: 'nouvelle tentative demandée',
};

/**
 * MES ÉVALUATIONS — `vQuizzes()` du prototype : l'historique de chaque tentative
 * et la prochaine étape. Une évaluation est bloquante par conception : score
 * minimum ou validation humaine.
 */
export default async function MesEvaluationsPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const evaluations = session.vueTest ? [] : await evaluationsDeLEtudiant(session.db, session.user.id);

  const prochaine = evaluations.find((evaluation) => !evaluation.reussie) ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes évaluations</h1>
          <p>Votre historique, et la prochaine étape pour valider vos acquis.</p>
        </div>
      </div>

      {prochaine && (
        <div className="banner info mb16">
          <Icon nom={prochaine.requiresReview ? 'upload' : 'target'} taille={16} />
          <span>
            <b>Prochaine évaluation :</b> {prochaine.title} — {prochaine.formation}, chapitre{' '}
            {Math.max(1, prochaine.modulePosition)}.{' '}
            {prochaine.requiresReview
              ? 'Travail à soumettre : le chapitre suivant restera verrouillé jusqu’à la validation de votre fichier par un coach.'
              : `Score minimum : ${prochaine.minScore} %.`}
          </span>
          <Link
            className="btn btn-primary btn-sm"
            style={{ marginLeft: 'auto', flex: 'none' }}
            href={`/campus/formation/${prochaine.formationId}`}
          >
            {prochaine.requiresReview ? 'Soumettre mon travail' : 'Commencer'}
          </Link>
        </div>
      )}

      {evaluations.length === 0 ? (
        <div className="empty">
          <Icon nom="clipboard" taille={30} />
          <div className="mt8" style={{ fontWeight: 700, color: 'var(--muted)' }}>
            Aucune évaluation pour l’instant
          </div>
          <div className="xs mt4">
            Les évaluations apparaîtront ici au fil de votre formation.
          </div>
        </div>
      ) : (
        evaluations.map((evaluation) => {
          const meta = evaluation.requiresReview
            ? 'Travail à soumettre · validé par un coach'
            : `Score minimum : ${evaluation.minScore} %`;
          const enCours = evaluation.devoir?.statut === 'pending';
          return (
            <div key={evaluation.id} className="row card card-pad mb8" style={{ alignItems: 'center' }}>
              <div className="wrap">
                <b>{evaluation.title}</b>
                <div className="xs muted">
                  {evaluation.formation} · Chapitre {Math.max(1, evaluation.modulePosition)} —{' '}
                  {evaluation.moduleTitre} · {meta}
                </div>
                {evaluation.historique.length > 0 && (
                  <div className="xs faint mt4">
                    Historique : {evaluation.historique.map((pct) => `${pct} %`).join(' · ')}
                  </div>
                )}
                {evaluation.devoir && (
                  <div className="xs faint mt4">
                    Dernier envoi — {STATUTS[evaluation.devoir.statut] ?? evaluation.devoir.statut}
                    {evaluation.devoir.motif ? ` : ${evaluation.devoir.motif}` : ''}
                  </div>
                )}
              </div>
              {evaluation.reussie ? (
                <span className="badge b-green">Validé ✓</span>
              ) : enCours ? (
                <Link className="btn btn-sm" href={`/campus/formation/${evaluation.formationId}`}>
                  <Icon nom="clock" taille={13} /> En correction
                </Link>
              ) : (
                <Link
                  className="btn btn-sm btn-primary"
                  href={`/campus/formation/${evaluation.formationId}`}
                >
                  <Icon nom={evaluation.requiresReview ? 'upload' : 'play'} taille={13} />{' '}
                  {evaluation.requiresReview ? 'Soumettre mon travail' : 'Passer l’évaluation'}
                </Link>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
