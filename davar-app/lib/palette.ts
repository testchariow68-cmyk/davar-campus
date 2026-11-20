/**
 * PALETTES DU CAMPUS — les couleurs de DAVAR ACADÉMIE, et rien d'autre.
 *
 * Porté fidèlement de `js/views-admin.js` du prototype : mêmes identifiants,
 * mêmes libellés, mêmes couleurs. La signature violet & or reste le défaut ;
 * les autres palettes ne s'appliquent QUE si le propriétaire les choisit.
 *
 * Ce module est PUR : il ne touche ni au réseau, ni à la base, ni à Next.
 * Il sert au serveur (lecture du réglage) comme au navigateur (aperçu immédiat).
 */

export type Palette = { p: string; s: string; a: string };

export const PALETTE_DEFAUT = 'violet';

/** Les palettes nommées, telles que le prototype les définit. */
export const PALETTES: Record<string, { label: string; p: string; s: string; a: string }> = {
  violet: { label: 'Violet & Or (signature DAVAR)', p: '#6D28D9', s: '#8B5CF6', a: '#C9A24B' },
  indigo: { label: 'Indigo & Or', p: '#4338CA', s: '#6366F1', a: '#C9A24B' },
  foret: { label: 'Vert forêt & Or', p: '#166534', s: '#22A05A', a: '#C9A24B' },
  bordeaux: { label: 'Bordeaux & Or', p: '#9F1239', s: '#E11D48', a: '#C9A24B' },
  ocean: { label: 'Bleu océan & Cuivre', p: '#0E5A8A', s: '#1E88C7', a: '#B87333' },
  prune: { label: 'Prune & Argent', p: '#6B21A8', s: '#A855F7', a: '#9CA3AF' },
  olive: { label: 'Olive & Terracotta', p: '#4D5D2A', s: '#7A8B3F', a: '#C4652E' },
  nuit: { label: 'Encre & Émeraude', p: '#1F2937', s: '#374151', a: '#10B981' },
};

/** Les quatre palettes mises en avant dans les documents du propriétaire. */
export const PALETTES_PRINCIPALES = ['violet', 'indigo', 'foret', 'bordeaux'];

export function paletteNommeeValide(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PALETTES, id);
}

/** L'identifiant du réglage : un nom de palette, ou « custom ». */
export function paletteValide(id: unknown): boolean {
  return typeof id === 'string' && (id === 'custom' || paletteNommeeValide(id));
}

export function couleurValide(valeur: unknown): boolean {
  return typeof valeur === 'string' && /^#[0-9a-fA-F]{6}$/.test(valeur);
}

/** La couleur, ou le défaut : jamais autre chose qu'un #RRGGBB valide. */
export function couleurOuDefaut(valeur: unknown, defaut: string): string {
  // On ne transforme pas ce que le propriétaire a écrit : on recopie, tel quel.
  return typeof valeur === 'string' && couleurValide(valeur) ? valeur : defaut;
}

export type CouleursPersonnalisees = { p: string; s: string; a: string; grad: boolean };

export const COULEURS_DEFAUT: CouleursPersonnalisees = { p: '#6D28D9', s: '#8B5CF6', a: '#C9A24B', grad: false };

/** Relit les couleurs personnalisées rangées en réglage (JSON tolérant). */
export function couleursPersonnalisees(valeur: unknown): CouleursPersonnalisees {
  if (typeof valeur !== 'string' || valeur.length === 0 || valeur.length > 400) return { ...COULEURS_DEFAUT };
  try {
    const analyse = JSON.parse(valeur) as Record<string, unknown>;
    return {
      p: couleurOuDefaut(analyse.p, COULEURS_DEFAUT.p),
      s: couleurOuDefaut(analyse.s, COULEURS_DEFAUT.s),
      a: couleurOuDefaut(analyse.a, COULEURS_DEFAUT.a),
      grad: analyse.grad === true,
    };
  } catch {
    return { ...COULEURS_DEFAUT };
  }
}

/* ---------- Calculs de couleur : exactement ceux du prototype ---------- */

function versRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function versHex(rgb: number[]): string {
  return `#${rgb.map((valeur) => Math.max(0, Math.min(255, Math.round(valeur))).toString(16).padStart(2, '0')).join('')}`;
}

export function melanger(a: string, b: string, pourcent: number): string {
  const [ra, ga, ba] = versRgb(a);
  const [rb, gb, bb] = versRgb(b);
  const p = pourcent / 100;
  return versHex([ra + (rb - ra) * p, ga + (gb - ga) * p, ba + (bb - ba) * p]);
}

/** pct < 0 assombrit, pct > 0 éclaircit. */
export function assombrir(hex: string, pourcent: number): string {
  return melanger(hex, pourcent < 0 ? '#000000' : '#FFFFFF', Math.abs(pourcent));
}

export function luminance(hex: string): number {
  const [r, g, b] = versRgb(hex);
  return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
}

/**
 * Les variables CSS d'une palette personnalisée, en clair comme en sombre.
 * Mêmes formules que `applyPalette()` du prototype : l'aperçu du propriétaire
 * et le rendu des étudiants ne peuvent pas diverger.
 */
export function variablesPersonnalisees(couleurs: CouleursPersonnalisees, sombre: boolean): Record<string, string> {
  const P = couleurOuDefaut(couleurs.p, COULEURS_DEFAUT.p);
  const SX = couleurOuDefaut(couleurs.s, COULEURS_DEFAUT.s);
  const A = couleurOuDefaut(couleurs.a, COULEURS_DEFAUT.a);
  return {
    '--violet': P,
    '--violet2': SX,
    '--violet-deep': assombrir(P, -25),
    '--violet-soft': sombre ? assombrir(P, -82) : melanger(P, '#FFFFFF', 88),
    '--violet-line': sombre ? assombrir(P, -62) : melanger(P, '#FFFFFF', 72),
    '--gold': A,
    '--gold2': melanger(A, '#FFFFFF', 25),
    '--gold-soft': sombre ? assombrir(A, -80) : melanger(A, '#FFFFFF', 88),
    '--gold-line': sombre ? assombrir(A, -60) : melanger(A, '#FFFFFF', 70),
    '--lav': SX,
    '--grad-mid': P,
    '--grad': `linear-gradient(135deg, ${assombrir(P, -18)} 0%, ${P} 55%, ${SX} 100%)`,
    '--grad-dark': couleurs.grad
      ? `linear-gradient(160deg, ${assombrir(P, -80)} 0%, ${assombrir(P, -60)} 60%, ${assombrir(SX, -45)} 100%)`
      : 'linear-gradient(160deg,#0A0A0C 0%,#131316 60%,#1B1B21 100%)',
  };
}

/** Les variables à retirer quand on revient à une palette nommée. */
export const VARIABLES_PERSONNALISEES = [
  '--violet',
  '--violet2',
  '--violet-deep',
  '--violet-soft',
  '--violet-line',
  '--gold',
  '--gold2',
  '--gold-soft',
  '--gold-line',
  '--lav',
  '--grad-mid',
  '--grad',
  '--grad-dark',
] as const;
