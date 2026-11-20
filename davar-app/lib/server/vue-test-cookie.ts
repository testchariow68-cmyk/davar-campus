/**
 * Lecture et écriture du cookie de vue test — le seul endroit qui parle à Next.
 * La logique (qui a le droit, quelle cible est légitime) vit dans ./vue-test, testable
 * sans Next ; ici on ne fait que lire et poser le cookie.
 */
import { cookies } from 'next/headers';
import type { Db, SessionUser } from './auth-core';
import { isDevelopment } from './http';
import { COOKIE_VUE_TEST, cibleAutorisee, peutTesterUneVue } from './vue-test';

/** Le compte de test ouvert par la personne réelle, s'il y en a un — sinon null. */
export async function resoudreVueTest(db: Db, reel: SessionUser): Promise<SessionUser | null> {
  if (!peutTesterUneVue(reel)) return null;
  try {
    const jar = await cookies();
    const cibleId = jar.get(COOKIE_VUE_TEST)?.value;
    if (!cibleId) return null;
    return await cibleAutorisee(db, reel, cibleId);
  } catch {
    return null;
  }
}

export async function ouvrirVueTest(cibleId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_VUE_TEST, cibleId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isDevelopment(),
    path: '/',
  });
}

export async function fermerVueTest(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_VUE_TEST, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isDevelopment(),
    path: '/',
    maxAge: 0,
  });
}
