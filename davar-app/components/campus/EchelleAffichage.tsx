'use client';

import { useEffect } from 'react';

/**
 * Taille d'affichage choisie dans le profil : la personne la retrouve sur
 * n'importe quel appareil, parce qu'elle est lue en base côté serveur et
 * appliquée ici, au niveau du document — exactement comme le prototype
 * (`document.documentElement.style.zoom`).
 */
export function EchelleAffichage({ echelle }: { echelle: number }) {
  useEffect(() => {
    document.documentElement.style.zoom = echelle && echelle !== 1 ? String(echelle) : '';
    return () => {
      document.documentElement.style.zoom = '';
    };
  }, [echelle]);
  return null;
}
