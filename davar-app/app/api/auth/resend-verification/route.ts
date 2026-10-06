import {
  AuthError,
  consumeRateLimit,
  createEmailToken,
  normalizeEmail,
  rateLimitKey,
} from '@/lib/server/auth-core';
import { clientIp, isDevelopment, isSameOrigin, jsonNoStore, linkOrigin, readJsonBody } from '@/lib/server/http';
import { mailerConfigured, sendVerificationEmail } from '@/lib/server/mailer';
import { openDb } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';

/**
 * Renvoi du lien de confirmation. Réponse volontairement identique que le
 * compte existe ou non (pas d'énumération d'adresses depuis cette route).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);

  const development = isDevelopment();
  if (!mailerConfigured() && !development)
    return jsonNoStore({ error: 'email_delivery_not_configured' }, 503);

  let email: string;
  try {
    email = normalizeEmail(body.email);
  } catch {
    return jsonNoStore({ ok: true });
  }

  const db = await openDb();
  try {
    const keys = [await rateLimitKey('resend.email', email), await rateLimitKey('resend.ip', clientIp(request))];
    for (const bucket of keys) {
      const verdict = await consumeRateLimit(db, bucket, { limit: 5, windowMs: 60 * 60 * 1000 });
      if (!verdict.allowed) throw new AuthError('rate_limited', undefined, verdict.retryAfterSeconds);
    }

    const found = await db.execute({
      sql: 'SELECT id, display_name, email_verified_at_ms FROM users WHERE email_normalized = ?',
      args: [email],
    });
    const row = found.rows[0];
    const userId = typeof row?.id === 'string' ? row.id : null;
    const alreadyVerified = row?.email_verified_at_ms !== null && row?.email_verified_at_ms !== undefined;

    if (!userId || alreadyVerified) return jsonNoStore({ ok: true });

    const token = await createEmailToken(db, userId, 'verify_email');
    const origin = linkOrigin(request);
    if (!origin) return jsonNoStore({ error: 'origin_not_configured' }, 503);
    const verifyUrl = `${origin}/verifier-email?token=${encodeURIComponent(token)}`;
    let emailSent = false;
    if (mailerConfigured()) {
      try {
        await sendVerificationEmail({
          to: email,
          displayName: typeof row?.display_name === 'string' ? row.display_name : 'étudiant',
          verifyUrl,
        });
        emailSent = true;
      } catch {
        emailSent = false;
      }
    }
    return jsonNoStore({
      ok: true,
      emailSent,
      devVerificationUrl: development && !emailSent ? verifyUrl : undefined,
    });
  } catch (error) {
    if (error instanceof AuthError)
      return jsonNoStore(
        { error: error.code, retryAfterSeconds: error.retryAfterSeconds },
        error.code === 'rate_limited' ? 429 : 400
      );
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
