import { currentSession } from '@/lib/server/auth';
import { lireFormationPubliee } from '@/lib/server/campus';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';

export const dynamic = 'force-dynamic';

/** Opérateurs Money Fusion acceptés. Rien d'autre ne passe. */
const OPERATEURS = ['wave', 'om', 'momo', 'moov'] as const;

/**
 * PAIEMENT DANS L'APPLICATION — Money Fusion (mobile money) ou Flutterwave
 * (voie universelle). Le premier achat, lui, se fait hors de l'application,
 * chez Chariow : le webhook rattache la formation au compte.
 *
 * Les deux passerelles demandent des clés que le propriétaire détient seul.
 * Tant qu'elles ne sont pas branchées, aucun encaissement n'est simulé : la
 * route répond `paiement_non_configure` et rien n'est écrit en base.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthorized' }, 401);

  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);

  const trainingId = typeof body.trainingId === 'string' ? body.trainingId : '';
  const method = typeof body.method === 'string' ? body.method : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!trainingId || !OPERATEURS.includes(method as (typeof OPERATEURS)[number]) || phone.length < 8)
    return jsonNoStore({ error: 'invalid_input' }, 400);

  const formation = await lireFormationPubliee(session.db, trainingId);
  if (!formation) return jsonNoStore({ error: 'introuvable' }, 404);

  const deja = await session.db.execute({
    sql: 'SELECT 1 FROM enrollments WHERE user_id = ? AND training_id = ? LIMIT 1',
    args: [session.user.id, trainingId],
  });
  if (deja.rows.length > 0) return jsonNoStore({ error: 'deja_acquise' }, 409);

  /* ----------------------------------------------------------------------------
     BRANCHEMENT — à compléter quand les clés seront en place :
       Money Fusion  : POST /api/v1/paiement-produit (clé `MONEYFUSION_API_KEY`)
       Flutterwave   : POST /v3/payments            (clé `FLUTTERWAVE_SECRET_KEY`)
     Chacune exige un secret de plus au déploiement ; on n'écrit donc rien en
     base avant que le propriétaire ne décide de les ajouter.
     -------------------------------------------------------------------------- */
  return jsonNoStore({ error: 'paiement_non_configure' }, 503);
}
