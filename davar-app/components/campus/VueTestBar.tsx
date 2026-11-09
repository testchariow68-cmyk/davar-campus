'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';

/**
 * Bandeau permanent de la vue test — copie fidèle de `viewAsBannerHTML()` du prototype :
 *   « Vue test : <nom> — touche Échap pour quitter » + bouton « Quitter ».
 * Échap ramène au compte réel, comme dans `js/app.js` (écoute clavier globale).
 */
export function VueTestBar({ nom }: { nom: string }) {
  const [enCours, setEnCours] = useState(false);

  const quitter = useCallback(async () => {
    setEnCours(true);
    try {
      await fetch('/api/direction/view-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quitter' }),
      });
    } catch {
      /* même si le réseau échoue, on revient au campus : le cookie ne survivra pas au contrôle suivant */
    }
    window.location.href = '/campus';
  }, []);

  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key !== 'Escape') return;
      evenement.preventDefault();
      void quitter();
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [quitter]);

  return (
    <div className="viewas-bar">
      <span>
        <Icon nom="eye" taille={14} />{' '}
        <span className="xs">
          Vue test : <b>{nom}</b> — touche Échap pour quitter
        </span>
      </span>
      <button
        type="button"
        className="viewas-quit"
        disabled={enCours}
        title="Quitter la vue test (Échap)"
        onClick={() => void quitter()}
      >
        Quitter
      </button>
    </div>
  );
}
