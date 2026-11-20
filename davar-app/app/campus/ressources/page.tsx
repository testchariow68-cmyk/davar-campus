import { redirect } from 'next/navigation';
import { RessourcesCampus } from '@/components/campus/RessourcesCampus';
import { currentSession } from '@/lib/server/auth';
import { contenanceRessources, positionsDeLEtudiant } from '@/lib/server/medias';
import { ressourcesDeEtudiant } from '@/lib/server/ressources';
import { urlLecture } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes ressources — Davar Académie Campus' };

type Categorie = 'all' | 'book' | 'audio' | 'file';

function categorieValide(value: string | undefined): Categorie {
  return value === 'book' || value === 'audio' || value === 'file' ? value : 'all';
}

/**
 * BIBLIOTHÈQUE GLOBALE — le point d'entrée de « Ouvrir le lecteur ».
 * Les raccourcis Mes livres et Mes audios restent disponibles dans le menu,
 * mais cette page permet de choisir une catégorie sans imposer un lecteur.
 */
export default async function RessourcesPage({
  searchParams,
}: {
  searchParams?: Promise<{ categorie?: string }>;
}) {
  const session = await currentSession();
  if (!session) redirect('/connexion');

  const ressources = await ressourcesDeEtudiant(session.db, session.user.id);
  const [contenance, positions] = await Promise.all([
    contenanceRessources(session.db, ressources.map((ressource) => ressource.id)),
    session.vueTest ? Promise.resolve({} as Record<string, number>) : positionsDeLEtudiant(session.db, session.user.id),
  ]);
  const params = (await searchParams) ?? {};
  const categorie = categorieValide(params.categorie);
  const fichiers: Record<string, string | null> = {};
  const couvertures: Record<string, string | null> = {};

  // Les documents et couvertures gardent la même règle que les lecteurs :
  // seule une adresse signée, courte et générée après contrôle d'accès, quitte
  // le serveur. Les livres utilisent leur propre lecteur pour leur contenu.
  await Promise.all(
    ressources.map(async (ressource) => {
      if (ressource.kind === 'file' && ressource.fileKey) {
        fichiers[ressource.id] = await urlLecture(ressource.fileKey, 600);
      }
      if (ressource.coverKey) {
        couvertures[ressource.id] = await urlLecture(ressource.coverKey, 600);
      }
    })
  );

  return (
    <RessourcesCampus
      ressources={ressources.map((ressource) => ({ ...ressource, positionLecture: positions[ressource.id] ?? ressource.positionLecture }))}
      contenance={contenance}
      categorie={categorie}
      fichiers={fichiers}
      couvertures={couvertures}
    />
  );
}
