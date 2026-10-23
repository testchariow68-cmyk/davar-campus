import { currentSession } from '@/lib/server/auth';
import { jsonNoStore } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { accesRessource } from '@/lib/server/medias';
import { urlLecture } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';

/**
 * ÉCOUTE D'UNE PISTE — le droit est vérifié ICI, puis une adresse signée valable
 * quelques minutes est remise au lecteur audio. Le fichier n'est jamais public.
 */
export async function GET(request: Request, contexte: { params: Promise<{ id: string }> }) {
  await trackApiRequest();
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  const { id } = await contexte.params;

  try {
    const piste = await session.db.execute({
      sql: 'SELECT id, resource_id, file_key FROM audio_tracks WHERE id = ?',
      args: [id],
    });
    const ligne = piste.rows[0];
    if (!ligne) return jsonNoStore({ error: 'introuvable' }, 404);
    const resourceId = typeof ligne.resource_id === 'string' ? ligne.resource_id : '';

    const acces = await accesRessource(session.db, {
      userId: session.user.id,
      estProprietaire: session.reel.role === 'admin',
      resourceId,
    });
    if (!acces.ok) return jsonNoStore({ error: acces.raison }, 403);

    const cle = typeof ligne.file_key === 'string' ? ligne.file_key : '';
    if (!cle) return jsonNoStore({ error: 'piste_non_deposee', message: 'Cette piste n’est pas encore déposée.' }, 503);

    const adresse = await urlLecture(cle);
    if (!adresse)
      return jsonNoStore(
        { error: 'stockage_non_relie', message: "Le stockage des fichiers n'est pas encore relié à la plateforme." },
        503
      );
    return Response.redirect(adresse, 302);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
