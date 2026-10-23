'use client';

import { useEffect } from 'react';
import {
  COULEURS_DEFAUT,
  PALETTE_DEFAUT,
  VARIABLES_PERSONNALISEES,
  couleursPersonnalisees,
  variablesPersonnalisees,
  type CouleursPersonnalisees,
} from '@/lib/palette';

export const CLE_PALETTE_NAVIGATEUR = 'davar_palette';
export const CLE_COULEURS_NAVIGATEUR = 'davar_palette_couleurs';

/**
 * Applique la palette du propriétaire à toute la page, dans le navigateur.
 *
 * Pourquoi ici et pas au rendu serveur : la page d'accueil doit rester statique
 * — un visiteur qui n'est pas encore étudiant ne doit provoquer AUCUNE requête
 * base. La palette est donc lue une fois, mise en cache, puis appliquée sans
 * clignotement. Le choix reste celui du propriétaire : il vaut pour tout le monde.
 */
export function appliquerPalette(palette: string, couleurs?: CouleursPersonnalisees | null): void {
  if (typeof document === 'undefined') return;
  const racine = document.documentElement;
  const sombre = racine.dataset.theme !== 'light';
  racine.dataset.palette = palette || PALETTE_DEFAUT;

  if (racine.dataset.palette === 'custom') {
    const variables = variablesPersonnalisees(couleurs ?? COULEURS_DEFAUT, sombre);
    for (const [nom, valeur] of Object.entries(variables)) racine.style.setProperty(nom, valeur);
    return;
  }
  for (const nom of VARIABLES_PERSONNALISEES) racine.style.removeProperty(nom);
}

export function PaletteLoader() {
  useEffect(() => {
    let annule = false;

    function relireLeCache(): boolean {
      try {
        const palette = localStorage.getItem(CLE_PALETTE_NAVIGATEUR);
        if (!palette) return false;
        const couleurs = couleursPersonnalisees(localStorage.getItem(CLE_COULEURS_NAVIGATEUR));
        appliquerPalette(palette, couleurs);
        return true;
      } catch {
        return false;
      }
    }

    function memoriser(palette: string, couleurs: CouleursPersonnalisees): void {
      try {
        localStorage.setItem(CLE_PALETTE_NAVIGATEUR, palette);
        localStorage.setItem(CLE_COULEURS_NAVIGATEUR, JSON.stringify(couleurs));
      } catch {
        /* un navigateur sans stockage : la palette s'applique quand même */
      }
    }

    relireLeCache();

    // Le serveur reste la source de vérité : on le consulte une fois, puis on
    // corrige le cache s'il a changé (le propriétaire a modifié la palette).
    fetch('/api/apparence', { cache: 'no-store' })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees: { palette?: string; couleurs?: CouleursPersonnalisees } | null) => {
        if (annule || !donnees?.palette) return;
        const couleurs = couleursPersonnalisees(JSON.stringify(donnees.couleurs ?? COULEURS_DEFAUT));
        appliquerPalette(donnees.palette, couleurs);
        memoriser(donnees.palette, couleurs);
      })
      .catch(() => {
        /* hors ligne : la palette en cache fait le travail */
      });

    // Le mode clair/sombre change en cours de session : une palette composée
    // doit être recalculée pour rester lisible.
    const observateur = new MutationObserver(() => {
      const palette = document.documentElement.dataset.palette;
      if (palette !== 'custom') return;
      let couleurs = COULEURS_DEFAUT;
      try {
        couleurs = couleursPersonnalisees(localStorage.getItem(CLE_COULEURS_NAVIGATEUR));
      } catch {
        /* stockage indisponible */
      }
      appliquerPalette('custom', couleurs);
    });
    observateur.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      annule = true;
      observateur.disconnect();
    };
  }, []);

  return null;
}
