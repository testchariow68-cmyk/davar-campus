import {
  AuthError,
  consumeRateLimit,
  createEmailToken,
  httpStatusForAuthError,
  normalizeEmail,
  rateLimitKey,
} from '@/lib/server/auth-core';
import { clientIp, isSameOrigin, jsonNoStore, linkOrigin, readJsonBody } from '@/lib/server/http';
import { mailerConfigured, sendEmail } from '@/lib/server/mailer';
import { openDb } from '@/lib/server/turso';
import { trackApiRequest } from '@/lib/server/quota';

export const dynamic = 'force-dynamic';

/**
 * « MOT DE PASSE OUBLIÉ ? » — la fenêtre du prototype, avec un vrai envoi.
 *
 * Une seule réponse, toujours la même, que le compte existe ou non : jamais
 * cette route ne dit si une adresse est inscrite. Le jeton ne vaut qu'une heure
 * et ne sert qu'une fois.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);

  if (!mailerConfigured()) return jsonNoStore({ error: 'email_delivery_not_configured' }, 503);
  const origin = linkOrigin(request);
  if (!origin) return jsonNoStore({ error: 'origin_not_configured' }, 503);

  const db = await openDb();
  try {
    const bucket = await rateLimitKey('reset.demande', clientIp(request));
    const verdict = await consumeRateLimit(db, bucket, { limit: 5, windowMs: 60 * 60 * 1000 });
    if (!verdict.allowed) throw new AuthError('rate_limited', undefined, verdict.retryAfterSeconds);

    const email = normalizeEmail(body.email);
    const trouve = await db.execute({
      sql: 'SELECT id, display_name FROM users WHERE email_normalized = ? LIMIT 1',
      args: [email],
    });
    const row = trouve.rows[0];
    if (row) {
      const jeton = await createEmailToken(db, String(row.id), 'reset_password', Date.now(), 60 * 60 * 1000);
      const url = `${origin}/reinitialiser?token=${encodeURIComponent(jeton)}`;
      const prenom = String(row.display_name ?? '').trim() || 'Bonjour';
      await sendEmail(
        {
          to: email,
          subject: 'DAVAR Campus — réinitialisation de votre mot de passe',
          text: [
            `${prenom},`,
            '',
            'Vous avez demandé un nouveau mot de passe pour votre accès au campus Davar Académie.',
            'Choisissez-en un ici :',
            url,
            '',
            'Ce lien est valable une heure et ne sert qu’une seule fois.',
            'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.',
            '',
            'DAVAR Académie — Abidjan',
          ].join('\n'),
        },
        db
      );
    }

    // Volontairement identique dans tous les cas : on ne dit jamais si l'adresse existe.
    return jsonNoStore({ ok: true });
  } catch (error) {
    if (error instanceof AuthError)
      return jsonNoStore(
        { error: error.code, retryAfterSeconds: error.retryAfterSeconds },
        httpStatusForAuthError(error.code)
      );
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
