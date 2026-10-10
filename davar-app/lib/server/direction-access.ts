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
import { lireRoles, peutEcrire, sectionsPour, type Ecriture, type SectionDirection } from './equipe.ts';
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

/**
 * ACCÈS DE L'ÉQUIPE — un membre du staff n'entre que dans son périmètre.
 *
 * Le contrôle est fait ici, côté serveur, à chaque chargement de page : même en
 * tapant l'adresse à la main, un coach n'ouvre pas les réglages. Le propriétaire,
 * lui, ouvre tout.
 */
export async function sessionSection(section: SectionDirection): Promise<ActiveSession | null> {
  const session = await currentSession().catch(() => null);
  if (!session) return null;
  if (session.reel.role === 'admin') return session;
  if (session.reel.role !== 'staff') return null;
  const roles = await lireRoles(session.db, session.reel.id);
  return sectionsPour(roles).includes(section) ? session : null;
}

/** La personne réelle est-elle un membre du staff (et non le propriétaire) ? */
export function estMembreEquipe(session: ActiveSession): boolean {
  return session.reel.role === 'staff';
}

/**
 * Verrou d'ÉCRITURE : le propriétaire écrit partout ; un membre du staff n'écrit
 * que là où ses rôles l'autorisent. Le refus est explicite — jamais silencieux.
 */
export async function verrouEcriture(request: Request, ecriture: Ecriture): Promise<Verrou> {
  if (!isSameOrigin(request)) return { ok: false, reponse: jsonNoStore({ error: 'origin_refused' }, 403) };
  const session = await currentSession();
  if (!session) return { ok: false, reponse: jsonNoStore({ error: 'unauthenticated' }, 401) };
  if (session.reel.role === 'admin') return { ok: true, session };
  if (session.reel.role !== 'staff') {
    return { ok: false, reponse: jsonNoStore({ error: 'reserve_au_proprietaire' }, 403) };
  }
  const roles = await lireRoles(session.db, session.reel.id);
  if (!peutEcrire(roles, ecriture)) {
    return { ok: false, reponse: jsonNoStore({ error: 'reserve_a_un_autre_role' }, 403) };
  }
  return { ok: true, session };
}

/** Le propriétaire, ou un manager : les gestes de supervision. */
export async function verrouSupervision(request: Request): Promise<Verrou> {
  const verrou = await verrouEcriture(request, 'valider-conversation');
  return verrou;
}
