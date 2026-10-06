import { redirect } from 'next/navigation';
import { EquipeOutils } from '@/components/direction/EquipeOutils';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { listerEquipe, listerEtudiants } from '@/lib/server/direction';

export const dynamic = 'force-dynamic';

/** L'équipe : qui dirige, qui aide. Le propriétaire reste unique. */
export default async function EquipePage() {
  const session = await sessionProprietaire();
  if (!session) redirect('/connexion');

  const [equipe, etudiants] = await Promise.all([listerEquipe(session.db), listerEtudiants(session.db, '', 200)]);

  return (
    <div>
      <h1 className="mb8">Équipe</h1>
      <p className="small muted mb16">
        Un membre du staff peut consulter la plateforme ; seul le propriétaire peut la modifier. Rétrograder le dernier
        propriétaire est refusé : la plateforme n&apos;aurait plus personne pour la diriger.
      </p>
      <EquipeOutils
        equipe={equipe}
        suggestions={etudiants.slice(0, 50).map((etudiant) => ({ email: etudiant.email, nom: etudiant.nom }))}
      />
    </div>
  );
}
