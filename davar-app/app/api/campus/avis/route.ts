import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { deposerAvis, MOTS_MAXIMUM } from '@/lib/server/avis';
import { notifierEquipe } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

/**
 * Déposer un avis. 1 000 mots maximum, écrit ou audio transcrit.
 * Un avis audio n'est conservé QUE sous forme transcrite : c'est la décision du
 * propriétaire — il ne reçoit que l'écrit.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  if (session.vueTest) return jsonNoStore({ error: 'vue_test_lecture_seule' }, 403);

  const body = await readJsonBody(request);
  const formationId = typeof body?.formationId === 'string' ? body.formationId.trim() : '';
  const step = Number(body?.step);
  const kind = body?.kind === 'audio' ? 'audio' : 'ecrit';
  const corps = typeof body?.body === 'string' ? body.body : '';
  if (!formationId || (step !== 1 && step !== 2)) return jsonNoStore({ error: 'invalid_input' }, 400);

  try {
    const resultat = await deposerAvis(
      session.db,
      {
        userId: session.user.id,
        formationId,
        step,
        body: corps,
        kind,
        transcribedBy: typeof body?.transcribedBy === 'string' ? body.transcribedBy.slice(0, 60) : null,
      },
      Date.now()
    );
    if (!resultat.ok) {
      const messages: Record<string, string> = {
        avis_trop_court: 'Votre avis est trop court : écrivez au moins quelques phrases utiles.',
        avis_trop_long: `Votre avis dépasse ${MOTS_MAXIMUM} mots. Raccourcissez-le, il n’en sera que plus fort.`,
        avis_deja_depose: 'Vous avez déjà donné cet avis. Merci !',
        non_inscrit: 'Vous n’êtes pas inscrit à cette formation.',
        etape_invalide: 'Demande invalide.',
      };
      return jsonNoStore({ error: resultat.erreur, mots: resultat.mots, message: messages[resultat.erreur ?? ''] ?? 'L’avis n’a pas été enregistré.' }, 400);
    }
    await notifierEquipe(
      session.db,
      { titre: 'Nouvel avis reçu', corps: `${session.user.displayName} — avis n°${step}.`, route: '/direction/avis', kind: 'avis' },
      Date.now()
    );
    return jsonNoStore({ ok: true, mots: resultat.mots, message: 'Merci : votre avis est enregistré.' });
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
