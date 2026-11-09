import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { abonner, clePubliqueVapid, desabonner } from '@/lib/server/push.ts';

export const dynamic = 'force-dynamic';

/**
 * NOTIFICATIONS POUSSÉES — abonner l'appareil de la personne connectée.
 *
 * « cle-publique » donne la clé du campus : elle est publique par nature, mais
 * on ne la distribue qu'à une session ouverte, pour ne pas offrir de point
 * d'appui gratuit à un inconnu.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';

  if (action === 'cle-publique') {
    return jsonNoStore({ ok: true, cle: await clePubliqueVapid(session.db) });
  }

  if (action === 'abonner') {
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    const p256dh = typeof body?.p256dh === 'string' ? body.p256dh.trim() : '';
    const auth = typeof body?.auth === 'string' ? body.auth.trim() : '';
    if (!endpoint.startsWith('https://') || p256dh.length < 40 || auth.length < 10) {
      return jsonNoStore({ ok: false, erreur: 'abonnement_invalide' }, 400);
    }
    await abonner(session.db, { userId: session.user.id, endpoint, p256dh, auth });
    return jsonNoStore({ ok: true });
  }

  if (action === 'desabonner') {
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    if (endpoint) await desabonner(session.db, session.user.id, endpoint);
    return jsonNoStore({ ok: true });
  }

  return jsonNoStore({ error: 'action_inconnue' }, 400);
}
