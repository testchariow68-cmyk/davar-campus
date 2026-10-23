import { redirect } from 'next/navigation';
import { analyseBadges } from '@/lib/server/analytique';
import { sessionSection } from '@/lib/server/direction-access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Badges & distinctions — Direction' };

const quand = (atMs: number) =>
  new Date(atMs).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * BADGES & DISTINCTIONS — qui a reçu quel badge, quel jour.
 *
 * Les comptes de test sont exclus des chiffres : ce sont des vues, pas des
 * personnes. Le mode d'attribution est dit tel quel — automatique par une règle
 * du parcours, ou à la main par un membre de l'équipe.
 */
export default async function BadgesPage() {
  const session = await sessionSection('badges');
  if (!session) redirect('/connexion');

  const analyse = await analyseBadges(session.db);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Badges &amp; distinctions</h1>
          <p>
            Qui a reçu quel badge, quel jour — fréquence d&apos;attribution sur 30 jours : {analyse.trenteJours}.
          </p>
        </div>
      </div>

      <div className="card card-pad mb16" style={{ overflowX: 'auto' }}>
        <h3 className="mb8">Attributions</h3>
        {analyse.lignes.length === 0 ? (
          <div className="empty small">Aucun badge attribué pour l&apos;instant.</div>
        ) : (
          <table className="dv-tbl">
            <thead>
              <tr>
                <th>Étudiant</th>
                <th>Badge</th>
                <th>Formation</th>
                <th>Date et heure</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {analyse.lignes.map((ligne) => (
                <tr key={ligne.id}>
                  <td>
                    <b className="small">{ligne.etudiant}</b>
                  </td>
                  <td className="small">{ligne.badge}</td>
                  <td className="small muted">{ligne.formation ?? '—'}</td>
                  <td className="small muted">{quand(ligne.atMs)}</td>
                  <td className="small">
                    {ligne.source === 'manuel'
                      ? `À la main${ligne.attribuePar ? ` — ${ligne.attribuePar}` : ''}`
                      : 'Automatique'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="xs faint mt8">
          {analyse.total} attribution(s) en tout · {analyse.catalogue} badge(s) au catalogue.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="mb8">Ce que personne n&apos;a encore reçu</h3>
        {analyse.catalogue === 0 ? (
          <p className="small muted">
            Le catalogue se remplit tout seul à la création des formations : chaque parcours reçoit ses badges.
          </p>
        ) : analyse.jamaisAttribues.length === 0 ? (
          <p className="small muted">Tous les badges du catalogue ont été attribués au moins une fois.</p>
        ) : (
          <>
            <p className="small muted mb8">
              Ces badges existent mais n&apos;ont encore été reçus par personne. Un badge qui ne se déclenche jamais
              signale souvent une règle du parcours jamais atteinte.
            </p>
            <div className="dv-list">
              {analyse.jamaisAttribues.map((badge) => (
                <div key={badge.id} className="dv-item row between">
                  <span className="small">{badge.nom}</span>
                  <span className="small muted">{badge.formation ?? 'Toutes les formations'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
