import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { currentSession } from '@/lib/server/auth';
import { trackApiRequest } from '@/lib/server/quota';
import { setLessonCompletion } from '@/lib/server/campus';

export const dynamic = 'force-dynamic';

/** Marque une leçon terminée : session valide ET droit vérifié sur la formation. */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  // Une vue test est en LECTURE SEULE : elle ne doit jamais écrire dans la vraie progression.
  if (session.vueTest) return jsonNoStore({ error: 'vue_test_lecture_seule' }, 403);
  const body = await readJsonBody(request);
  if (!body || typeof body.lessonId !== 'string')
    return jsonNoStore({ error: 'invalid_input' }, 400);
  try {
    const applied = await setLessonCompletion(
      session.db,
      session.user.id,
      body.lessonId,
      body.completed !== false
    );
    if (!applied) return jsonNoStore({ error: 'not_enrolled' }, 403);
    return jsonNoStore({ ok: true });
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
