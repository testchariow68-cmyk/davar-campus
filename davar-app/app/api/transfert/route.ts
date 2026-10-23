import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { confirmerTransfert, refuserTransfert } from '@/lib/server/transfert';
import { openDb } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';

/**
 * TRANSFERT — le nouveau propriétaire confirme, ou refuse.
 *
 * Le lien reçu par e-mail EST l'autorisation : il n'est rangé qu'en empreinte,
 * il expire après sept jours, et il ne sert qu'une fois. Refuser annule tout et
 * prévient le propriétaire : « ce n'était pas moi » doit alerter, pas seulement
 * annuler.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const body = await readJsonBody(request);
  const token = typeof body?.token === 'string' ? body.token : '';
  const action = typeof body?.action === 'string' ? body.action : '';

  try {
    const db = await openDb();
    if (action === 'confirmer') {
      const resultat = await confirmerTransfert(db, token);
      if (!resultat.ok)
        return jsonNoStore(
          { ok: false, error: resultat.erreur, message: 'Ce lien n’est plus valable. Rien n’a été transféré.' },
          400
        );
      return jsonNoStore({
        ok: true,
        message: `Le transfert est effectif : ${resultat.nouveauProprietaire} dirige désormais le campus. Connectez-vous avec ce compte pour le constater.`,
      });
    }

    if (action === 'refuser') {
      const resultat = await refuserTransfert(db, token);
      if (!resultat.ok)
        return jsonNoStore({ ok: false, error: resultat.erreur, message: 'Ce lien n’est plus valable.' }, 400);
      return jsonNoStore({
        ok: true,
        message: resultat.proprietairePrevenu
          ? 'Le transfert a été annulé et le propriétaire a été prévenu.'
          : 'Le transfert a été annulé.',
      });
    }

    return jsonNoStore({ ok: false, error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ ok: false, error: 'unavailable' }, 503);
  }
}
