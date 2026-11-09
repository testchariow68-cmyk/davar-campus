import { redirect } from 'next/navigation';
import { EtudiantsOutils } from '@/components/direction/EtudiantsOutils';
import { sessionSection } from '@/lib/server/direction-access';
import { listerEtudiants, listerFormations } from '@/lib/server/direction';

export const dynamic = 'force-dynamic';

/** Les étudiants : qui ils sont, ce qu'ils ont, et les gestes que la direction peut faire. */
export default async function EtudiantsPage() {
  const session = await sessionSection('etudiants');
  if (!session) redirect('/connexion');

  const [etudiants, formations] = await Promise.all([
    listerEtudiants(session.db),
    listerFormations(session.db),
  ]);

  return (
    <div>
      <h1 className="mb8">Étudiants</h1>
      <p className="small muted mb16">
        Un accès ne s&apos;ouvre qu&apos;à une adresse <strong>confirmée</strong> et sur un compte actif : ouvrir un accès à
        une adresse non confirmée donnerait une promesse que la connexion ne pourrait pas tenir.
      </p>
      <EtudiantsOutils
        etudiants={etudiants}
        formations={formations.map((formation) => ({ id: formation.id, title: formation.title }))}
      />
    </div>
  );
}
