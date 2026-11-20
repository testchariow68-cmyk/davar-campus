'use client';

import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

/**
 * LE BOUTON D'ACCUEIL FLOTTANT — `fab-home` du prototype.
 *
 * Trois gestes, pas plus : on le GLISSE où l'on veut (la position est
 * mémorisée sur l'appareil), UN tap ramène à la page précédente, DEUX taps
 * ramènent à l'accueil. C'est le seul bouton de navigation permanent de la
 * coquille, et il ne remplace rien d'autre.
 */
export function BoutonAccueil() {
  const bouton = useRef<HTMLAnchorElement>(null);
  const glisse = useRef<{ sx: number; sy: number; ox: number; oy: number; bouge: boolean } | null>(null);
  const dernier = useRef<{ x: number; y: number } | null>(null);
  const appui = useRef<number | null>(null);
  const empecher = useRef(false);

  useEffect(() => {
    function placer(x: number, y: number, memoriser: boolean) {
      const el = bouton.current;
      if (!el) return;
      const marge = 8;
      const largeur = window.innerWidth;
      const hauteur = window.innerHeight;
      const taille = el.offsetWidth || 44;
      const px = Math.max(marge, Math.min(largeur - taille - marge, x));
      const py = Math.max(marge, Math.min(hauteur - taille - marge, y));
      el.style.left = `${px}px`;
      el.style.top = `${py}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      dernier.current = { x: px, y: py };
      if (memoriser) {
        try {
          localStorage.setItem(
            'davar_fab_pos',
            JSON.stringify({ x: Math.round(px), y: Math.round(py) })
          );
        } catch {
          /* stockage bloqué : le bouton reste où il est pour cette session */
        }
      }
    }

    function bouger(event: PointerEvent) {
      const etat = glisse.current;
      if (!etat) return;
      const dx = event.clientX - etat.sx;
      const dy = event.clientY - etat.sy;
      if (!etat.bouge && Math.hypot(dx, dy) > 7) {
        etat.bouge = true;
        bouton.current?.classList.add('dragging');
      }
      if (etat.bouge) {
        if (event.cancelable) event.preventDefault();
        placer(etat.ox + dx, etat.oy + dy, false);
      }
    }

    function relacher() {
      const etat = glisse.current;
      if (!etat) return;
      bouton.current?.classList.remove('dragging');
      if (etat.bouge && dernier.current) placer(dernier.current.x, dernier.current.y, true);
      if (etat.bouge) {
        empecher.current = true;
        window.setTimeout(() => {
          empecher.current = false;
        }, 80);
      }
      glisse.current = null;
    }

    function restaurer() {
      try {
        const valeur = JSON.parse(localStorage.getItem('davar_fab_pos') ?? 'null');
        if (valeur && valeur.x != null) placer(valeur.x, valeur.y, false);
      } catch {
        /* aucune position mémorisée : le bouton reste à sa place par défaut */
      }
    }

    document.addEventListener('pointermove', bouger, { passive: false });
    document.addEventListener('pointerup', relacher);
    document.addEventListener('pointercancel', relacher);
    window.addEventListener('resize', restaurer);
    restaurer();
    return () => {
      document.removeEventListener('pointermove', bouger);
      document.removeEventListener('pointerup', relacher);
      document.removeEventListener('pointercancel', relacher);
      window.removeEventListener('resize', restaurer);
      if (appui.current) window.clearTimeout(appui.current);
    };
  }, []);

  function appuyer(event: React.PointerEvent<HTMLAnchorElement>) {
    const el = bouton.current;
    if (!el) return;
    const rectangle = el.getBoundingClientRect();
    glisse.current = {
      sx: event.clientX,
      sy: event.clientY,
      ox: rectangle.left,
      oy: rectangle.top,
      bouge: false,
    };
  }

  function taper(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (empecher.current) return;
    if (appui.current) {
      // Deuxième tap : l'accueil, sans détour.
      window.clearTimeout(appui.current);
      appui.current = null;
      window.location.assign('/campus');
      return;
    }
    appui.current = window.setTimeout(() => {
      appui.current = null;
      if (window.history.length > 1) window.history.back();
      else window.location.assign('/campus');
    }, 280);
  }

  return (
    <a
      ref={bouton}
      className="fab-home"
      href="/campus"
      onPointerDown={appuyer}
      onClick={taper}
      title="Glissez pour déplacer · 1 tap : retour · 2 taps : accueil"
      aria-label="Accueil"
    >
      <Icon nom="home" taille={17} />
    </a>
  );
}
