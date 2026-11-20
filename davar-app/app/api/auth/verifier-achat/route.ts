import {
  AuthError,
  consumeRateLimit,
  httpStatusForAuthError,
  normalizeEmail,
  rateLimitKey,
} from '@/lib/server/auth-core';
import { clientIp, isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { openDb } from '@/lib/server/turso';
import { trackApiRequest } from '@/lib/server/quota';

export const dynamic = 'force-dynamic';

/**
 * PREMIÈRE ÉTAPE DE L'INSCRIPTION — « Vérifier mon e-mail ».
 *
 * Le prototype (js/views-student.js, fonction checkSignupMail) n'ouvre la
 * configuration du compte que si l'adresse saisie correspond à un achat
 * confirmé ou à une invitation valide. Sinon il refuse, avec un message qui
 * renvoie vers l'adresse utilisée au moment de l'achat. On reproduit ce
 * comportement à l'identique : aucune création de compte n'est possible avec
 * une adresse qui n'a rien acheté.
 *
 * Cette route ne crée rien et ne révèle rien d'autre que oui ou non.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);

  const db = await openDb();
  try {
    const bucket = await rateLimitKey('signup.check', clientIp(request));
    const verdict = await consumeRateLimit(db, bucket, { limit: 30, windowMs: 60 * 60 * 1000 });
    if (!verdict.allowed) throw new AuthError('rate_limited', undefined, verdict.retryAfterSeconds);

    const email = normalizeEmail(body.email);

    // Un compte existe déjà : on ne recommence pas, on renvoie à la connexion.
    const deja = await db.execute({
      sql: 'SELECT 1 AS present FROM users WHERE email_normalized = ? LIMIT 1',
      args: [email],
    });
    if ((deja.rows?.length ?? 0) > 0) throw new AuthError('email_taken');

    const achats = await db.execute({
      sql: 'SELECT training_id FROM verified_purchases WHERE buyer_email_normalized = ?',
      args: [email],
    });
    const invitation = await db.execute({
      sql: 'SELECT type FROM invites WHERE lower(email) = ? AND used = 0 AND expires_at > ? LIMIT 1',
      args: [email, Date.now()],
    });

    const formations = achats.rows?.length ?? 0;
    if (formations === 0 && (invitation.rows?.length ?? 0) === 0) throw new AuthError('no_purchase');

    return jsonNoStore({
      ok: true,
      email,
      formations,
      invitation: invitation.rows?.length ? String((invitation.rows[0] as { type?: string }).type ?? '') : null,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonNoStore(
        { error: error.code, retryAfterSeconds: error.retryAfterSeconds },
        httpStatusForAuthError(error.code)
      );
    }
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
