import { redirect } from 'next/navigation';
import { lireJournal } from '@/lib/server/journal';
import { sessionSection } from '@/lib/server/direction-access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activités de l’équipe — Direction' };

const quand = (atMs: number) =>
  new Date(atMs).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * ACTIVITÉS DE L'ÉQUIPE — chaque action de chaque membre, et ce qui compte.
 *
 * Deux règles du prototype sont appliquées ici : les actions lourdes sont
 * marquées « importante », et le manager ne voit PAS celles du Super
 * Administrateur. Le journal ne raconte que des faits acceptés : une action
 * refusée ne s'y écrit jamais.
 */
export default async function ActivitesPage() {
  const session = await sessionSection('activites');
  if (!session) redirect('/connexion');

  // Le propriétaire voit tout ; un manager ne voit pas les gestes du
  // propriétaire — exactement comme dans le prototype.
  const proprietaire = session.user.role === 'admin';
  const lignes = await lireJournal(session.db, { limite: 120, horsProprietaire: !proprietaire });
  const importantes = lignes.filter((ligne) => ligne.niveau === 'importante');

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Activités de l&apos;équipe</h1>
          <p>
            Chaque action de chaque membre{proprietaire ? '' : ' (hors Super Administrateur)'} — les actions importantes
            déclenchent une alerte pour le propriétaire et les managers, dans leur cloche.
          </p>
        </div>
      </div>

      <div className="grid g3 mb16">
        <div className="card card-pad">
          <div className="eyebrow">Actions enregistrées</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{lignes.length}</div>
          <div className="xs muted">Les 120 plus récentes. Rien n&apos;est inventé : une action refusée ne s&apos;écrit pas.</div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Actions importantes</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{importantes.length}</div>
          <div className="xs muted">
            Ouverture ou retrait d&apos;un accès, changement de rôle, purge, export, publication d&apos;une formation…
          </div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Dernière action</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>
            {lignes[0] ? quand(lignes[0].atMs) : '—'}
          </div>
          <div className="xs muted">{lignes[0] ? `${lignes[0].acteur} ${lignes[0].libelle}` : 'Aucune action pour l’instant.'}</div>
        </div>
      </div>

      <div className="card card-pad" style={{ overflowX: 'auto' }}>
        {lignes.length === 0 ? (
          <div className="empty small">
            Aucune activité enregistrée pour l&apos;instant. Les prochaines actions de l&apos;équipe apparaîtront ici.
          </div>
        ) : (
          <table className="dv-tbl">
            <thead>
              <tr>
                <th>Membre</th>
                <th>Action</th>
                <th>Détail</th>
                <th>Niveau</th>
                <th>Date et heure</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <tr key={ligne.id}>
                  <td>
                    <b className="small">{ligne.acteur}</b>
                  </td>
                  <td className="small">{ligne.libelle}</td>
                  <td className="small muted">{ligne.detail ?? '—'}</td>
                  <td>
                    {ligne.niveau === 'importante' ? (
                      <span className="badge b-amber">importante</span>
                    ) : (
                      <span className="badge">routine</span>
                    )}
                  </td>
                  <td className="small muted">{quand(ligne.atMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
