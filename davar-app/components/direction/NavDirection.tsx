'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navigation de l'Espace Direction. Les sections affichées viennent du SERVEUR :
 * chacun ne voit que les siennes, et le lien courant est marqué. Masquer un lien
 * ne protège rien — chaque page revérifie le périmètre de son côté.
 */
export type LienDirection = { section: string; href: string; libelle: string };

export function NavDirection({ liens }: { liens: LienDirection[] }) {
  const chemin = usePathname();
  return (
    <nav className="dv-nav" aria-label="Navigation de la direction">
      {liens.map((lien) => {
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
