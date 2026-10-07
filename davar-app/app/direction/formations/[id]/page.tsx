import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FormationInfos } from '@/components/direction/FormationInfos';
import { StructureEditeur } from '@/components/direction/StructureEditeur';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { lireStructure, lireUneFormation } from '@/lib/server/direction';

export const dynamic = 'force-dynamic';

/** Éditeur d'une formation : ses informations, puis sa structure (modules et leçons). */
export default async function FormationDirectionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await sessionProprietaire();
  if (!session) redirect('/connexion');
  const { id } = await params;

  const formation = await lireUneFormation(session.db, id);
  if (!formation) notFound();
  const modules = await lireStructure(session.db, id);

  return (
    <div>
      <div className="row between mb16" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Link href="/direction/formations" className="small muted">
            ← Toutes les formations
          </Link>
          <h1 className="mt4">{formation.title}</h1>
        </div>
      </div>

      <div className="grid g2 mb24" style={{ gap: 16, alignItems: 'start' }}>
        <FormationInfos formation={formation} />
        <div>
          <div className="card card-pad mb16">
            <h3 className="mb8">État du contenu</h3>
            <div className="small muted" style={{ lineHeight: 1.9 }}>
              {modules.length} module{modules.length > 1 ? 's' : ''} ·{' '}
              {modules.reduce((total, module) => total + module.lecons.length, 0)} leçon
              {modules.reduce((total, module) => total + module.lecons.length, 0) > 1 ? 's' : ''} ·{' '}
              {formation.inscrits} étudiant{formation.inscrits > 1 ? 's' : ''} avec accès
            </div>
            {formation.published && (
              <p className="small muted mt8">
                Cette formation est ouverte : les étudiants qui ont un accès voient immédiatement chaque leçon que vous
                ajoutez. Enrichir ne réinitialise jamais une progression.
              </p>
            )}
          </div>
        </div>
      </div>

      <h2 className="mb16">Structure de la formation</h2>
      <StructureEditeur formationId={formation.id} modules={modules} />
    </div>
  );
}
