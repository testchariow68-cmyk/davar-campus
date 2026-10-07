/**
 * Verrou d'entrée de l'Espace Direction : réservé au propriétaire.
 * Un membre du staff n'a pas le rôle « admin » et se voit refuser, côté serveur —
 * jamais côté navigateur, où le contrôle serait contournable.
 *
 * La vérification porte sur la personne RÉELLE (`session.reel`) et non sur le compte
 * affiché : pendant une vue test, le propriétaire garde donc tous ses droits, comme le
 * prototype l'annonce — « Vous gardez vos droits : Échap ou Quitter pour revenir ».
 */
import { currentSession, type ActiveSession } from './auth';
import { isSameOrigin, jsonNoStore } from './http';

export type Verrou = { ok: true; session: ActiveSession } | { ok: false; reponse: Response };

export async function verrouProprietaire(request: Request): Promise<Verrou> {
  if (!isSameOrigin(request)) return { ok: false, reponse: jsonNoStore({ error: 'origin_refused' }, 403) };
  const session = await currentSession();
  if (!session) return { ok: false, reponse: jsonNoStore({ error: 'unauthenticated' }, 401) };
  if (session.reel.role !== 'admin') return { ok: false, reponse: jsonNoStore({ error: 'reserve_au_proprietaire' }, 403) };
  return { ok: true, session };
}

/** Même verrou pour les pages : renvoie null si l'appelant n'est pas le propriétaire. */
export async function sessionProprietaire(): Promise<ActiveSession | null> {
  const session = await currentSession().catch(() => null);
  if (!session || session.reel.role !== 'admin') return null;
  return session;
}
