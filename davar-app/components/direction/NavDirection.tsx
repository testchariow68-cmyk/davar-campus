'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LIENS = [
  { href: '/direction', libelle: "Vue d'ensemble" },
  { href: '/direction/formations', libelle: 'Formations' },
  { href: '/direction/etudiants', libelle: 'Étudiants' },
  { href: '/direction/equipe', libelle: 'Équipe' },
];

/** Navigation de l'espace Direction. Rien n'est actif par défaut : le lien courant est marqué. */
export function NavDirection() {
  const chemin = usePathname();
  return (
    <nav className="dv-nav" aria-label="Navigation de la direction">
      {LIENS.map((lien) => {
        const actif = lien.href === '/direction' ? chemin === '/direction' : chemin.startsWith(lien.href);
        return (
          <Link key={lien.href} href={lien.href} aria-current={actif ? 'page' : undefined}>
            {lien.libelle}
          </Link>
        );
      })}
    </nav>
  );
}
