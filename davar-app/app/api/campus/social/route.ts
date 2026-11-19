import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import {
  ajouterCommentaireCours,
  basculerReactionCours,
  confirmerAbonnement,
  ErreurSocialCours,
  lireCoursSocial,
} from '@/lib/server/social';

export const dynamic = 'force-dynamic';

function erreurSociale(error: unknown): { error: string; status: number } {
  if (error instanceof ErreurSocialCours) {
    if (error.code === 'not_enrolled') return { error: 'not_enrolled', status: 403 };
    if (error.code === 'invalid_parent') return { error: 'invalid_parent', status: 400 };
    if (error.code === 'invalid_input') return { error: 'invalid_input', status: 400 };
  }
  return { error: 'unavailable', status: 503 };
}

/**
 * Lecture des compteurs/commentaires du cours. La lecture est publique à
 * l'intérieur d'une formation suivie, mais reste strictement bornée au cours
 * demandé ; une vue test peut lire sans écrire le contenu publié.
 */
export async function GET(request: Request) {
  await trackApiRequest();
  const session = await currentSession();
  if (!session) return jsonNoStore({ ok: false, error: 'unauthenticated' }, 401);
  const lessonId = new URL(request.url).searchParams.get('lessonId') ?? '';
  try {
    const social = await lireCoursSocial(session.db, session.user.id, lessonId, session.vueTest !== null);
    if (!social) return jsonNoStore({ ok: false, error: 'not_enrolled' }, 403);
    return jsonNoStore({ ok: true, social });
  } catch {
    return jsonNoStore({ ok: false, error: 'unavailable' }, 503);
  }
}

/**
 * Une seule route porte les interactions du cours ET l'ancien bandeau social.
 * Les réactions et commentaires n'écrivent jamais dans localStorage : le retour
 * contient l'état relu en base afin que l'écran courant et les autres étudiants
 * partagent les mêmes compteurs.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ ok: false, error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ ok: false, error: 'unauthenticated' }, 401);

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';

  /* Ancienne action conservée : « OUI, JE SUIS ABONNÉ(E) ». */
  if (!action && typeof body?.plateforme === 'string') {
    try {
      // Pendant une vue test, la confirmation appartient au compte affiché.
      const confirme = await confirmerAbonnement(session.db, session.user.id, body.plateforme);
      if (!confirme) return jsonNoStore({ ok: false, error: 'plateforme_inconnue' }, 400);
      return jsonNoStore({ ok: true, message: 'Merci ! Abonnement confirmé.' });
    } catch {
      return jsonNoStore({ ok: false, error: 'unavailable' }, 503);
    }
  }

  // Une vue test reste en lecture seule, comme le prototype le promet pour les
  // comptes de démonstration de l'espace Direction.
  if (session.vueTest) return jsonNoStore({ ok: false, error: 'vue_test_lecture_seule' }, 403);

  const lessonId = typeof body?.lessonId === 'string' ? body.lessonId : '';
  try {
    let social;
    if (action === 'reaction') {
      social = await basculerReactionCours(session.db, session.user.id, lessonId, body?.emoji);
    } else if (action === 'commentaire' || action === 'comment') {
      social = await ajouterCommentaireCours(
        session.db,
        session.user.id,
        lessonId,
        body?.text,
        body?.parentId ?? null
      );
    } else {
      return jsonNoStore({ ok: false, error: 'action_inconnue' }, 400);
    }
    return jsonNoStore({ ok: true, social });
  } catch (error) {
    const resultat = erreurSociale(error);
    return jsonNoStore({ ok: false, error: resultat.error }, resultat.status);
  }
}
