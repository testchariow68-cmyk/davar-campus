/**
 * LES DEUX DERNIERS ÉCRANS D'ANALYSE DU PROTOTYPE : Badges & distinctions et
 * Activité des étudiants.
 *
 * Ce fichier lit la base et ne calcule rien d'approximatif. Deux règles du projet
 * y sont appliquées sans exception :
 *   1. les COMPTES DE TEST n'entrent dans aucun chiffre — ce sont des vues, pas
 *      des personnes ;
 *   2. le staff est exclu de l'activité des étudiants, comme le prototype
 *      l'écrit noir sur blanc (« staff exclu »).
 */
import type { Db } from './auth-core.ts';
import { jourDe } from './assistant.ts';

const JOUR_MS = 24 * 60 * 60 * 1000;

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : defaut;
}

function entier(valeur: unknown): number {
  const nombre = typeof valeur === 'bigint' ? Number(valeur) : Number(valeur ?? 0);
  return Number.isFinite(nombre) ? Math.trunc(nombre) : 0;
}

function instant(valeur: unknown): number | null {
  if (valeur == null) return null;
  const nombre = typeof valeur === 'bigint' ? Number(valeur) : Number(valeur);
  return Number.isFinite(nombre) && nombre > 0 ? Math.trunc(nombre) : null;
}

/* ------------------------------------------------------------------- badges */

export type LigneBadge = {
  id: string;
  etudiant: string;
  badge: string;
  formation: string | null;
  /** « auto » ou « manuel » — le mode d'attribution, tel qu'il est en base. */
  source: string;
  /** Le nom de la personne qui a attribué le badge à la main, s'il y en a une. */
  attribuePar: string | null;
  atMs: number;
};

export type BadgeSansAttribution = { id: string; nom: string; formation: string | null };

export type AnalyseBadges = {
  /** Attributions réelles, de la plus récente à la plus ancienne. */
  lignes: LigneBadge[];
  total: number;
  trenteJours: number;
  /** Nombre de badges au catalogue. */
  catalogue: number;
  /** Badges du catalogue que personne n'a encore reçus. */
  jamaisAttribues: BadgeSansAttribution[];
};

/**
 * Qui a reçu quel badge, quel jour — et ce que personne n'a encore reçu.
 * Le prototype affichait la fréquence d'attribution sur 30 jours : elle est ici.
 */
export async function analyseBadges(db: Db, maintenant = Date.now()): Promise<AnalyseBadges> {
  // `b.training_id` porte la formation quand l'attribution elle-même n'en porte
  // pas : un badge de parcours est rattaché à une formation, une récompense
  // d'équipe ne l'est pas.
  const [attributions, catalogue] = await Promise.all([
    db.execute({
      sql: `SELECT a.id, a.source, a.awarded_by, a.at_ms,
                   u.display_name AS etudiant,
                   b.name AS badge, b.training_id AS badge_formation, b.position AS badge_position,
                   COALESCE(t.title, tb.title) AS formation,
                   ab.display_name AS attribue_par
            FROM badge_awards a
            JOIN users u ON u.id = a.user_id AND u.is_test = 0
            LEFT JOIN badge_defs b ON b.id = a.badge_id
            LEFT JOIN trainings t ON t.id = a.training_id
            LEFT JOIN trainings tb ON tb.id = b.training_id
            LEFT JOIN users ab ON ab.id = a.awarded_by
            ORDER BY a.at_ms DESC, b.position LIMIT 300`,
    }),
    db.execute({
      sql: `SELECT b.id, b.name, b.position, b.training_id, tb.title AS formation,
                   (SELECT COUNT(*) FROM badge_awards a
                     JOIN users u ON u.id = a.user_id AND u.is_test = 0
                    WHERE a.badge_id = b.id) AS recus
            FROM badge_defs b
            LEFT JOIN trainings tb ON tb.id = b.training_id
            ORDER BY b.position, b.name`,
    }),
  ]);

  const lignes: LigneBadge[] = attributions.rows.map((ligne) => ({
    id: texte(ligne.id),
    etudiant: texte(ligne.etudiant, 'Étudiant supprimé'),
    badge: texte(ligne.badge, 'Badge retiré du catalogue'),
    formation: texte(ligne.formation) || null,
    source: texte(ligne.source, 'auto'),
    attribuePar: texte(ligne.attribue_par) || null,
    atMs: entier(ligne.at_ms),
  }));

  const seuil = maintenant - 30 * JOUR_MS;
  const jamaisAttribues: BadgeSansAttribution[] = catalogue.rows
    .filter((ligne) => entier(ligne.recus) === 0)
    .map((ligne) => ({
      id: texte(ligne.id),
      nom: texte(ligne.name, 'Badge sans nom'),
      formation: texte(ligne.formation) || null,
    }));

  return {
    lignes,
    total: lignes.length,
    trenteJours: lignes.filter((ligne) => ligne.atMs >= seuil).length,
    catalogue: catalogue.rows.length,
    jamaisAttribues,
  };
}

/* --------------------------------------------------------- activité étudiants */

export type LigneActivite = {
  id: string;
  nom: string;
  /** Connexions réelles sur 30 jours, comptées sur les sessions ouvertes. */
  connexionsTrenteJours: number;
  derniereConnexionMs: number | null;
  /** La plus récente de toutes les traces laissées par l'étudiant. */
  derniereActiviteMs: number | null;
  /** Questions posées à l'assistant sur 30 jours. */
  questionsTrenteJours: number;
};

export type AnalyseActivite = {
  etudiants: LigneActivite[];
  suivis: number;
  actifsTrenteJours: number;
  jamaisConnectes: number;
  /** Étudiants dont la dernière trace remonte à plus de 30 jours. */
  endormis: number;
};

/**
 * Fréquence de connexion (30 j) et dernière activité — staff et comptes de test
 * exclus, exactement comme le prototype.
 *
 * « Dernière activité » est la plus récente de ces traces : connexion, session
 * ouverte, leçon terminée, moyenne lue, devoir rendu, certificat reçu, question
 * posée à l'assistant. Un étudiant qui travaille sans se reconnecter n'est donc
 * jamais compté comme endormi.
 */
export async function analyseActivite(db: Db, maintenant = Date.now()): Promise<AnalyseActivite> {
  const seuil = maintenant - 30 * JOUR_MS;
  const premierJour = jourDe(seuil);
  const resultat = await db.execute({
    sql: `SELECT u.id, u.display_name, u.status, u.last_login_at_ms,
                 (SELECT COUNT(*) FROM sessions s
                   WHERE s.user_id = u.id AND s.created_at_ms >= ?) AS connexions_30,
                 (SELECT MAX(s.created_at_ms) FROM sessions s WHERE s.user_id = u.id) AS derniere_session,
                 (SELECT MAX(lc.completed_at_ms) FROM lesson_completions lc WHERE lc.user_id = u.id) AS derniere_lecon,
                 (SELECT MAX(mp.at_ms) FROM media_progress mp WHERE mp.user_id = u.id) AS derniere_lecture,
                 (SELECT MAX(sb.at_ms) FROM submissions sb WHERE sb.user_id = u.id) AS dernier_devoir,
                 (SELECT MAX(c.issued_at_ms) FROM certificates c WHERE c.user_id = u.id) AS dernier_certificat,
                 (SELECT MAX(ad.day) FROM assistant_user_days ad WHERE ad.user_id = u.id) AS dernier_jour_assistant,
                 (SELECT COALESCE(SUM(ad.requests), 0) FROM assistant_user_days ad
                   WHERE ad.user_id = u.id AND ad.day >= ?) AS questions_30
          FROM users u
          WHERE u.role = 'student' AND u.is_test = 0
          ORDER BY u.display_name COLLATE NOCASE`,
    args: [seuil, premierJour],
  });

  const etudiants: LigneActivite[] = resultat.rows.map((ligne) => {
    const derniereConnexion = instant(ligne.last_login_at_ms);
    const jourAssistant = texte(ligne.dernier_jour_assistant);
    // `assistant_user_days.day` est un jour (AAAA-MM-JJ) : on le ramène à son
    // instant de début pour pouvoir le comparer aux autres traces.
    const activiteAssistant = jourAssistant ? Date.parse(`${jourAssistant}T00:00:00.000Z`) : null;
    const traces = [
      derniereConnexion,
      instant(ligne.derniere_session),
      instant(ligne.derniere_lecon),
      instant(ligne.derniere_lecture),
      instant(ligne.dernier_devoir),
      instant(ligne.dernier_certificat),
      Number.isFinite(activiteAssistant) ? activiteAssistant : null,
    ].filter((valeur): valeur is number => valeur != null);
    return {
      id: texte(ligne.id),
      nom: texte(ligne.display_name, 'Étudiant supprimé'),
      connexionsTrenteJours: entier(ligne.connexions_30),
      derniereConnexionMs: derniereConnexion,
      derniereActiviteMs: traces.length ? Math.max(...traces) : null,
      questionsTrenteJours: entier(ligne.questions_30),
    };
  });

  // Ordre du prototype : l'activité la plus récente en tête, ceux qui n'ont
  // jamais rien fait à la fin.
  etudiants.sort(
    (a, b) =>
      (b.derniereActiviteMs ?? 0) - (a.derniereActiviteMs ?? 0) || a.nom.localeCompare(b.nom, 'fr')
  );

  const actifs = etudiants.filter((etudiant) => etudiant.connexionsTrenteJours > 0);
  return {
    etudiants,
    suivis: etudiants.length,
    actifsTrenteJours: actifs.length,
    jamaisConnectes: etudiants.filter((etudiant) => etudiant.derniereConnexionMs == null).length,
    endormis: etudiants.filter(
      (etudiant) => etudiant.derniereActiviteMs != null && etudiant.derniereActiviteMs < seuil
    ).length,
  };
}
