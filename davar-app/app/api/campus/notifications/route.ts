import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { compterNonLues, listerNotifications, marquerLue, marquerToutesLues } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

/** Cloche : lire une notification ou les marquer toutes lues. */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const maintenant = Date.now();

  try {
    if (action === 'lire') {
      const id = typeof body?.id === 'string' ? body.id : '';
      if (!id) return jsonNoStore({ error: 'invalid_input' }, 400);
      await marquerLue(session.db, session.user.id, id, maintenant);
    } else if (action === 'tout_lire') {
      await marquerToutesLues(session.db, session.user.id, maintenant);
    } else {
      return jsonNoStore({ error: 'action_inconnue' }, 400);
    }
    const [liste, nonLues] = await Promise.all([
      listerNotifications(session.db, session.user.id, maintenant),
      compterNonLues(session.db, session.user.id, maintenant),
    ]);
    return jsonNoStore({ ok: true, nonLues, notifications: liste });
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
