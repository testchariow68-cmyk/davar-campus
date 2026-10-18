'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * MENU DU COMPTE — `cpUserMenu()` du prototype : le nom, l'adresse, « Mon
 * profil », « Paramètres », puis la déconnexion.
 *
 * Deux raccords, assumés et provisoires : « Mes avis » et « Direction ». Le
 * prototype y arrive par une notification et par le lien d'accueil du fil
 * d'Ariane — deux chemins que le campus n'a pas encore. Sans ces deux lignes,
 * deux écrans qui fonctionnent n'auraient plus aucune porte d'entrée.
 */
export function UserMenu({
  nom,
  email,
  estProprietaire,
  peutVoirDirection = false,
}: {
  nom: string;
  email: string;
  estProprietaire: boolean;
  peutVoirDirection?: boolean;
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
          <a className="dd-item" href="/campus/profil">
            <Icon nom="user" taille={15} /> Mon profil
          </a>
          <a className="dd-item" href="/campus/parametres">
            <Icon nom="settings" taille={15} /> Paramètres
          </a>
          {!estProprietaire && (
            <a className="dd-item" href="/campus/avis">
              <Icon nom="quote" taille={15} /> Mes avis
            </a>
          )}
          {peutVoirDirection && (
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
