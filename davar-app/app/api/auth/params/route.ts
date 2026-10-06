import { AuthError, derivationParams, rateLimitKey, consumeRateLimit, normalizeEmail } from '@/lib/server/auth-core';
import { paramsSecret } from '@/lib/server/auth';
import { clientIp, isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { openDb } from '@/lib/server/turso';
import { trackApiRequest } from '@/lib/server/quota';

export const dynamic = 'force-dynamic';

/**
 * Paramètres publics de dérivation (sel + itérations) pour une adresse.
 * Réponse identique en forme pour une adresse connue ou inconnue : impossible
 * d'énumérer les comptes depuis cette route.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);

  const secret = paramsSecret();
  if (!secret) return jsonNoStore({ error: 'not_configured' }, 503);

  let email: string;
  try {
    email = normalizeEmail(body.email);
  } catch {
    return jsonNoStore({ error: 'invalid_input' }, 400);
  }

  try {
    const db = await openDb();
    const keys = [await rateLimitKey('params.ip', clientIp(request)), await rateLimitKey('params.email', email)];
    for (const bucket of keys) {
      const verdict = await consumeRateLimit(db, bucket, { limit: 60, windowMs: 15 * 60 * 1000 });
      if (!verdict.allowed)
        return jsonNoStore({ error: 'rate_limited', retryAfterSeconds: verdict.retryAfterSeconds }, 429);
    }
    const parameters = await derivationParams(db, email, secret);
    return jsonNoStore({ ...parameters, algorithm: 'PBKDF2-SHA256' });
  } catch (error) {
    if (error instanceof AuthError)
      return jsonNoStore({ error: error.code }, error.code === 'not_configured' ? 503 : 400);
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
