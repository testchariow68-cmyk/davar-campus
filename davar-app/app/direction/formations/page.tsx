import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormationCreator } from '@/components/direction/FormationCreator';
import { sessionSection } from '@/lib/server/direction-access';
import { listerFormations } from '@/lib/server/direction';

export const dynamic = 'force-dynamic';

const prix = (valeur: number) => `${valeur.toLocaleString('fr-FR')} FCFA`;

/** Le catalogue, vu de la direction : ce qui est ouvert, ce qui est en chantier. */
export default async function FormationsPage() {
  const session = await sessionSection('formations');
  if (!session) redirect('/connexion');
  const formations = await listerFormations(session.db);

  return (
    <div>
      <div className="row between mb16" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="mb8">Formations</h1>
          <p className="small muted">
            Une formation sans leçon ne peut pas être ouverte : le bouton refuse, avec le compte exact.
          </p>
        </div>
        <FormationCreator />
      </div>

      {formations.length === 0 ? (
        <div className="banner info">
          <span>
            Aucune formation. Créez la première : elle naîtra fermée, vous l&apos;ouvrirez quand ses leçons existeront.
          </span>
        </div>
      ) : (
        <div className="dv-list">
          {formations.map((formation) => (
            <div key={formation.id} className="dv-item">
              <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <strong>{formation.title}</strong>
                    <span className={`dv-tag ${formation.published ? 'open' : 'closed'}`}>
                      {formation.published ? 'ouverte' : 'fermée'}
                    </span>
                    {formation.chariowProductId ? (
                      <span className="dv-tag">Chariow relié</span>
                    ) : (
                      <span className="dv-tag closed">aucun lien d&apos;achat</span>
                    )}
                  </div>
                  <div className="small muted mt4">
                    {prix(formation.priceCfa)} · {formation.modules} module{formation.modules > 1 ? 's' : ''} ·{' '}
                    {formation.lecons} leçon{formation.lecons > 1 ? 's' : ''} · {formation.inscrits} étudiant
                    {formation.inscrits > 1 ? 's' : ''} · {formation.acheteurs} achat{formation.acheteurs > 1 ? 's' : ''}
                  </div>
                </div>
                <Link href={`/direction/formations/${formation.id}`} className="btn btn-primary">
                  Construire
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
