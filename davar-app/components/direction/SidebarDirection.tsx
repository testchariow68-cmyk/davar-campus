'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
export function SidebarDirection({
  groupes,
  nom,
  roleLabel,
  initiales,
  couleur,
}: {
  groupes: SidebarGroup[];
  nom: string;
  roleLabel: string;
  initiales: string;
  couleur: string;
}) {
  const chemin = usePathname() ?? '/direction';

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
              >
                <Icon nom={item.icone} taille={16} />
                <span>{item.libelle}</span>
                {item.compteur ? <span className="cnt hot">{item.compteur}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="sb-foot">
        <div className="row">
          <span className="avatar sm" style={{ background: couleur }} aria-hidden="true">
            {initiales}
          </span>
          <div className="wrap">
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{nom}</div>
            <div style={{ fontSize: 10.5, color: '#7E7592' }}>{roleLabel}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
