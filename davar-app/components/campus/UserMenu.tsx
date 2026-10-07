'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * Menu du compte — mêmes éléments que le prototype : le nom et l'adresse en
 * tête, puis les entrées réelles, séparateur, déconnexion.
 * Les entrées qui n'existent pas encore dans l'application ne sont PAS affichées :
 * un menu ne doit pas mener à un écran vide.
 */
export function UserMenu({
  nom,
  email,
  estProprietaire,
}: {
  nom: string;
  email: string;
  estProprietaire: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const zone = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function surClic(e: MouseEvent) {
      if (ouvert && zone.current && !zone.current.contains(e.target as Node)) setOuvert(false);
    }
    function surEchap(e: KeyboardEvent) {
      if (e.key === 'Escape') setOuvert(false);
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
      <button className="icon-btn" style={{ padding: 2 }} onClick={() => setOuvert(!ouvert)} aria-label="Mon compte">
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
          {estProprietaire && (
            <a className="dd-item" href="/direction">
              <Icon nom="shieldCheck" taille={15} /> Direction
            </a>
          )}
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
