import { redirect } from 'next/navigation';
import { RessourcesCampus, type RessourceCampus } from '@/components/campus/RessourcesCampus';
import { currentSession } from '@/lib/server/auth';
import { contenanceRessources, positionsDeLEtudiant } from '@/lib/server/medias';
import { ressourcesDeEtudiant } from '@/lib/server/ressources';
import { urlLecture } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ma bibliothèque — Davar Académie Campus' };

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
  const couvertures: Record<string, string | null> = {};

  // Les couvertures gardent la même règle que les lecteurs : seule une adresse
  // signée, courte et générée côté serveur quitte le serveur. Les fichiers eux-
  // mêmes passent par /api/campus/ressource/[id], qui contrôle puis redirige.
  await Promise.all(
    ressources.map(async (ressource) => {
      if (ressource.coverKey) couvertures[ressource.id] = await urlLecture(ressource.coverKey, 600);
    })
  );

  const ressourcesAffichees: RessourceCampus[] = ressources.map(({ coverKey: _coverKey, fileKey, ...ressource }) => ({
    ...ressource,
    positionLecture: positions[ressource.id] ?? ressource.positionLecture,
    fileDisponible: Boolean(fileKey),
  }));

  return (
    <RessourcesCampus
      ressources={ressourcesAffichees}
      contenance={contenance}
      categorie={categorie}
      couvertures={couvertures}
    />
  );
}
