'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * MENU DU COMPTE — `cpUserMenu()` du prototype, à la ligne près : le nom,
 * l'adresse, « Mon profil », « Paramètres », un séparateur, puis
 * « Se déconnecter ». Rien de plus : rien de ce que le prototype ne montre
 * pas n'a le droit d'entrer dans ce menu.
 */
export function UserMenu({
  nom,
  email,
  variante = 'barre',
}: {
  nom: string;
  email: string;
  /** « avatar » : le bouton du bandeau, comme `cpUserMenu()` du prototype. */
  variante?: 'barre' | 'avatar';
}) {
  const [ouvert, setOuvert] = useState(false);
  const zone = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function surClic(event: MouseEvent) {
      if (!zone.current?.contains(event.target as Node)) setOuvert(false);
    }
    function surEchap(event: KeyboardEvent) {
      if (event.key === 'Escape') setOuvert(false);
    }
    document.addEventListener('mousedown', surClic);
    document.addEventListener('keydown', surEchap);
    return () => {
      document.removeEventListener('mousedown', surClic);
      document.removeEventListener('keydown', surEchap);
    };
  }, [ouvert]);

  const initiale = (nom.trim()[0] ?? '?').toUpperCase();

  return (
    <div className="dd-anchor" ref={zone}>
      <button
        className={variante === 'avatar' ? 'cp-ava-btn' : 'icon-btn'}
        style={variante === 'avatar' ? undefined : { padding: 2 }}
        onClick={() => setOuvert(!ouvert)}
        title="Mon compte"
        aria-label="Mon compte"
      >
        <span className="avatar" aria-hidden="true">
          {initiale}
        </span>
      </button>

      {ouvert && (
        <div className="dd-menu">
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{nom}</div>
            <div className="xs muted">{email}</div>
          </div>
          <a className="dd-item" href="/campus/profil">
            <Icon nom="user" taille={15} /> Mon profil
          </a>
          <a className="dd-item" href="/campus/parametres">
            <Icon nom="settings" taille={15} /> Paramètres
          </a>
          <div className="dd-sep" />
          <form action="/api/auth/logout" method="post">
            <button className="dd-item" type="submit" style={{ width: '100%', textAlign: 'left' }}>
              <Icon nom="logout" taille={15} /> Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
