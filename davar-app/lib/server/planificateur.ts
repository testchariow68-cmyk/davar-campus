/**
 * LE ROBOT DU DIMANCHE — ce que la plateforme fait toute seule.
 *
 * Deux tâches, et rien d'autre :
 *   1. la motivation du dimanche. Le propriétaire charge son stock depuis son
 *      espace, la plateforme les distribue une par une, dans l'ordre. Aucune
 *      intervention, aucun bouton à presser le dimanche matin.
 *   2. l'envoi des notifications en attente, par petits lots : un Worker
 *      gratuit ne peut pas ouvrir cinquante connexions d'un coup.
 *
 * Toute l'intelligence du calendrier tient dans une seule ligne écrite en
 * base : la date du dernier envoi. Tant qu'elle a moins de six jours, la
 * motivation ne repart pas — même si le robot passe quinze fois dans la
 * journée.
 */
import type { Db } from './auth-core.ts';
import { envoyerMotivation } from './motivations.ts';
import { pousserNotifications, LOT_ENVOI } from './push.ts';

const JOUR_MS = 24 * 60 * 60 * 1000;
const CLE_DERNIER_ENVOI = 'motivations.dernier_envoi_ms';
/** Heure d'envoi, en heure du serveur (un Worker compte en UTC). */
export const HEURE_DU_DIMANCHE = 9;

function entier(valeur: unknown): number {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return valeur;
  if (typeof valeur === 'bigint') return Number(valeur);
  const nombre = Number(valeur);
  return Number.isFinite(nombre) ? nombre : 0;
}

/** Dimanche, à partir de 9 h, heure du serveur. */
export function estLeMomentDuDimanche(maintenant = Date.now()): boolean {
  const date = new Date(maintenant);
  return date.getUTCDay() === 0 && date.getUTCHours() >= HEURE_DU_DIMANCHE;
}

export type Rapport = {
  motivation: { ok: boolean; numero: number; envoyees: number; restantes: number } | null;
  push: { envoyees: number; echecs: number; abonnementsRetires: number };
};

async function lireDernierEnvoi(db: Db): Promise<number> {
  const lignes = await db.execute({
    sql: 'SELECT value FROM app_settings WHERE key = ?',
    args: [CLE_DERNIER_ENVOI],
  });
  return entier(lignes.rows[0]?.value);
}

async function ecrireDernierEnvoi(db: Db, maintenant: number): Promise<void> {
  await db.execute({
    sql: `INSERT INTO app_settings(key, value, updated_at_ms) VALUES (?,?,?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms`,
    args: [CLE_DERNIER_ENVOI, String(maintenant), maintenant],
  });
}

/** Une passe du robot. Elle peut être appelée souvent : elle se limite elle-même. */
export async function tachesPlanifiees(db: Db, maintenant = Date.now()): Promise<Rapport> {
  let motivation: Rapport['motivation'] = null;

  if (estLeMomentDuDimanche(maintenant) && maintenant - (await lireDernierEnvoi(db)) > 6 * JOUR_MS) {
    const envoi = await envoyerMotivation(db, maintenant);
    if (envoi.ok) {
      await ecrireDernierEnvoi(db, maintenant);
      motivation = {
        ok: true,
        numero: envoi.numero,
        envoyees: envoi.envoyees,
        restantes: envoi.restantes,
      };
    } else {
      motivation = { ok: false, numero: 0, envoyees: 0, restantes: 0 };
    }
  }

  const push = await pousserNotifications(db, LOT_ENVOI, maintenant);
  return { motivation, push };
}
