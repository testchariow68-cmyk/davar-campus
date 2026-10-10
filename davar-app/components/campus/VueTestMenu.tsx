'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export type VueTestItem = { id: string; libelle: string };

/**
 * « Tester une vue » — bouton du propriétaire, invisible pour tout le monde d'autre.
 * Le prototype (`viewAsBtnHTML`) affiche exactement ce bouton dans la barre du haut, avec
 * un menu qui rappelle la règle : des comptes test uniquement, jamais une vraie personne.
 * Il disparaît dès qu'une vue est ouverte — on revient par « Quitter » ou Échap.
 */
export function VueTestMenu({ vues }: { vues: VueTestItem[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const ancre = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (evenement: MouseEvent) => {
      if (ancre.current && !ancre.current.contains(evenement.target as Node)) setOuvert(false);
    };
    document.addEventListener('click', fermer);
    return () => document.removeEventListener('click', fermer);
  }, [ouvert]);

  if (vues.length === 0) return null;

  async function entrer(id: string) {
    setEnCours(true);
    try {
      const reponse = await fetch('/api/direction/view-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'entrer', id }),
      });
      if (reponse.ok) {
        window.location.reload();
        return;
      }
    } catch {
      /* réseau indisponible : on laisse le bouton tel quel */
    }
    setEnCours(false);
  }

  return (
    <div className="dd-anchor" ref={ancre}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOuvert((etat) => !etat)}
        disabled={enCours}
      >
        <Icon nom="eye" taille={14} /> Tester une vue
      </button>
      {ouvert && (
        <div className="dd-menu view-dd" style={{ minWidth: 270, right: 0, left: 'auto' }}>
          <div className="xs muted" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
            Toutes les vues — étudiant et équipe — sur comptes test uniquement, jamais une vraie
            personne. Vous gardez vos droits : Échap ou « Quitter » pour revenir.
          </div>
          {vues.map((vue) => (
            <button
              key={vue.id}
              type="button"
              className="dd-item"
              style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }}
              onClick={() => entrer(vue.id)}
            >
              <Icon nom="shield" taille={15} /> {vue.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
