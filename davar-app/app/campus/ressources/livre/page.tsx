import { redirect } from 'next/navigation';
import { ListeRessources } from '@/components/campus/ListeRessources';
import { currentSession } from '@/lib/server/auth';
import { ressourcesDeEtudiant } from '@/lib/server/ressources';
import { contenanceRessources, positionsDeLEtudiant } from '@/lib/server/medias';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes livres — Davar Académie Campus' };

/** MES LIVRES — une ligne de menu du prototype, donc un écran. */
export default async function MesLivresPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const ressources = await ressourcesDeEtudiant(session.db, session.user.id);
  const [contenance, positions] = await Promise.all([
    contenanceRessources(
      session.db,
      ressources.map((ressource) => ressource.id)
    ),
    session.vueTest ? Promise.resolve({} as Record<string, number>) : positionsDeLEtudiant(session.db, session.user.id),
  ]);

  return (
    <ListeRessources
      titre="Mes livres"
      sousTitre="Vos livres — ceux offerts à tous, et ceux qui vous ont été attribués."
      famille="book"
      icone="book"
      ressources={ressources as never}
      contenance={contenance}
      positions={positions}
      retour="/campus/ressources/livre"
    />
  );
}
