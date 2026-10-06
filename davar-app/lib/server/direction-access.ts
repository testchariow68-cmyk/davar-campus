/**
 * Verrou d'entrée de l'Espace Direction : réservé au propriétaire.
 * Un membre du staff n'a pas le rôle « admin » et se voit refuser, côté serveur —
 * jamais côté navigateur, où le contrôle serait contournable.
 */
import { currentSession, type ActiveSession } from './auth';
import { isSameOrigin, jsonNoStore } from './http';

export type Verrou = { ok: true; session: ActiveSession } | { ok: false; reponse: Response };

export async function verrouProprietaire(request: Request): Promise<Verrou> {
  if (!isSameOrigin(request)) return { ok: false, reponse: jsonNoStore({ error: 'origin_refused' }, 403) };
  const session = await currentSession();
  if (!session) return { ok: false, reponse: jsonNoStore({ error: 'unauthenticated' }, 401) };
  if (session.user.role !== 'admin') return { ok: false, reponse: jsonNoStore({ error: 'reserve_au_proprietaire' }, 403) };
  return { ok: true, session };
}

/** Même verrou pour les pages : renvoie null si l'appelant n'est pas le propriétaire. */
export async function sessionProprietaire(): Promise<ActiveSession | null> {
  const session = await currentSession().catch(() => null);
  if (!session || session.user.role !== 'admin') return null;
  return session;
}
