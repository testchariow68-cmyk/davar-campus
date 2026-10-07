'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LIENS = [
  { href: '/direction', libelle: "Vue d'ensemble" },
  { href: '/direction/formations', libelle: 'Formations' },
  { href: '/direction/etudiants', libelle: 'Étudiants' },
  { href: '/direction/conversations', libelle: 'Conversations' },
  { href: '/direction/devoirs', libelle: 'Devoirs' },
  { href: '/direction/certificats', libelle: 'Certificats' },
  { href: '/direction/avis', libelle: 'Avis' },
  { href: '/direction/assistant', libelle: 'Assistant virtuel' },
  { href: '/direction/ressources', libelle: 'Ressources' },
  { href: '/direction/exports', libelle: 'Exports' },
  { href: '/direction/emails', libelle: 'E-mails' },
  { href: '/direction/integrations', libelle: 'Intégrations' },
  { href: '/direction/reglages', libelle: 'Réglages' },
  { href: '/direction/cycle-de-vie', libelle: 'Cycle de vie' },
  { href: '/direction/equipe', libelle: 'Équipe' },
  { href: '/direction/test', libelle: 'Vue test' },
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
