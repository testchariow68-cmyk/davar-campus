'use client';

import { useState } from 'react';
import { Icon } from '@/components/campus/Icon';

/**
 * L'ÉTOILE ✦ — « Mettre en avant dans le catalogue ». Un avis retenu
 * témoigne sur la page « Découvrir plus de formations ». Le texte n'est
 * jamais retouché : seule sa place change.
 */
export function EtoileAvis({ avisId, enAvant }: { avisId: string; enAvant: boolean }) {
  const [actif, setActif] = useState(enAvant);
  const [envoi, setEnvoi] = useState(false);

  async function basculer() {
    const suivant = !actif;
    setActif(suivant);
    setEnvoi(true);
    try {
      const reponse = await fetch('/api/direction/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'avis_en_avant', id: avisId, valeur: suivant }),
      });
      if (!reponse.ok) setActif(!suivant);
    } catch {
      setActif(!suivant);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <button
      className={`btn btn-sm ${actif ? 'btn-gold' : ''}`}
      onClick={basculer}
      disabled={envoi}
      title="Mettre en avant dans le catalogue"
    >
      <Icon nom="star" taille={13} /> ✦
    </button>
  );
}
