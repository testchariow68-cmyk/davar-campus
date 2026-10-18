import {
  AuthError,
  consumeEmailToken,
  httpStatusForAuthError,
  reinitialiserMotDePasseClient,
} from '@/lib/server/auth-core';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { openDb } from '@/lib/server/turso';
import { trackApiRequest } from '@/lib/server/quota';

export const dynamic = 'force-dynamic';

/** Le corps JSON arrive non typé : on ne garde que des chaînes, sans jamais journaliser. */
function lireChaine(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : '';
}

/** Le nouveau mot de passe est dérivé dans le navigateur : il ne transite jamais. */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);

  const db = await openDb();
  try {
    const { userId } = await consumeEmailToken(db, lireChaine(body.token), 'reset_password');
    await reinitialiserMotDePasseClient(db, userId, {
      verifier: lireChaine(body.verifier),
      salt: lireChaine(body.salt),
      iterations: Number(body.iterations),
    });
    return jsonNoStore({ ok: true });
  } catch (error) {
    if (error instanceof AuthError)
      return jsonNoStore({ error: error.code }, httpStatusForAuthError(error.code));
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
