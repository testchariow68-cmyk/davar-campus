'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';
import { MenuCampus } from './MenuCampus';
import { ThemeButton } from './ThemeButton';

/**
 * LE RAIL DE GAUCHE — `aside.rail` du prototype.
 *
 * Cinq entrées, et rien d'autre : la marque, l'accueil, le menu plein écran,
 * puis en bas le thème et le profil. Le prototype ne met ni recherche, ni
 * raccourci supplémentaire dans ce rail ; on n'en ajoute aucun.
 */
export function RailCampus({
  nom,
  email,
  formation,
  pourcent,
  initiale,
}: {
  nom: string;
  email: string;
  formation: string | null;
  pourcent: number;
  initiale: string;
}) {
  const chemin = usePathname() ?? '/campus';

  return (
    <aside className="rail" aria-label="Navigation principale">
      <Link className="rail-brand brand" href="/campus" title="Accueil">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-img" src="/logo-structure.png" alt="Davar Académie" />
        <div className="brand-txt">
          DAVAR<span>Académie</span>
        </div>
      </Link>

      <Link
        className={`rail-ico rail-home ${chemin === '/campus' ? 'on' : ''}`}
        href="/campus"
        title="Accueil"
      >
        <Icon nom="home" taille={18} />
        <span>Accueil</span>
      </Link>

      <MenuCampus
        nom={nom}
        email={email}
        formation={formation}
        pourcent={pourcent}
        initiale={initiale}
        variante="rail"
      />

      <div className="rail-sp" />

      <ThemeButton variante="rail" />

      <Link
        className={`rail-ico rail-ava ${chemin.startsWith('/campus/profil') ? 'on' : ''}`}
        href="/campus/profil"
        title="Mon profil"
      >
        <span className="avatar" aria-hidden="true">
          {initiale}
        </span>
      </Link>
    </aside>
  );
}
