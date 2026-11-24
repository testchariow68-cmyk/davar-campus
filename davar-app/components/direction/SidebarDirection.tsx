'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Icon, type NomIcone } from '@/components/campus/Icon';

export type SidebarItem = {
  section: string;
  href: string;
  libelle: string;
  icone: NomIcone;
  compteur?: number;
};

export type SidebarGroup = { label: string; items: SidebarItem[] };

/**
 * Rail sombre de l'administration — la structure de `adminShell()` du
 * prototype, mais avec de vrais liens Next. Le pathname est lu côté client
 * uniquement pour conserver le marquage de la page active après navigation.
 */
export function SidebarDirection({ groupes }: { groupes: SidebarGroup[] }) {
  const chemin = usePathname() ?? '/direction';

  useEffect(() => {
    const actif = document.querySelector<HTMLElement>('.admin-shell .sb-item.active');
    actif?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [chemin]);

  return (
    <aside className="sidebar" aria-label="Navigation de la direction">
      <Link className="brand sb-brand" href="/direction" title="Vue d’ensemble">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="sb-logo" src="/logo-structure.png" alt="Davar Académie" />
        <div className="brand-txt" style={{ color: '#fff' }}>
          DAVAR
          <span style={{ color: '#fff', marginTop: 0 }}>ACADÉMIE</span>
          <small>ADMINISTRATION</small>
        </div>
      </Link>

      {groupes.map((groupe) => (
        <div className="sb-sec" key={groupe.label}>
          <div className="sb-label">{groupe.label}</div>
          {groupe.items.map((item) => {
            const actif = item.href === '/direction' ? chemin === '/direction' : chemin.startsWith(item.href);
            return (
              <Link
                key={item.href}
                className={`sb-item${actif ? ' active' : ''}`}
                href={item.href}
                aria-current={actif ? 'page' : undefined}
                title={item.libelle}
              >
                <Icon nom={item.icone} taille={16} />
                <span>{item.libelle}</span>
                {item.compteur ? <span className="cnt hot">{item.compteur}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}

    </aside>
  );
}
