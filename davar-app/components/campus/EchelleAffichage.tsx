'use client';

import { useEffect } from 'react';

/**
 * Taille d'affichage choisie dans le profil : la personne la retrouve sur
 * n'importe quel appareil, parce qu'elle est lue en base côté serveur et
 * appliquée ici, au niveau du document. La largeur du corps est compensée
 * avant l'agrandissement afin que les quatre valeurs restent utilisables.
 */
export function appliquerEchelleAffichage(echelle: number) {
  const valeur = Number.isFinite(echelle) && echelle > 0 ? echelle : 1;
  const racine = document.documentElement;
  racine.style.zoom = valeur === 1 ? '' : String(valeur);
  racine.style.setProperty('--davar-scale', String(valeur));
}

export function EchelleAffichage({ echelle }: { echelle: number }) {
  useEffect(() => {
    appliquerEchelleAffichage(echelle);
    return () => {
      document.documentElement.style.zoom = '';
      document.documentElement.style.removeProperty('--davar-scale');
    };
  }, [echelle]);
  return null;
}
