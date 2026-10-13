import { redirect } from 'next/navigation';
import { EquipeAvancee } from '@/components/direction/EquipeAvancee';
import { EquipeOutils } from '@/components/direction/EquipeOutils';
import { sessionSection } from '@/lib/server/direction-access';
import { listerEquipe, listerEtudiants, listerFormations } from '@/lib/server/direction';
import { listerInvitations } from '@/lib/server/invitations';
import { transfertEnAttente } from '@/lib/server/transfert';

export const dynamic = 'force-dynamic';

/** L'équipe : qui dirige, qui aide. Le propriétaire reste unique. */
export default async function EquipePage() {
  const session = await sessionSection('equipe');
  if (!session) redirect('/connexion');

  const [equipe, etudiants, formations, invitations, transfert] = await Promise.all([
    listerEquipe(session.db),
    listerEtudiants(session.db, '', 200),
    listerFormations(session.db),
    listerInvitations(session.db),
    transfertEnAttente(session.db),
  ]);

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
      <div className="mt16" />
      <EquipeAvancee
        invitationsInitiales={invitations}
        transfertInitial={transfert}
        formations={formations.map((formation) => ({ id: formation.id, titre: formation.title }))}
        emailProprietaire={session.reel.email}
      />
    </div>
  );
}
