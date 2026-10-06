/**
 * Liaison Next.js ↔ noyau d'authentification : cookies, session, contrôle d'origine.
 * SERVEUR UNIQUEMENT.
 */
import { cookies } from 'next/headers';
import { openDb } from './turso';
import { resolveSession, revokeSession, type Db, type SessionUser } from './auth-core';

export const SESSION_COOKIE = 'davar_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function isDevelopment(): boolean {
  const env = process.env.APP_ENV;
  if (env === 'development' || env === 'staging' || env === 'production') return env === 'development';
  return process.env.NODE_ENV !== 'production';
}

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

/* ------------------------------------------------------------- requêtes HTTP */

/**
 * Refuse toute requête modifiante dont l'origine déclarée ne correspond pas à
 * l'hôte servi (protection CSRF en complément du cookie SameSite=Lax).
 * Une absence d'en-tête Origin est traitée comme un refus.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const candidates = [request.headers.get('host'), request.headers.get('x-forwarded-host')]
    .flatMap((value) => (value ? value.split(',') : []))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return candidates.includes(originHost);
}

export function clientIp(request: Request): string {
  const direct = request.headers.get('cf-connecting-ip');
  if (direct) return direct.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

export function jsonNoStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Corps JSON borné (1 Mio max) ; renvoie null si absent, trop gros ou invalide. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 1_048_576) return null;
  try {
    const raw = await request.text();
    if (!raw || raw.length > 1_048_576) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Origine publique utilisée dans les liens d'e-mail (jamais déduite du client). */
export function publicOrigin(): string | null {
  const configured = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!isDevelopment() && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}
