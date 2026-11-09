import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { envoyerAuSupport } from '@/lib/server/echanges';
import { notifierEquipe } from '@/lib/server/notifications';
import { clePropre, stockagePret, urlDepot } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';

/**
 * ÉCRIRE AU SUPPORT — et joindre une capture.
 *
 * Deux gestes, parce qu'un fichier ne traverse pas notre base :
 *   1. « depot »  : on demande une adresse de dépôt valable quinze minutes ;
 *   2. « envoyer » : l'étudiant dépose son fichier, puis envoie son message
 *                    avec la clé. Seule la clé est conservée.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  if (session.vueTest) return jsonNoStore({ error: 'vue_test_lecture_seule' }, 403);

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const maintenant = Date.now();

  if (action === 'depot') {
    if (!stockagePret()) {
      return jsonNoStore(
        { error: 'stockage_non_relie', message: "Le stockage des fichiers n’est pas encore relié : impossible de joindre une capture." },
        503
      );
    }
    const nomPropose = typeof body?.fileName === 'string' ? body.fileName.toLowerCase() : '';
    const extension = /^[a-z0-9.]{1,12}$/.test(nomPropose.split('.').pop() ?? '') ? nomPropose.split('.').pop() : 'png';
    const cle = clePropre(`support/${session.user.id}/${maintenant.toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extension}`);
    if (!cle) return jsonNoStore({ error: 'cle_invalide' }, 400);
    const adresse = await urlDepot(cle, 900, maintenant);
    return jsonNoStore({ ok: true, url: adresse, cle, message: 'Adresse de dépôt prête (15 minutes).' });
  }

  if (action === 'envoyer') {
    const texte = typeof body?.body === 'string' ? body.body.trim() : '';
    if (texte.length < 10) return jsonNoStore({ error: 'message_trop_court', message: 'Décrivez votre problème en quelques mots.' }, 400);
    const cle = typeof body?.fileKey === "string" ? clePropre(body.fileKey.slice(0, 300)) : null;
    const nom = typeof body?.fileName === "string" ? body.fileName.slice(0, 120) : null;
    try {
      const envoi = await envoyerAuSupport(
        session.db,
        {
          userId: session.user.id,
          formationId: typeof body?.formationId === 'string' ? body.formationId : null,
          texte,
          fileKey: cle,
          fileName: nom,
        },
        maintenant
      );
      await notifierEquipe(
        session.db,
        {
          titre: 'Message au support',
          corps: `${session.user.displayName} a écrit au support${cle ? ' (avec une pièce jointe)' : ''}.`,
          route: `/direction/conversations/${envoi.conversationId}`,
          kind: 'coach',
        },
        maintenant
      );
      return jsonNoStore({ ok: true, message: 'Message transmis. L’équipe vous répond sous 48 h au plus.' });
    } catch {
      return jsonNoStore({ error: 'unavailable' }, 503);
    }
  }

  return jsonNoStore({ error: 'invalid_input' }, 400);
}
