import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { rendreDevoir, repondreEvaluation, repondreExercice } from '@/lib/server/pedagogie';
import { verifierReglesBadges } from '@/lib/server/recompenses';
import { notifierEquipe } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

function reponsesDe(valeur: unknown): Array<{ questionId: string; choiceIndex: number }> {
  if (!Array.isArray(valeur)) return [];
  const sortie: Array<{ questionId: string; choiceIndex: number }> = [];
  for (const entree of valeur) {
    const item = entree as { questionId?: unknown; choiceIndex?: unknown };
    if (typeof item?.questionId !== 'string') continue;
    const choix = Number(item.choiceIndex);
    if (!Number.isInteger(choix) || choix < 0 || choix > 20) continue;
    sortie.push({ questionId: item.questionId, choiceIndex: choix });
  }
  return sortie;
}

/**
 * Exercice, évaluation et devoir rendu.
 *
 * L'exercice ne bloque rien : il rend un corrigé, c'est tout.
 * L'évaluation bloque : elle rend le score, et le devoir n'est accepté qu'une fois
 * le minimum atteint. Pendant une vue test, RIEN ne s'écrit.
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

  try {
    if (action === 'exercice' || action === 'evaluation') {
      const cible = typeof body?.id === 'string' ? body.id : '';
      if (!cible) return jsonNoStore({ error: 'invalid_input' }, 400);
      const resultat =
        action === 'exercice'
          ? await repondreExercice(session.db, session.user.id, cible, reponsesDe(body?.reponses), maintenant)
          : await repondreEvaluation(session.db, session.user.id, cible, reponsesDe(body?.reponses), maintenant);
      if (!resultat.ok) return jsonNoStore({ error: resultat.erreur }, 400);
      return jsonNoStore({ ok: true, score: resultat.score, total: resultat.total, pct: resultat.pct, detail: resultat.detail });
    }

    if (action === 'devoir') {
      const assessmentId = typeof body?.id === 'string' ? body.id : '';
      if (!assessmentId) return jsonNoStore({ error: 'invalid_input' }, 400);
      const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : null;
      const fileKey = typeof body?.fileKey === 'string' ? body.fileKey.trim().slice(0, 200) : null;
      if (!note && !fileKey) return jsonNoStore({ error: 'devoir_vide' }, 400);
      const resultat = await rendreDevoir(session.db, { userId: session.user.id, assessmentId, fileKey, note }, maintenant);
      if (!resultat.ok) return jsonNoStore({ error: resultat.erreur }, 400);
      await notifierEquipe(
        session.db,
        { titre: 'Nouveau devoir à corriger', corps: `${session.user.displayName} a rendu son évaluation.`, route: '/direction/devoirs', kind: 'devoir' },
        maintenant
      );
      return jsonNoStore({ ok: true, message: 'Devoir transmis. La direction le corrige et vous répond.' });
    }

    if (action === 'badges') {
      const obtenus = await verifierReglesBadges(session.db, session.user.id, maintenant);
      return jsonNoStore({ ok: true, obtenus });
    }

    return jsonNoStore({ error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
