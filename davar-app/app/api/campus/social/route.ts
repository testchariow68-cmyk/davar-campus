import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { confirmerAbonnement } from '@/lib/server/social';

export const dynamic = 'force-dynamic';

/**
 * « OUI, JE SUIS ABONNÉ(E) » — la confirmation de l'étudiant, horodatée.
 *
 * Aucune plateforme ne permet de vérifier un abonnement ; la confirmation est
 * donc la seule preuve honnête. Elle ne prétend pas être davantage.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ ok: false, error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ ok: false, error: 'unauthenticated' }, 401);

  const body = await readJsonBody(request);
  const plateforme = typeof body?.plateforme === 'string' ? body.plateforme : '';

  try {
    // Pendant une vue test, la confirmation appartient au compte affiché.
    const confirme = await confirmerAbonnement(session.db, session.user.id, plateforme);
    if (!confirme) return jsonNoStore({ ok: false, error: 'plateforme_inconnue' }, 400);
    return jsonNoStore({ ok: true, message: 'Merci ! Abonnement confirmé.' });
  } catch {
    return jsonNoStore({ ok: false, error: 'unavailable' }, 503);
  }
}
