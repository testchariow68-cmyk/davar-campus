import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { deposerAttentes, MOTS_MAXIMUM } from '@/lib/server/avis';
import { notifierEquipe } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

/**
 * Déposer ses ATTENTES — le premier des trois temps, demandé dès l'arrivée.
 * Une seule fois par étudiant et par formation. 1 000 mots au maximum, écrit ou
 * dicté ; un audio n'est conservé QUE transcrit, comme pour les avis.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  if (session.vueTest) return jsonNoStore({ error: 'vue_test_lecture_seule' }, 403);

  const body = await readJsonBody(request);
  const formationId = typeof body?.formationId === 'string' ? body.formationId.trim() : '';
  const kind = body?.kind === 'audio' ? 'audio' : 'ecrit';
  const corps = typeof body?.body === 'string' ? body.body : '';
  if (!formationId) return jsonNoStore({ error: 'invalid_input' }, 400);

  try {
    const resultat = await deposerAttentes(
      session.db,
      {
        userId: session.user.id,
        formationId,
        body: corps,
        kind,
        transcribedBy: typeof body?.transcribedBy === 'string' ? body.transcribedBy.slice(0, 60) : null,
      },
      Date.now()
    );
    if (!resultat.ok) {
      const messages: Record<string, string> = {
        avis_trop_court: 'Écrivez au moins quelques phrases : vos attentes nous guident.',
        avis_trop_long: `Vos attentes dépassent ${MOTS_MAXIMUM} mots. Raccourcissez-les, elles n'en seront que plus claires.`,
        attentes_deja_deposees: 'Vous avez déjà répondu. Merci !',
        non_inscrit: 'Vous n’êtes pas inscrit à cette formation.',
      };
      return jsonNoStore(
        { error: resultat.erreur, mots: resultat.mots, message: messages[resultat.erreur ?? ''] ?? 'Vos attentes n’ont pas été enregistrées.' },
        400
      );
    }
    await notifierEquipe(
      session.db,
      { titre: 'Attentes reçues', corps: `${session.user.displayName} a écrit ses attentes.`, route: '/direction/avis', kind: 'avis' },
      Date.now()
    );
    return jsonNoStore({ ok: true, mots: resultat.mots, message: 'Merci : vos attentes sont enregistrées.' });
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
