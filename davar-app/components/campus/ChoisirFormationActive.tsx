'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';

/** Bouton de sélection persistante de la formation affichée par le dashboard. */
export function ChoisirFormationActive({
  trainingId,
  active,
}: {
  trainingId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(false);

  async function choisir() {
    if (active || enCours) return;
    setEnCours(true);
    setErreur(false);
    try {
      const reponse = await fetch('/api/campus/formation-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingId }),
      });
      if (!reponse.ok) {
        setErreur(true);
        return;
      }
      router.refresh();
    } catch {
      setErreur(true);
    } finally {
      setEnCours(false);
    }
  }

  if (active) {
    return (
      <span className="formation-active-state" aria-current="true">
        <Icon nom="check" taille={13} /> Formation active
      </span>
    );
  }

  return (
    <div className="formation-active-action">
      <button type="button" className="btn btn-sm" onClick={() => void choisir()} disabled={enCours}>
        <Icon nom="cap" taille={14} /> {enCours ? 'Sélection…' : 'Choisir comme formation active'}
      </button>
      {erreur && <span className="xs" role="alert">Sélection impossible pour le moment.</span>}
    </div>
  );
}
