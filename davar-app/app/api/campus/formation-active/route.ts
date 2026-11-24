import { currentSession } from '@/lib/server/auth';
import { choisirFormationActive } from '@/lib/server/campus';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';

export const dynamic = 'force-dynamic';

/**
 * FORMATION ACTIVE — le choix suit l'étudiant d'un appareil à l'autre.
 *
 * Le serveur vérifie toujours l'inscription avant d'écrire la préférence dans
 * Turso. Une vue test reste strictement en lecture seule.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  if (session.vueTest) return jsonNoStore({ error: 'vue_test_lecture_seule' }, 403);

  const body = await readJsonBody(request);
  const trainingId = typeof body?.trainingId === 'string' ? body.trainingId.trim() : '';
  if (!trainingId) return jsonNoStore({ error: 'invalid_input' }, 400);

  try {
    const ok = await choisirFormationActive(session.db, session.user.id, trainingId);
    if (!ok) return jsonNoStore({ error: 'formation_non_acquise' }, 403);
    return jsonNoStore({ ok: true, trainingId });
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
