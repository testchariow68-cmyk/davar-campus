'use client';

import { usePathname } from 'next/navigation';
import { Emoji } from './Emoji';

/**
 * Salutation compacte des écrans intérieurs : l'accueil garde sa grande
 * salutation dans son hero, tandis que chaque autre écran authentifié garde
 * le même repère humain et le même emoji de teint brun.
 */
export function PlatformGreeting({ nom, texte }: { nom: string; texte: string }) {
  const chemin = usePathname();
  if (chemin === '/campus' || chemin === '/direction') return null;
  const prenom = nom.trim().split(/\s+/)[0] || nom;

  return (
    <div className="platform-greeting" aria-label={`Salutation : ${texte}, ${prenom}`}>
      <span>{texte}, {prenom}</span>
      <Emoji value="👋" label="Salutation" className="greeting-wave" />
    </div>
  );
}
