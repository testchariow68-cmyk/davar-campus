import type { CSSProperties } from 'react';

/**
 * Emoji visibles sans dépendre des polices installées sur l'appareil.
 *
 * Les glyphes sont servis localement : un navigateur sans Apple Color Emoji,
 * Segoe UI Emoji ou Noto Color Emoji conserve donc un vrai dessin couleur.
 * Les mains et la salutation utilisent explicitement la variante de teint
 * brun/métissé demandée ; la valeur métier reste le caractère sans modificateur
 * afin de rester compatible avec les réactions déjà enregistrées en base.
 */
const ASSETS: Record<string, string> = {
  '👋': '1f44b-1f3fd.svg',
  '👍': '1f44d-1f3fd.svg',
  '❤️': '2764.svg',
  '🔥': '1f525.svg',
  '👏': '1f44f-1f3fd.svg',
  '😂': '1f602.svg',
  '🤩': '1f929.svg',
};

export function Emoji({
  value,
  label,
  className = '',
  style,
}: {
  value: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const fichier = ASSETS[value];
  if (!fichier) return <span className={className} role="img" aria-label={label ?? value}>{value}</span>;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      className={`emoji-image ${className}`.trim()}
      src={`/emojis/${fichier}`}
      alt={label ?? value}
      role="img"
      style={style}
    />
  );
}
