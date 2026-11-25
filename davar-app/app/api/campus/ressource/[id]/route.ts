import { currentSession } from '@/lib/server/auth';
import { accesRessource, enregistrerActiviteRessource } from '@/lib/server/medias';
import { jsonNoStore } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { urlLecture } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';

/**
 * Ouvre un fichier multimédia après contrôle d'accès.
 *
 * La clé R2 n'est ni rendue dans le HTML ni utilisée comme lien visible : cette
 * route enregistre d'abord la dernière ouverture, puis remet une adresse signée
 * courte au navigateur. Une vue test reste strictement sans écriture.
 */
export async function GET(_request: Request, contexte: { params: Promise<{ id: string }> }) {
  await trackApiRequest();
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  const { id } = await contexte.params;
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(id)) return jsonNoStore({ error: 'invalid_input' }, 400);

  try {
    const acces = await accesRessource(session.db, {
      userId: session.user.id,
      estProprietaire: session.reel.role === 'admin',
      resourceId: id,
    });
    if (!acces.ok) return jsonNoStore({ error: acces.raison ?? 'acces_refuse' }, 403);
    if (acces.kind !== 'file') return jsonNoStore({ error: 'type_invalide' }, 400);
    if (!acces.fileKey) return jsonNoStore({ error: 'fichier_non_depose' }, 404);

    const adresse = await urlLecture(acces.fileKey, 600);
    if (!adresse) return jsonNoStore({ error: 'stockage_non_relie' }, 503);
    if (!session.vueTest) {
      await enregistrerActiviteRessource(session.db, { userId: session.user.id, resourceId: id });
    }
    return Response.redirect(adresse, 302);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
