/**
 * APPARENCE DU CAMPUS — la palette choisie par le propriétaire.
 *
 * Le prototype l'annonce ainsi : « Palette du campus — toute la plateforme
 * change (clair et sombre, chez tous les utilisateurs) ». Le choix est donc
 * rangé en base, pas dans un navigateur : il vaut pour tout le monde.
 */
import type { Db } from './turso.ts';
import {
  COULEURS_DEFAUT,
  PALETTE_DEFAUT,
  couleursPersonnalisees,
  paletteValide,
  type CouleursPersonnalisees,
} from '../palette.ts';

export const CLE_PALETTE = 'apparence.palette';
export const CLE_COULEURS = 'apparence.couleurs';

export type Apparence = { palette: string; couleurs: CouleursPersonnalisees };

export const APPARENCE_DEFAUT: Apparence = { palette: PALETTE_DEFAUT, couleurs: { ...COULEURS_DEFAUT } };

/**
 * Lit la palette choisie. Une base absente ou un réglage illisible ne cassent
 * rien : on retombe sur la signature DAVAR.
 */
export async function apparenceChoisie(db: Db): Promise<Apparence> {
  try {
    const lignes = await db.execute({
      sql: 'SELECT key, value FROM app_settings WHERE key IN (?, ?)',
      args: [CLE_PALETTE, CLE_COULEURS],
    });
    const valeurs: Record<string, string> = {};
    for (const row of lignes.rows) {
      const cle = typeof row.key === 'string' ? row.key : '';
      const valeur = typeof row.value === 'string' ? row.value : '';
      if (cle) valeurs[cle] = valeur;
    }
    const palette = paletteValide(valeurs[CLE_PALETTE]) ? valeurs[CLE_PALETTE] : PALETTE_DEFAUT;
    return { palette, couleurs: couleursPersonnalisees(valeurs[CLE_COULEURS]) };
  } catch {
    return { ...APPARENCE_DEFAUT, couleurs: { ...COULEURS_DEFAUT } };
  }
}

/** Le réglage d'apparence, tel qu'il peut être enregistré — ou null si invalide. */
export function apparenceDepuisReglage(entrees: Record<string, unknown>): Apparence | null {
  if (!(CLE_PALETTE in entrees)) return null;
  if (!paletteValide(entrees[CLE_PALETTE])) return null;
  const couleurs = couleursPersonnalisees(entrees[CLE_COULEURS]);
  return { palette: entrees[CLE_PALETTE] as string, couleurs };
}
