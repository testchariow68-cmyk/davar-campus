/**
 * L'ÉQUIPE — qui peut entrer où, et qui peut écrire quoi.
 *
 * Reprise de `staffAccess()` du prototype, qui disait noir sur blanc : « Chaque
 * membre du staff voit uniquement ce dont il a besoin. » Le propriétaire voit
 * tout ; chaque rôle ouvre un périmètre précis.
 *
 * Deux principes que ce fichier protège :
 *   1. le périmètre est calculé ICI, côté serveur, et jamais dans le navigateur ;
 *   2. un membre du staff n'écrit que là où son rôle l'autorise — le reste est
 *      refusé par la base, pas caché par l'affichage.
 *
 * Ce fichier est volontairement pur (aucun import Next) : il est ainsi testable
 * directement, et sa lecture ne dépend d'aucun cadre.
 */
import type { Db } from './auth-core';

/** Les sept rôles du prototype, dans son ordre. */
export const ROLES = ['coach', 'correcteur', 'assistant', 'contenu', 'support', 'analyste', 'manager'] as const;
export type RoleEquipe = (typeof ROLES)[number];

export const LIBELLES_ROLES: Record<RoleEquipe, string> = {
  coach: 'Coach',
  correcteur: 'Correcteur',
  assistant: 'Assistant pédagogique',
  contenu: 'Responsable de contenu',
  support: 'Support',
  analyste: 'Analyste',
  manager: 'Manager',
};

/** Les sections de l'Espace Direction, et ce que chacune ouvre. */
export const SECTIONS = [
  'accueil',
  'sante',
  'assistants',
  'badges',
  'activite',
  'formations',
  'ressources',
  'devoirs',
  'etudiants',
  'conversations',
  'avis',
  'certificats',
  'ventes',
  'cycle',
  'equipe',
  'assistant',
  'exports',
  'emails',
  'integrations',
  'reglages',
  'test',
] as const;
export type SectionDirection = (typeof SECTIONS)[number];

/**
 * Périmètre de chaque rôle, transposé du prototype :
 *
 *   coach       → etudiants, conversations, evaluations
 *   correcteur  → evaluations, conversations
 *   assistant   → etudiants, evaluations
 *   contenu     → formations, exercices
 *   support     → conversations
 *   analyste    → analytics, santé, assistants, badges, activité
 *   manager     → tout sauf la configuration, les e-mails, les exports et l'assistant
 *                 (il tient les VENTES, comme dans le prototype)
 *
 * Transposition assumée, écran par écran :
 *   - « exercices » et « évaluations » du prototype sont réunis dans DEVOIRS
 *     (même écran, même décision) ;
 *   - « responsable de contenu » gagne RESSOURCES : c'est là que vivent les
 *     livres et les audios qu'il dépose ;
 *   - « valider une réponse de l'assistant » reste au manager : c'est un geste de
 *     supervision, pas une réponse de terrain ;
 *   - l'analyste reçoit les QUATRE écrans d'analyse du prototype : Santé
 *     technique, Analyse des assistants, Badges & distinctions et Activité des
 *     étudiants — et rien d'autre.
 */
export const SECTIONS_PAR_ROLE: Record<RoleEquipe, SectionDirection[]> = {
  coach: ['etudiants', 'conversations', 'devoirs'],
  correcteur: ['devoirs', 'conversations'],
  assistant: ['etudiants', 'devoirs'],
  contenu: ['formations', 'ressources', 'devoirs'],
  support: ['conversations'],
  // Les quatre écrans d'analyse du prototype, dans son ordre.
  analyste: ['sante', 'assistants', 'badges', 'activite'],
  manager: [
    'formations',
    'ressources',
    'devoirs',
    'etudiants',
    'conversations',
    'avis',
    'certificats',
    'ventes',
    'cycle',
    'equipe',
  ],
};

/** Ce qu'un rôle peut ÉCRIRE (le reste de son périmètre est en lecture). */
export type Ecriture = 'repondre-conversation' | 'valider-conversation' | 'decider-devoir';

export const ECRITURES_PAR_ROLE: Record<RoleEquipe, Ecriture[]> = {
  coach: ['repondre-conversation'],
  correcteur: ['decider-devoir'],
  assistant: ['decider-devoir'],
  contenu: [],
  support: [],
  analyste: [],
  manager: ['repondre-conversation', 'valider-conversation', 'decider-devoir'],
};

/**
 * Un membre du staff qui n'a AUCUN rôle ne voit que « Vue d'ensemble » — c'est
 * exactement ce que fait le prototype (`return acc.length ? [''].concat(acc) : ['']`).
 */
export const SECTIONS_MINIMALES: SectionDirection[] = ['accueil'];

/** Normalise une liste de rôles reçue (formulaire, invitation, base). */
export function normaliserRoles(valeur: string | null | undefined): RoleEquipe[] {
  if (!valeur) return [];
  const vus = new Set<string>();
  return String(valeur)
    .split(/[,;]/)
    .map((morceau) => morceau.trim().toLowerCase())
    .filter((morceau) => {
      if (!(ROLES as readonly string[]).includes(morceau)) return false;
      if (vus.has(morceau)) return false;
      vus.add(morceau);
      return true;
    })
    .sort((a, b) => ROLES.indexOf(a as RoleEquipe) - ROLES.indexOf(b as RoleEquipe)) as RoleEquipe[];
}

export function rolesEnLigne(roles: RoleEquipe[]): string {
  return roles.join(',');
}

/** Toutes les sections qu'une personne peut ouvrir, à partir de ses rôles. */
export function sectionsPour(roles: RoleEquipe[]): SectionDirection[] {
  const vues = new Set<SectionDirection>(SECTIONS_MINIMALES);
  for (const role of roles) for (const section of SECTIONS_PAR_ROLE[role] ?? []) vues.add(section);
  return SECTIONS.filter((section) => vues.has(section));
}

export function peutEcrire(roles: RoleEquipe[], ecriture: Ecriture): boolean {
  return roles.some((role) => (ECRITURES_PAR_ROLE[role] ?? []).includes(ecriture));
}

export function libellesDesRoles(roles: RoleEquipe[]): string[] {
  return roles.map((role) => LIBELLES_ROLES[role]);
}

/** Les rôles marqués en base pour une personne. Le propriétaire n'en a pas besoin. */
export async function lireRoles(db: Db, userId: string): Promise<RoleEquipe[]> {
  const resultat = await db.execute({ sql: 'SELECT staff_roles FROM users WHERE id = ?', args: [userId] });
  const valeur = resultat.rows[0]?.staff_roles;
  return normaliserRoles(typeof valeur === 'string' ? valeur : '');
}
