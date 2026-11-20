/**
 * LES ICÔNES, HORS ÉCRAN — le même tracé que dans la plateforme.
 *
 * Une notification poussée ne peut pas dessiner un composant : le système
 * d'exploitation veut une adresse d'image. On fabrique donc le SVG à la
 * demande, avec les tracés exacts de nos icônes (ceux de `Icon.tsx`, repris du
 * prototype), sur un fond TRANSPARENT — jamais dans une carte, jamais sur un
 * aplat. C'est ce qu'a demandé le propriétaire : « l'icône, telle qu'elle est
 * dans la plateforme ».
 */
const TRACES: Record<string, string> = {
  rw_door:
    '<path d="M4 21h16"/><path d="M7 21V5a2 2 0 012-2h6a2 2 0 012 2v16"/><path d="M12 4v17" stroke-dasharray="1.5 3.2" opacity=".7"/>',
  rw_path:
    '<path d="M4 19c3 0 4.2-3.2 7-5.2s5.8-3.4 8.6-3.6"/><circle cx="19.6" cy="9.6" r="1.5" fill="COULEUR" stroke="none"/>',
  rw_lines: '<path d="M5 20v-6M9.7 20v-8.5M14.4 20V9M19 20V6"/>',
  rw_resume:
    '<path d="M3 16h5.2"/><path d="M13.2 16H21"/><path d="M9.4 16a3.1 3.1 0 016.2 0" opacity=".6"/>',
  rw_circle: '<path d="M12 4a8 8 0 108 8"/><path d="M20 12a8 8 0 00-2.4-5.7" opacity=".4"/>',
  rw_seal:
    '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="5.6" opacity=".45"/><path d="M9.4 12.2l1.9 1.9 3.6-3.9"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="M8.4 13.6 7 21l5-2.4L17 21l-1.4-7.4"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5Z"/>',
};

/** L'or de la signature DAVAR, tel que la palette le porte. */
export const OR_SIGNATURE = '#C9A24B';

/** Le SVG d'une icône, fond transparent. Null si l'icône n'existe pas. */
export function svgIcone(nom: string, couleur: string = OR_SIGNATURE, taille = 96): string | null {
  const brut = TRACES[nom];
  if (!brut) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${taille}" height="${taille}" fill="none" stroke="${couleur}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${brut.replace(/COULEUR/g, couleur)}</svg>`;
}

/** L'adresse d'une icône, pour une notification poussée. Null si inconnue. */
export function adresseIcone(nom: string | null | undefined): string | null {
  if (typeof nom !== 'string' || nom.length === 0 || nom.length > 40) return null;
  if (!/^[a-z_]+$/.test(nom)) return null;
  if (!TRACES[nom]) return null;
  return `/icones/${nom}.svg`;
}
