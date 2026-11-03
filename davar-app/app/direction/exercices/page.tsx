import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { sessionSection } from '@/lib/server/direction-access';
import { exercicesDirection } from '@/lib/server/pedagogie';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Exercices — Direction' };

/**
 * EXERCICES (direction) — `aExercises()` du prototype. Un exercice fait
 * pratiquer : il ne bloque jamais rien, et sa note ne conditionne aucune
 * progression. La colonne « Score moyen » est une lecture, jamais un verdict.
 */
export default async function ExercicesDirectionPage() {
  const session = await sessionSection('exercices');
  if (!session) redirect('/connexion');

  const exercices = await exercicesDirection(session.db);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Exercices</h1>
          <p>
            Les exercices font pratiquer l’étudiant : traités dès qu’ils apparaissent, mais leur
            note ne conditionne jamais la progression.
          </p>
        </div>
      </div>

      {exercices.length === 0 ? (
        <div className="empty">
          <Icon nom="clipboard" taille={30} />
          <div className="mt8" style={{ fontWeight: 700, color: 'var(--muted)' }}>
            Aucun exercice pour l’instant
          </div>
          <div className="xs mt4">
            Les exercices apparaîtront ici dès que vos formations en proposeront.
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Exercice</th>
                <th>Formation</th>
                <th>Questions</th>
                <th>Tentatives</th>
                <th>Score moyen</th>
              </tr>
            </thead>
            <tbody>
              {exercices.map((exercice) => (
                <tr key={exercice.id}>
                  <td>
                    <b>{exercice.title}</b>
                    <div className="xs faint">Choix unique / choix multiple</div>
                  </td>
                  <td className="xs muted">{exercice.formation}</td>
                  <td className="xs muted">{exercice.questions}</td>
                  <td>{exercice.tentatives}</td>
                  <td>
                    {exercice.scoreMoyen === null ? (
                      <span className="xs faint">—</span>
                    ) : (
                      <span className="row" style={{ gap: 8 }}>
                        <span className="pbar" style={{ width: 70 }}>
                          <i style={{ width: `${exercice.scoreMoyen}%` }} />
                        </span>
                        <span className="xs">{exercice.scoreMoyen} %</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
