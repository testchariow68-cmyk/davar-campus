import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { accesRessource, enregistrerPosition } from '@/lib/server/medias';

export const dynamic = 'force-dynamic';

/**
 * REPRISE DE LECTURE — la page d'un livre, la seconde d'un audio.
 * « Votre position est enregistrée automatiquement. » Le droit d'accès est
 * vérifié AVANT d'écrire : on n'enregistre pas la position d'un livre qu'on
 * n'a pas le droit d'ouvrir.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  if (session.vueTest) return jsonNoStore({ error: 'vue_test_lecture_seule' }, 403);

  const body = await readJsonBody(request);
  const resourceId = typeof body?.resourceId === 'string' ? body.resourceId.trim() : '';
  const kind = body?.kind === 'audio' ? 'audio' : 'book';
  const position = Number(body?.position);
  if (!resourceId || !Number.isFinite(position) || position < 0 || position > 100000)
    return jsonNoStore({ error: 'invalid_input' }, 400);

  try {
    const acces = await accesRessource(session.db, {
      userId: session.user.id,
      estProprietaire: session.reel.role === 'admin',
      resourceId,
    });
    if (!acces.ok) return jsonNoStore({ error: acces.raison }, 403);

    const garde = await enregistrerPosition(
      session.db,
      { userId: session.user.id, resourceId, kind, position, forcer: body?.forcer === true },
      Date.now()
    );
    return jsonNoStore({ ok: true, position: garde });
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
