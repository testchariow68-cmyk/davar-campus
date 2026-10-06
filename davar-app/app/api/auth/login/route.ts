import { AuthError, httpStatusForAuthError, loginUser } from '@/lib/server/auth-core';
import { clientIp, isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { setSessionCookie } from '@/lib/server/auth';
import { openDb } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);
  const db = await openDb();
  try {
    const session = await loginUser(db, {
      email: body.email as string,
      password: body.password as string,
      ipHash: clientIp(request),
    });
    await setSessionCookie(session.token, session.expiresAtMs);
    return jsonNoStore({ ok: true, displayName: session.user.displayName });
  } catch (error) {
    if (error instanceof AuthError)
      return jsonNoStore(
        { error: error.code, retryAfterSeconds: error.retryAfterSeconds },
        httpStatusForAuthError(error.code)
      );
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
