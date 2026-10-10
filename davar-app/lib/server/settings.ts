/**
 * RÉGLAGES DU CAMPUS — les valeurs réelles du propriétaire, jamais en dur.
 *
 * Les valeurs par défaut sont celles de son prototype (`data.js`, `settings`) :
 * ses contacts d'aide, ses adresses d'e-mail, ses réseaux, ses motivations du
 * dimanche. Elles sont modifiables depuis son espace et rangées en base.
 */
import type { Db } from './auth-core';

export const REGLAGES_DEFAUT = {
  'support.whatsapp': 'https://wa.me/message/CGJIVYULI4QKN1',
  'support.phone': '+225 0585375999',
  'support.email': 'support.davaracademie@gmail.com',
  'emails.support': 'support@davarcampus.co',
  'emails.direction': 'direction@davarcampus.co',
  'social.instagram': 'https://instagram.com/davaracademie',
  'social.tiktok': 'https://tiktok.com/@davaracademie',
  'social.facebook': 'https://facebook.com/davaracademie',
  'announce.text': '',
  'announce.active': '0',
} as const;

export type CleReglage = keyof typeof REGLAGES_DEFAUT;
export type Reglages = Record<string, string>;

export const MOTIVATIONS_DEFAUT: string[] = [
  'La parole est une arme : apprends à la viser juste.',
  'Ce n’est pas le talent qui brille, c’est la constance.',
  'Un orateur ne naît pas, il se construit — module après module.',
  'Ta voix porte plus loin que tes doutes.',
  'Chaque dimanche, une marche de plus vers ton excellence.',
  'Le trac est la preuve que tu es vivant : utilise-le.',
  'Parle peu, dis vrai, frappe juste.',
  'Ton histoire mérite d’être entendue : entraîne-toi.',
  'La discipline bat la motivation quand la motivation s’endort.',
  'Écoute deux fois, parle une fois, prépare-toi dix fois.',
];

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null;
}

/** Tous les réglages, valeurs de repli comprises : l'application n'affiche jamais un trou. */
export async function lireReglages(db: Db): Promise<Reglages> {
  const reglages: Reglages = { ...REGLAGES_DEFAUT };
  try {
    const lignes = await db.execute('SELECT key, value FROM app_settings');
    for (const row of lignes.rows) {
      const cle = texte(row.key);
      const valeur = texte(row.value);
      if (cle && valeur !== null) reglages[cle] = valeur;
    }
  } catch {
    /* table absente sur une base ancienne : les valeurs par défaut suffisent */
  }
  return reglages;
}

export async function ecrireReglages(db: Db, entrees: Record<string, string>, maintenant = Date.now()): Promise<number> {
  let ecrites = 0;
  for (const [cle, valeur] of Object.entries(entrees)) {
    if (typeof cle !== 'string' || cle.length === 0 || cle.length > 60) continue;
    if (typeof valeur !== 'string' || valeur.length > 600) continue;
    await db.execute({
      sql: `INSERT INTO app_settings(key, value, updated_at_ms) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms`,
      args: [cle, valeur, maintenant],
    });
    ecrites += 1;
  }
  return ecrites;
}

/** Des liens de réseaux propres : le prototype exige du https réel. */
export function lienSocialValide(lien: string): boolean {
  try {
    const url = new URL(lien);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
