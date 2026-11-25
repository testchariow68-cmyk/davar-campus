import type { CSSProperties } from 'react';

/**
 * Emoji visibles sans dépendre des polices installées sur l'appareil.
 * Les SVG Twemoji sont servis localement : un navigateur sans police emoji
 * conserve donc le même dessin que le campus et ses captures.
 */
const ASSETS: Record<string, string> = {
  '👋': '1f44b.svg',
  '👍': '1f44d.svg',
  '❤️': '2764.svg',
  '🔥': '1f525.svg',
  '👏': '1f44f.svg',
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
