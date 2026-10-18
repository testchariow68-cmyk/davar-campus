import { currentSession } from '@/lib/server/auth';
import { lireFormationPubliee } from '@/lib/server/campus';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { creerIntention, fraisDe, ouvrirPaiementFlutterwave, voiePaiement } from '@/lib/server/paiement';

export const dynamic = 'force-dynamic';

/**
 * PAIEMENT DANS L'APPLICATION.
 *
 * Le premier achat se fait hors de l'application, chez Chariow ; le Pulse
 * rattache la formation au compte. Les achats SUIVANTS passent par ici : le
 * serveur ouvre un encaissement chez le fournisseur, puis RENVOIE l'adresse de
 * la page de paiement. Aucune carte, aucun numéro mobile ne transite par notre
 * application — c'est le fournisseur qui encaisse, sur sa propre page.
 *
 * Tant que la clé du fournisseur n'est pas posée, rien n'est simulé et rien
 * n'est écrit : la route répond `paiement_non_configure`, et l'écran le dit.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthorized' }, 401);

  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);

  const trainingId = typeof body.trainingId === 'string' ? body.trainingId : '';
  const telephone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!trainingId) return jsonNoStore({ error: 'invalid_input' }, 400);

  if (voiePaiement() === null) return jsonNoStore({ error: 'paiement_non_configure' }, 503);

  const formation = await lireFormationPubliee(session.db, trainingId);
  if (!formation) return jsonNoStore({ error: 'introuvable' }, 404);

  const deja = await session.db.execute({
    sql: 'SELECT 1 FROM enrollments WHERE user_id = ? AND training_id = ? LIMIT 1',
    args: [session.user.id, trainingId],
  });
  if (deja.rows.length > 0) return jsonNoStore({ error: 'deja_acquise' }, 409);

  const total = formation.prixCfa + fraisDe(formation.prixCfa);
  const intentionId = await creerIntention(session.db, {
    userId: session.user.id,
    trainingId,
    montantCfa: total,
    devise: 'XOF',
    provider: 'flutterwave',
  });

  const origine = new URL(request.url).origin;
  const ouverture = await ouvrirPaiementFlutterwave({
    reference: intentionId,
    montantCfa: total,
    devise: 'XOF',
    email: session.user.email,
    nom: session.user.displayName,
    telephone,
    trainingId,
    retourUrl: `${origine}/api/payments/retour`,
  });

  if (!ouverture.ok) return jsonNoStore({ error: ouverture.erreur }, 502);
  return jsonNoStore({ ok: true, lien: ouverture.lien });
}
