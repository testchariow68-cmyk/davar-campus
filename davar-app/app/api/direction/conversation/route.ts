import { verrouEcriture, verrouSupervision } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { marquerResolue, repondreCommeCoach, validerReponseIA } from '@/lib/server/echanges';
import { notifier } from '@/lib/server/notifications';
import { enregistrerEvenement } from '@/lib/server/journal';

export const dynamic = 'force-dynamic';

/** Supervision des conversations : répondre en coach, valider ou clore.
 *  Le coach et le manager répondent ; valider la réponse de l'assistant et clore
 *  restent des gestes de supervision (propriétaire ou manager). */
export async function POST(request: Request) {
  await trackApiRequest();
  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';

  const verrou = action === 'repondre' ? await verrouEcriture(request, 'repondre-conversation') : await verrouSupervision(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : '';
  if (!conversationId) return jsonNoStore({ error: 'invalid_input' }, 400);
  const maintenant = Date.now();

  try {
    const fil = await db.execute({
      sql: 'SELECT user_id, training_id, mode FROM conversations WHERE id = ?',
      args: [conversationId],
    });
    const ligne = fil.rows[0];
    if (!ligne) return jsonNoStore({ error: 'introuvable' }, 404);
    const etudiantId = typeof ligne.user_id === 'string' ? ligne.user_id : '';

    if (action === 'repondre') {
      const texte = typeof body?.text === 'string' ? body.text.trim() : '';
      if (texte.length < 2 || texte.length > 2000) return jsonNoStore({ error: 'invalid_input' }, 400);
      await repondreCommeCoach(db, conversationId, texte, maintenant);
      if (etudiantId) {
        await notifier(
          db,
          {
            userId: etudiantId,
            kind: 'coach',
            titre: 'Votre coach a répondu',
            corps: texte.slice(0, 140),
            route: `/campus/questions/${conversationId}`,
          },
          maintenant
        );
      }
      await enregistrerEvenement(db, {
        actorId: reel.id,
        action: 'reponse-conversation',
        detail: `conversation ${conversationId} · ${texte.slice(0, 80)}`,
      });
      return jsonNoStore({ ok: true });
    }

    if (action === 'valider') {
      await validerReponseIA(db, conversationId, maintenant);
      await enregistrerEvenement(db, {
        actorId: reel.id,
        action: 'validation-conversation',
        detail: `conversation ${conversationId}`,
      });
      return jsonNoStore({ ok: true, message: 'Réponse validée : elle porte désormais votre accord.' });
    }

    if (action === 'resoudre') {
      await marquerResolue(db, conversationId, maintenant);
      await enregistrerEvenement(db, {
        actorId: reel.id,
        action: 'resolution-conversation',
        detail: `conversation ${conversationId}`,
      });
      return jsonNoStore({ ok: true, message: 'Conversation close.' });
    }

    return jsonNoStore({ error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
