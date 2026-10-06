import {
  AuthError,
  consumeRateLimit,
  httpStatusForAuthError,
  rateLimitKey,
  registerUser,
} from '@/lib/server/auth-core';
import { clientIp, isDevelopment, isSameOrigin, jsonNoStore, linkOrigin, readJsonBody } from '@/lib/server/http';
import { mailerConfigured, sendVerificationEmail } from '@/lib/server/mailer';
import { openDb } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';

/**
 * Création de compte. En production, aucun compte n'est créé si l'envoi
 * d'e-mail n'est pas configuré : un compte non vérifiable serait inutilisable
 * et la vérification d'e-mail est la preuve exigée pour rattacher un achat.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);

  const development = isDevelopment();
  if (!mailerConfigured() && !development)
    return jsonNoStore({ error: 'email_delivery_not_configured' }, 503);

  const origin = linkOrigin(request);
  if (!origin) return jsonNoStore({ error: 'origin_not_configured' }, 503);
  const db = await openDb();
  try {
    const ipBucket = await rateLimitKey('register.ip', clientIp(request));
    const verdict = await consumeRateLimit(db, ipBucket, { limit: 10, windowMs: 60 * 60 * 1000 });
    if (!verdict.allowed) throw new AuthError('rate_limited', undefined, verdict.retryAfterSeconds);

    const registration = await registerUser(db, {
      email: body.email as string,
      displayName: body.displayName as string,
      password: body.password as string,
    });
    const verifyUrl = `${origin}/verifier-email?token=${encodeURIComponent(registration.verificationToken)}`;

    let emailSent = false;
    if (mailerConfigured()) {
      try {
        await sendVerificationEmail({ to: registration.email, displayName: String(body.displayName), verifyUrl });
        emailSent = true;
      } catch {
        emailSent = false;
      }
    }
    return jsonNoStore(
      {
        ok: true,
        emailSent,
        // Le lien n'est renvoyé au navigateur QU'EN développement, pour test manuel.
        devVerificationUrl: development && !emailSent ? verifyUrl : undefined,
      },
      201
    );
  } catch (error) {
    if (error instanceof AuthError)
      return jsonNoStore(
        { error: error.code, retryAfterSeconds: error.retryAfterSeconds },
        httpStatusForAuthError(error.code)
      );
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
