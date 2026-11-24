/**
 * ANALYSE DES ASSISTANTS — ce que les assistants ont VRAIMENT fait.
 *
 * Le prototype montrait ici : qui répond, qui est en secours, combien de
 * requêtes, et les bascules entre fournisseurs. On garde la même lecture, sur
 * nos données réelles :
 *
 *   - `assistant_provider_days` : les requêtes comptées par fournisseur et par
 *     jour, et les jours où un fournisseur a été marqué ÉPUISÉ (c'est cet
 *     épuisement qui déclenche le passage au suivant) ;
 *   - `assistant_user_days` : ce que chaque étudiant a consommé, contre le
 *     plafond quotidien par personne — le seul moyen de faire tenir une offre
 *     gratuite à 3 000 étudiants ;
 *   - `conversations` : où les questions tombent, et ce qui attend encore une
 *     réponse humaine.
 *
 * Aucun secret : on dit « clé posée » ou « clé absente », jamais la clé.
 */
import { cleDisponible } from './ai-providers.ts';
import {
  chaineActive,
  etatsFournisseurs,
  FOURNISSEURS,
  limiteFournisseur,
  lireConfig,
  type Fournisseur,
} from './assistant.ts';
import type { Db } from './auth-core.ts';
import { compterEnAttente } from './echanges.ts';

export type FournisseurAnalyse = {
  provider: Fournisseur;
  nom: string;
  /** Rang dans la chaîne de secours : 1 = celui qui répond en premier. */
  position: number;
  cle: boolean;
  requetesAujourdhui: number;
  requetesTrenteJours: number;
  /** Jours (30 derniers) où le quota de ce fournisseur a été atteint. */
  joursEpuises: number;
  /** Le dernier jour où il a été marqué épuisé — la trace réelle d'une bascule. */
  dernierEpuisement: string | null;
  actif: boolean;
  /** Vrai si son quota du jour est atteint : c'est ce qui déclenche la bascule. */
  epuiseAujourdHui: boolean;
};

export type AnalyseAssistants = {
  fournisseurs: FournisseurAnalyse[];
  /** Le fournisseur qui répond en ce moment : le premier au clair dans la chaîne. */
  actif: Fournisseur | null;
  /** Ce qui a réellement déclenché une bascule aujourd'hui, en clair. */
  basculeDuJour: string;
  plafondParEtudiant: number;
  questionsAujourdhui: number;
  questionsTrenteJours: number;
  etudiantsServisAujourdhui: number;
  parJour: Array<{ jour: string; questions: number }>;
  parFormation: Array<{ formation: string; questions: number }>;
  enAttente: { coach: number; iaNonValidee: number };
  /** Les formations qui nourrissent l'assistant — et celles qui ne sont PAS encore associées. */
  baseDeConnaissances: Array<{ titre: string; associee: boolean; lecons: number; leconsAvecTexte: number }>;
};

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null;
}

function entier(valeur: unknown): number {
  const nombre = typeof valeur === 'bigint' ? Number(valeur) : Number(valeur ?? 0);
  return Number.isFinite(nombre) ? Math.trunc(nombre) : 0;
}

function jourDe(millisecondes: number): string {
  return new Date(millisecondes).toISOString().slice(0, 10);
}

export async function analyseAssistants(db: Db, maintenant = Date.now()): Promise<AnalyseAssistants> {
  const aujourdHui = jourDe(maintenant);
  const debutTrenteJours = jourDe(maintenant - 29 * 24 * 60 * 60 * 1000);

  const [config, etats, parFournisseur, totauxJour, parEtudiantJour, enAttente, parJourLignes, parFormationLignes, formationsLignes] =
    await Promise.all([
      lireConfig(db),
      etatsFournisseurs(db, aujourdHui),
      db.execute({
        sql: `SELECT provider,
                     SUM(CASE WHEN day = ? THEN requests ELSE 0 END) AS aujourd_hui,
                     SUM(requests) AS trente_jours,
                     SUM(CASE WHEN exhausted = 1 THEN 1 ELSE 0 END) AS jours_epuises,
                     MAX(CASE WHEN exhausted = 1 THEN day ELSE NULL END) AS dernier_epuisement
              FROM assistant_provider_days
              WHERE day >= ?
              GROUP BY provider`,
        args: [aujourdHui, debutTrenteJours],
      }),
      db.execute({
        sql: 'SELECT COALESCE(SUM(requests), 0) AS n, COUNT(*) AS etudiants FROM assistant_user_days WHERE day = ?',
        args: [aujourdHui],
      }),
      db.execute({
        sql: 'SELECT COALESCE(SUM(requests), 0) AS n FROM assistant_user_days WHERE day >= ?',
        args: [debutTrenteJours],
      }),
      compterEnAttente(db),
      db.execute({
        sql: `SELECT day, SUM(requests) AS n FROM assistant_user_days WHERE day >= ? GROUP BY day ORDER BY day`,
        args: [debutTrenteJours],
      }),
      db.execute(
        `SELECT COALESCE(t.title, 'Hors formation') AS formation, COUNT(*) AS n
         FROM conversations c LEFT JOIN trainings t ON t.id = c.training_id
         GROUP BY COALESCE(t.title, 'Hors formation') ORDER BY n DESC LIMIT 12`
      ),
      db.execute(
        `SELECT t.title,
                COALESCE(kb.enabled, 0) AS associee,
                COUNT(l.id) AS lecons,
                SUM(CASE WHEN l.content_text IS NOT NULL AND TRIM(l.content_text) <> '' THEN 1 ELSE 0 END) AS avec_texte
         FROM trainings t
         LEFT JOIN assistant_kb kb ON kb.training_id = t.id
         LEFT JOIN course_modules m ON m.training_id = t.id
         LEFT JOIN course_lessons l ON l.module_id = m.id
         GROUP BY t.id, t.title, associee
         ORDER BY t.title`
      ),
    ]);

  const chiffres = new Map<
    string,
    { aujourdHui: number; trenteJours: number; joursEpuises: number; dernierEpuisement: string | null }
  >();
  for (const ligne of parFournisseur.rows) {
    const provider = texte(ligne.provider);
    if (!provider) continue;
    chiffres.set(provider, {
      aujourdHui: entier(ligne.aujourd_hui),
      trenteJours: entier(ligne.trente_jours),
      joursEpuises: entier(ligne.jours_epuises),
      dernierEpuisement: texte(ligne.dernier_epuisement),
    });
  }

  // « Qui répond » n'est pas une opinion : c'est `chaineActive`, la même règle que
  // celle employée pour répondre à un étudiant. Le premier qui n'a pas épuisé son
  // quota du jour est celui qui parle ; s'il n'en reste aucun, la liste est vide.
  const chaine = chaineActive(config, etats);
  const actif = chaine.length > 0 ? chaine[0] : null;

  const fournisseurs: FournisseurAnalyse[] = [config.primaryProvider, ...config.chaine.filter((f) => f !== config.primaryProvider)]
    .filter((provider, index, liste) => liste.indexOf(provider) === index && provider in FOURNISSEURS)
    .map((provider, index) => {
      const valeurs = chiffres.get(provider);
      const etat = etats[provider];
      const epuise = etat?.exhausted === true || (etat !== undefined && etat.requests >= limiteFournisseur(config, provider));
      return {
        provider,
        nom: FOURNISSEURS[provider].nom,
        position: index + 1,
        cle: cleDisponible(provider),
        requetesAujourdhui: valeurs?.aujourdHui ?? etat?.requests ?? 0,
        requetesTrenteJours: valeurs?.trenteJours ?? 0,
        joursEpuises: valeurs?.joursEpuises ?? 0,
        dernierEpuisement: valeurs?.dernierEpuisement ?? null,
        actif: actif === provider,
        epuiseAujourdHui: epuise,
      };
    });

  const basculeDuJour = (() => {
    const epuises = fournisseurs.filter((fournisseur) => fournisseur.epuiseAujourdHui).map((fournisseur) => fournisseur.nom);
    if (epuises.length === 0) {
      return actif
        ? `Aucune bascule aujourd’hui : ${FOURNISSEURS[actif].nom} répond normalement.`
        : 'Aucune bascule aujourd’hui — et aucune clé posée : le campus transmet la question au coach.';
    }
    return actif
      ? `Quota atteint chez ${epuises.join(', ')} → c’est ${FOURNISSEURS[actif].nom} qui prend le relais.`
      : `Quota atteint chez ${epuises.join(', ')} : plus aucun fournisseur disponible aujourd’hui.`;
  })();

  return {
    fournisseurs,
    actif,
    basculeDuJour,
    plafondParEtudiant: config.studentDailyCap,
    questionsAujourdhui: entier(totauxJour.rows[0]?.n),
    questionsTrenteJours: entier(parEtudiantJour.rows[0]?.n),
    etudiantsServisAujourdhui: entier(totauxJour.rows[0]?.etudiants),
    parJour: parJourLignes.rows.map((ligne) => ({
      jour: texte(ligne.day) ?? '',
      questions: entier(ligne.n),
    })),
    parFormation: parFormationLignes.rows.map((ligne) => ({
      formation: texte(ligne.formation) ?? 'Hors formation',
      questions: entier(ligne.n),
    })),
    enAttente,
    baseDeConnaissances: formationsLignes.rows.map((ligne) => ({
      titre: texte(ligne.title) ?? 'Formation',
      associee: entier(ligne.associee) === 1,
      lecons: entier(ligne.lecons),
      leconsAvecTexte: entier(ligne.avec_texte),
    })),
  };
}
