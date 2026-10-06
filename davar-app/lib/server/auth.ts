/**
 * Liaison Next.js ↔ noyau d'authentification : cookies et session.
 * SERVEUR UNIQUEMENT. Les garde-fous HTTP purs (origine, entrées, liens)
 * vivent dans ./http pour rester testables sans Next.
 */
import { cookies } from 'next/headers';
import { openDb } from './turso';
import { resolveSession, revokeSession, type Db, type SessionUser } from './auth-core';
import { isDevelopment } from './http';

export { isDevelopment };

export const SESSION_COOKIE = 'davar_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Cookie de session : HttpOnly, SameSite=Lax, Secure hors développement.
 * Le jeton stocké en base est son SHA-256 : le cookie est la seule copie brute.
 */
export async function setSessionCookie(token: string, expiresAtMs: number): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isDevelopment(),
    path: '/',
    expires: new Date(expiresAtMs),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: !isDevelopment(), path: '/', maxAge: 0 });
}

export type ActiveSession = { user: SessionUser; token: string; db: Db };

/** Session courante ou null. Aucune exception ne fuit vers la page appelante. */
export async function currentSession(): Promise<ActiveSession | null> {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const db = await openDb();
    const user = await resolveSession(db, token);
    if (!user) return null;
    return { user, token, db };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  return (await currentSession())?.user ?? null;
}

export async function logoutCurrentSession(): Promise<void> {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) {
      const db = await openDb();
      await revokeSession(db, token);
    }
  } finally {
    await clearSessionCookie();
  }
}
