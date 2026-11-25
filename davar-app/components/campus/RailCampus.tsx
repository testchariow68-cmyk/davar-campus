'use client';

import Link from 'next/link';
import { Icon } from './Icon';
import { MenuCampus } from './MenuCampus';
import { ThemeButton } from './ThemeButton';

/**
 * LE RAIL DE GAUCHE — `aside.rail` du prototype.
 *
 * Le rail garde uniquement la marque et l'ouverture du menu, puis le thème en
 * bas. L'accueil reste accessible par le bouton flottant et le menu, mais ne
 * devient pas une troisième entrée visuelle du rail sur tablette/ordinateur.
 */
export function RailCampus({
  nom,
  email,
  formation,
  pourcent,
}: {
  nom: string;
  email: string;
  formation: string | null;
  pourcent: number;
}) {
  const initiale = nom.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((morceau) => morceau[0]).join('').toUpperCase() || '?';

  return (
    <aside className="rail" aria-label="Navigation principale">
      <Link className="rail-brand brand" href="/campus" title="Accueil">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-img" src="/logo-structure.png" alt="Davar Académie" />
        <div className="brand-txt">
          <strong>DAVAR</strong>
          <span>ACADÉMIE</span>
        </div>
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

    </aside>
  );
}
