/**
 * Liaison Next.js ↔ noyau d'authentification : cookies et session.
 * SERVEUR UNIQUEMENT. Les garde-fous HTTP purs (origine, entrées, liens)
 * vivent dans ./http pour rester testables sans Next.
 */
import { cookies } from 'next/headers';
import { openDb } from './turso';
import { resolveSession, revokeSession, type Db, type SessionUser } from './auth-core';
import { isDevelopment } from './http';
import { flushCounters } from './quota.ts';
import { resoudreVueTest } from './vue-test-cookie';

export { isDevelopment };

export const SESSION_COOKIE = 'davar_session';

/**
 * Secret servant de sel factice déterministe : il rend une adresse inconnue
 * indiscernable d'une adresse existante (anti-énumération des comptes).
 * Hors développement, aucune valeur de repli : mieux vaut refuser proprement.
 */
export function paramsSecret(): string | null {
  const secret = process.env.AUTH_PARAMS_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (isDevelopment()) return 'secret-de-developpement-pour-le-sel-factice-non-secret';
  return null;
}
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

/**
 * Session courante.
 *   - `user`   : la personne EFFECTIVE — le compte de test quand une vue test est ouverte ;
 *   - `reel`   : la personne réellement connectée, toujours elle-même ;
 *   - `vueTest`: le compte de test affiché, ou null.
 * Les écrans du campus s'affichent avec `user` ; tout ce qui touche aux droits (Espace
 * Direction, actions réservées) lit `reel`, afin que le propriétaire « garde ses droits »
 * pendant une vue test, exactement comme le prototype le promettait.
 */
export type ActiveSession = {
  user: SessionUser;
  reel: SessionUser;
  vueTest: SessionUser | null;
  token: string;
  db: Db;
};

/** Session courante ou null. Aucune exception ne fuit vers la page appelante. */
export async function currentSession(): Promise<ActiveSession | null> {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const db = await openDb();
    // Vidage des compteurs de quota accumulés (1 écriture Turso pour N requêtes).
    await flushCounters(db);
    const reel = await resolveSession(db, token);
    if (!reel) return null;
    // La vue test n'est résolue que pour le propriétaire : pour tout autre compte, le
    // cookie est ignoré — les comptes de test restent invisibles au reste du monde.
    const vueTest = await resoudreVueTest(db, reel);
    return { user: vueTest ?? reel, reel, vueTest, token, db };
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
