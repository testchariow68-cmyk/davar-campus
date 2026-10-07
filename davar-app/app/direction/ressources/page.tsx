import { redirect } from 'next/navigation';
import { RessourcesAdmin } from '@/components/direction/RessourcesAdmin';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { toutesRessources } from '@/lib/server/ressources';
import { contenanceRessources } from '@/lib/server/medias';
import { listerFormations } from '@/lib/server/direction';
import { libellePlafond, stockagePret } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ressources — Direction' };

/** RESSOURCES — livres, audios et documents : création, pages, pistes, dépôt, attribution. */
export default async function RessourcesDirectionPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');

  const [ressources, formations] = await Promise.all([
    toutesRessources(proprietaire.db),
    listerFormations(proprietaire.db),
  ]);
  const contenance = await contenanceRessources(
    proprietaire.db,
    ressources.map((ressource) => ressource.id)
  );

  const attributions = await proprietaire.db.execute({
    sql: `SELECT ra.resource_id, u.email_normalized
          FROM resource_allocations ra JOIN users u ON u.id = ra.user_id
          ORDER BY ra.at_ms`,
  });
  const parRessource = new Map<string, string[]>();
  for (const row of attributions.rows) {
    const id = typeof row.resource_id === 'string' ? row.resource_id : '';
    const courriel = typeof row.email_normalized === 'string' ? row.email_normalized : '';
    if (!id || !courriel) continue;
    parRessource.set(id, [...(parRessource.get(id) ?? []), courriel]);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Ressources</h1>
          <p>
            Vos livres, vos audios et vos documents. Une ressource créée sans attribution est <b>offerte à tous</b> les
            étudiants de la formation ; une ressource attribuée nommément n’est visible que de la personne concernée.
          </p>
        </div>
      </div>

      <RessourcesAdmin
        initiales={ressources.map((ressource) => ({
          id: ressource.id,
          kind: ressource.kind,
          title: ressource.title,
          description: ressource.description,
          formationTitre: ressource.formationTitre,
          fileKey: ressource.fileKey,
          pages: contenance[ressource.id]?.pages ?? 0,
          pistes: contenance[ressource.id]?.pistes ?? 0,
          attribueeA: parRessource.get(ressource.id) ?? [],
          publiee: ressource.publiee,
        }))}
        formations={formations.map((formation) => ({ id: formation.id, titre: formation.title }))}
        plafonds={{ document: libellePlafond('document'), audio: libellePlafond('audio'), video: libellePlafond('video') }}
        stockagePret={stockagePret()}
      />
    </>
  );
}
