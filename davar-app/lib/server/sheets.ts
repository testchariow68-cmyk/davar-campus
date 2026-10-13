/**
 * GOOGLE SHEETS — par le relais Apps Script du propriétaire.
 *
 * Aucune clé Google n'est demandée, aucun compte de service : il dépose l'adresse
 * de son propre script, et la plateforme lui envoie les lignes. C'est exactement
 * le montage décrit dans ses documents (« Google Sheets sync — clé API dédiée »),
 * réalisé de la façon la plus simple et la moins coûteuse.
 *
 * Rien ne part sans son geste : l'envoi est déclenché à la main depuis son espace.
 */
import type { Db } from './auth-core';
import { construireExport, LIBELLES_EXPORT, type TypeExport } from './exports.ts';

export const CLE_URL_SHEETS = 'sheets.url';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

/** Une adresse de script Google, et rien d'autre. */
export function urlSheetsValide(url: string): boolean {
  const propre = (url ?? '').trim();
  if (propre.length === 0 || propre.length > 500) return false;
  try {
    const analyse = new URL(propre);
    if (analyse.protocol !== 'https:') return false;
    return /(^|\.)script\.google\.com$/.test(analyse.hostname) || /(^|\.)googleusercontent\.com$/.test(analyse.hostname);
  } catch {
    return false;
  }
}

export type ResultatSheets = { ok: boolean; lignes?: number; message: string };

/**
 * Envoie une table au script du proprietaire. Le corps est du JSON simple :
 * { feuille, entetes, lignes }. Son script décide quoi en faire.
 */
export async function envoyerVersSheets(
  db: Db,
  options: { url: string; kind: TypeExport; fetchImpl?: typeof fetch }
): Promise<ResultatSheets> {
  if (!urlSheetsValide(options.url)) {
    return { ok: false, message: "L'adresse du script Google n'est pas valide (elle doit commencer par https://script.google.com)." };
  }
  const table = await construireExport(db, options.kind);
  if (table.entetes.length === 0) return { ok: false, message: 'Aucune donnée à envoyer.' };

  const appel = options.fetchImpl ?? fetch;
  try {
    const reponse = await appel(options.url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        feuille: LIBELLES_EXPORT[options.kind],
        entetes: table.entetes,
        lignes: table.lignes,
        envoyeLe: new Date().toISOString(),
      }),
    });
    if (!reponse.ok) return { ok: false, message: `Le script a répondu HTTP ${reponse.status}.` };
    return { ok: true, lignes: table.lignes.length, message: `${table.lignes.length} ligne(s) envoyée(s) vers « ${LIBELLES_EXPORT[options.kind]} ».` };
  } catch {
    return { ok: false, message: 'Le script Google n’a pas répondu. Vérifiez que le déploiement autorise les requêtes.' };
  }
}

/** L'adresse enregistrée, si elle existe. */
export async function urlSheetsEnregistree(db: Db): Promise<string> {
  try {
    const ligne = await db.execute({ sql: 'SELECT value FROM app_settings WHERE key = ?', args: [CLE_URL_SHEETS] });
    return texte(ligne.rows[0]?.value);
  } catch {
    return '';
  }
}
