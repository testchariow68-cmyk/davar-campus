import { currentSession } from '@/lib/server/auth';
import { jsonNoStore } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { stockagePret, urlLecture } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';

/**
 * OUVERTURE D'UNE RESSOURCE — le droit est vérifié ICI, côté serveur, avant tout
 * envoi de fichier. Être connecté ne suffit pas : il faut soit une ressource
 * offerte à tous, soit une attribution nominative, soit être le propriétaire.
 *
 * Le stockage des fichiers n'est pas encore relié : le jour où il le sera (R2,
 * 10 Go gratuits, prévu dans la pile du propriétaire), c'est ici que l'adresse
 * signée à durée courte sera produite. En attendant, l'application le DIT au
 * lieu de faire semblant.
 */
export async function GET(request: Request, contexte: { params: Promise<{ id: string }> }) {
  await trackApiRequest();
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  const { id } = await contexte.params;

  try {
    const ligne = await session.db.execute({
      sql: `SELECT r.id, r.title, r.file_key, r.training_id,
                   (SELECT COUNT(*) FROM resource_allocations ra WHERE ra.resource_id = r.id) AS attribuees,
                   (SELECT COUNT(*) FROM resource_allocations ra WHERE ra.resource_id = r.id AND ra.user_id = ?) AS a_moi,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = ? AND e.training_id = r.training_id) AS inscrit
            FROM resources r WHERE r.id = ? AND r.published = 1`,
      args: [session.user.id, session.user.id, id],
    });
    const ressource = ligne.rows[0];
    if (!ressource) return jsonNoStore({ error: 'introuvable' }, 404);

    const proprietaire = session.reel.role === 'admin';
    const pourTous = Number(ressource.attribuees ?? 0) === 0;
    const aMoi = Number(ressource.a_moi ?? 0) === 1;
    const inscrit = ressource.training_id === null || Number(ressource.inscrit ?? 0) === 1;

    if (!proprietaire && !((pourTous || aMoi) && inscrit))
      return jsonNoStore({ error: 'acces_refuse' }, 403);

    const cle = typeof ressource.file_key === 'string' ? ressource.file_key : '';
    if (!cle || !stockagePret())
      return jsonNoStore(
        {
          error: 'stockage_non_relie',
          message:
            "Le fichier n'est pas encore déposé. Cette ressource vous sera ouverte dès sa mise en ligne — la direction le sait.",
        },
        503
      );

    // Adresse signée à durée courte : le fichier ne circule jamais sans contrôle.
    const adresse = await urlLecture(cle, 300);
    if (!adresse) return jsonNoStore({ error: 'stockage_non_relie' }, 503);
    return Response.redirect(adresse, 302);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
