/**
 * MOTIVATIONS — le stock numéroté du propriétaire, et le rendez-vous du dimanche.
 *
 * Porté de `saveMotivations()` / `sendMotivationNow()` du prototype :
 *   - il colle une liste numérotée (1. 2. 3. …) ; les numéros déjà pris sont
 *     refusés, les autres lignes prennent le numéro suivant libre ;
 *   - retirer une motivation RECALE les numéros suivants : la série reste continue ;
 *   - une nouvelle liste peut être enregistrée d'avance : elle prendra le relais
 *     quand la liste active sera épuisée ;
 *   - l'envoi se fait À LA MAIN, le dimanche — jamais tout seul, et jamais deux
 *     fois la même motivation ;
 *   - quand il reste dix motivations, le propriétaire est prévenu.
 *
 * Décision du propriétaire : « motivations = Sunday push only ». Ici, la
 * motivation du dimanche arrive comme une notification dans son campus ; la
 * plateforme ne prétend pas envoyer de notification système.
 */
import type { Db } from './auth-core.ts';
import { notifier } from './notifications.ts';
import { MOTIVATIONS_DEFAUT } from './settings.ts';

export const CLE_LISTE = 'motivations.liste';
export const CLE_INDEX = 'motivations.index';
export const CLE_SUIVANTE = 'motivations.suivante';
export const SEUIL_ALERTE = 10;

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function lireNombre(valeur: unknown, defaut = 0): number {
  const nombre = Number(texte(valeur));
  return Number.isFinite(nombre) && nombre >= 0 ? Math.trunc(nombre) : defaut;
}

function lireListe(valeur: unknown): string[] {
  if (typeof valeur !== 'string' || valeur.length === 0) return [];
  try {
    const analyse = JSON.parse(valeur) as unknown;
    if (!Array.isArray(analyse)) return [];
    return analyse.filter((ligne): ligne is string => typeof ligne === 'string' && ligne.trim().length > 0).slice(0, 500);
  } catch {
    return [];
  }
}

async function ecrire(db: Db, cle: string, valeur: string, maintenant: number): Promise<void> {
  await db.execute({
    sql: `INSERT INTO app_settings(key, value, updated_at_ms) VALUES (?,?,?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms`,
    args: [cle, valeur, maintenant],
  });
}

export type EtatMotivations = {
  liste: string[];
  index: number;
  suivante: string[];
  restantes: number;
  courante: string;
  epuisee: boolean;
  prochainDimancheMs: number;
};

export async function lireMotivations(db: Db, maintenant = Date.now()): Promise<EtatMotivations> {
  let valeurs: Record<string, string> = {};
  try {
    const lignes = await db.execute({
      sql: 'SELECT key, value FROM app_settings WHERE key IN (?,?,?)',
      args: [CLE_LISTE, CLE_INDEX, CLE_SUIVANTE],
    });
    for (const row of lignes.rows) {
      const cle = texte(row.key);
      if (cle) valeurs[cle] = texte(row.value);
    }
  } catch {
    valeurs = {};
  }

  const liste = lireListe(valeurs[CLE_LISTE]);
  const effective = liste.length > 0 ? liste : MOTIVATIONS_DEFAUT;
  const index = Math.min(lireNombre(valeurs[CLE_INDEX], 0), effective.length);
  const suivante = lireListe(valeurs[CLE_SUIVANTE]);
  const restantes = Math.max(0, effective.length - index);
  return {
    liste: effective,
    index,
    suivante,
    restantes,
    // Le prototype affiche la motivation courante, et la fait tourner à la fin.
    courante: effective[index % Math.max(1, effective.length)] ?? effective[0] ?? '',
    epuisee: restantes === 0 && suivante.length === 0,
    prochainDimancheMs: prochainDimanche(maintenant),
  };
}

/** Le prochain dimanche (0 h, heure locale du serveur). */
export function prochainDimanche(maintenant = Date.now()): number {
  const date = new Date(maintenant);
  const jour = date.getDay();
  const reste = jour === 0 ? 0 : 7 - jour;
  const cible = new Date(date.getFullYear(), date.getMonth(), date.getDate() + reste, 0, 0, 0, 0);
  if (reste === 0 && cible.getTime() < maintenant) cible.setDate(cible.getDate() + 7);
  return cible.getTime();
}

export type ResultatListe = { ok: true; ajoutees: number; total: number; conflits: number[] } | { ok: false; erreur: string };

/**
 * Ajouter une liste collée. Les lignes « 4. texte » respectent leur numéro ;
 * une ligne sans numéro prend le premier numéro libre. Un numéro déjà pris est
 * signalé — jamais écrasé en silence.
 */
export function analyserListe(brut: string): { entrees: Array<{ numero: number | null; texte: string }> } {
  const entrees = brut
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter(Boolean)
    .map((ligne) => {
      const trouve = ligne.match(/^(\d+)\s*[.)\-–:]\s*(.+)$/);
      return trouve ? { numero: Number(trouve[1]), texte: trouve[2].trim() } : { numero: null, texte: ligne };
    })
    .filter((entree) => entree.texte.length > 0)
    .slice(0, 500);
  return { entrees };
}

export async function ajouterMotivations(db: Db, brut: string, maintenant = Date.now()): Promise<ResultatListe> {
  const { entrees } = analyserListe(brut);
  if (entrees.length === 0) return { ok: false, erreur: 'liste_vide' };

  const etat = await lireMotivations(db, maintenant);
  const liste = etat.liste.slice();
  const utilises = new Set(liste.map((_, position) => position + 1));
  const conflits: number[] = [];
  const ajouts: Array<{ position: number; texte: string }> = [];
  let prochain = liste.length + 1;
  let ajoutees = 0;

  for (const entree of entrees) {
    if (entree.numero !== null) {
      if (utilises.has(entree.numero)) {
        conflits.push(entree.numero);
        continue;
      }
      utilises.add(entree.numero);
      ajouts.push({ position: entree.numero, texte: entree.texte.slice(0, 240) });
    } else {
      while (utilises.has(prochain)) prochain += 1;
      utilises.add(prochain);
      ajouts.push({ position: prochain, texte: entree.texte.slice(0, 240) });
      prochain += 1;
    }
    ajoutees += 1;
  }
  if (conflits.length > 0) return { ok: false, erreur: `numeros_deja_utilises:${conflits.join(',')}` };
  if (ajoutees === 0) return { ok: false, erreur: 'liste_vide' };

  for (const ajout of ajouts) liste[ajout.position - 1] = ajout.texte;
  const propre = liste.map((ligne) => ligne ?? '').filter((ligne) => ligne.length > 0);
  await ecrire(db, CLE_LISTE, JSON.stringify(propre), maintenant);
  await ecrire(db, CLE_INDEX, String(Math.min(etat.index, propre.length)), maintenant);
  return { ok: true, ajoutees, total: propre.length, conflits: [] };
}

/** Retirer une motivation : les numéros suivants se recalent, comme le prototype. */
export async function retirerMotivation(db: Db, numero: number, maintenant = Date.now()): Promise<boolean> {
  const etat = await lireMotivations(db, maintenant);
  if (numero < 1 || numero > etat.liste.length) return false;
  const liste = etat.liste.slice();
  liste.splice(numero - 1, 1);
  const nouvelIndex = etat.index > numero - 1 ? Math.max(0, etat.index - 1) : etat.index;
  await ecrire(db, CLE_LISTE, JSON.stringify(liste), maintenant);
  await ecrire(db, CLE_INDEX, String(Math.min(nouvelIndex, liste.length)), maintenant);
  return true;
}

/** Remplacer la liste : active tout de suite si la précédente est épuisée, sinon en attente. */
export async function remplacerListe(
  db: Db,
  brut: string,
  maintenant = Date.now()
): Promise<{ ok: boolean; active: boolean; total: number }> {
  const { entrees } = analyserListe(brut);
  if (entrees.length === 0) return { ok: false, active: false, total: 0 };
  const liste = entrees.map((entree) => entree.texte.slice(0, 240));
  const etat = await lireMotivations(db, maintenant);
  if (etat.restantes === 0) {
    await ecrire(db, CLE_LISTE, JSON.stringify(liste), maintenant);
    await ecrire(db, CLE_INDEX, '0', maintenant);
    await ecrire(db, CLE_SUIVANTE, '', maintenant);
    return { ok: true, active: true, total: liste.length };
  }
  await ecrire(db, CLE_SUIVANTE, JSON.stringify(liste), maintenant);
  return { ok: true, active: false, total: liste.length };
}

export type EnvoiMotivation = {
  ok: boolean;
  numero: number;
  envoyees: number;
  restantes: number;
  message: string;
  motivationSuivante: string;
};

/**
 * ENVOYER LA MOTIVATION DU DIMANCHE — à la main, jamais deux fois la même.
 * Si la liste active est épuisée, la liste enregistrée d'avance prend le relais.
 */
export async function envoyerMotivation(
  db: Db,
  maintenant = Date.now()
): Promise<EnvoiMotivation> {
  let etat = await lireMotivations(db, maintenant);
  if (etat.restantes === 0 && etat.suivante.length > 0) {
    await ecrire(db, CLE_LISTE, JSON.stringify(etat.suivante), maintenant);
    await ecrire(db, CLE_INDEX, '0', maintenant);
    await ecrire(db, CLE_SUIVANTE, '', maintenant);
    etat = await lireMotivations(db, maintenant);
  }
  if (etat.liste.length === 0 || etat.restantes === 0) {
    return {
      ok: false,
      numero: 0,
      envoyees: 0,
      restantes: 0,
      message: 'Tout le stock numéroté a déjà été envoyé. Enregistrez une nouvelle liste.',
      motivationSuivante: '',
    };
  }

  const numero = etat.index + 1;
  const motivation = etat.liste[etat.index];
  const etudiants = await db.execute(
    "SELECT id FROM users WHERE role = 'student' AND status = 'active' AND is_test = 0"
  );
  let envoyees = 0;
  for (const row of etudiants.rows) {
    const userId = texte(row.id);
    if (!userId) continue;
    await notifier(
      db,
      { userId, kind: 'encouragement', titre: 'Votre motivation de la semaine', corps: motivation, route: '/campus' },
      maintenant
    );
    envoyees += 1;
  }

  await ecrire(db, CLE_INDEX, String(etat.index + 1), maintenant);
  const restantes = Math.max(0, etat.liste.length - (etat.index + 1));

  if (restantes <= SEUIL_ALERTE) {
    const proprietaire = await db.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    const adminId = texte(proprietaire.rows[0]?.id);
    if (adminId) {
      await notifier(
        db,
        {
          userId: adminId,
          kind: 'system',
          titre: 'Stock de motivations presque épuisé',
          corps: `Il reste ${restantes} motivation(s) : pensez à en ajouter.`,
          route: '/direction/reglages',
        },
        maintenant
      );
    }
  }

  return {
    ok: true,
    numero,
    envoyees,
    restantes,
    message: `Motivation n° ${numero} envoyée à ${envoyees} étudiant(s).`,
    motivationSuivante: etat.liste[etat.index + 1] ?? '',
  };
}
