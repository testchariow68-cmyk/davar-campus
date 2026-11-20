"use client";

import { useEffect, useState } from "react";

/**
 * 🎬 L'Expérience d'Ouverture — 4 secondes, comme le prototype.
 * Le dessin et la durée restent les mêmes ; les dimensions sont confiées à
 * la feuille de style pour suivre le viewport plutôt qu'un écran particulier.
 */
export function Splash() {
  const [off, setOff] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t0 = Date.now();
    let done = false;
    const hide = () => {
      if (done) return;
      done = true;
      const wait = Math.max(0, 4000 - (Date.now() - t0));
      setTimeout(() => {
        setOff(true);
        setTimeout(() => setGone(true), 900);
      }, wait);
    };
    // En navigation initiale, React peut monter après l'événement `load`.
    // Dans ce cas, écouter seulement `load` laisse la sécurité de 8 secondes
    // prendre la main et garde un écran vide après la fin de la barre. Traiter
    // aussi l'état déjà chargé conserve la durée de l'animation sans ce délai.
    if (document.readyState === "complete") hide();
    else window.addEventListener("load", hide);
    const safety = setTimeout(hide, 8000);
    return () => {
      window.removeEventListener("load", hide);
      clearTimeout(safety);
    };
  }, []);

  if (gone) return null;
  return (
    <div className={`splash-shell${off ? " is-off" : ""}`}>
      <div className="splash-halo" aria-hidden="true" />
      <img className="splash-logo" src="/campus-splash.svg" alt="DAVAR ACADÉMIE CAMPUS" />
      <div className="splash-progress" aria-hidden="true">
        <i />
      </div>
      <style>{`
        @keyframes sp-halo{0%,100%{transform:scale(.92);opacity:.65}50%{transform:scale(1.18);opacity:1}}
        @keyframes sp-logo{to{opacity:1;transform:scale(1)}}
        @keyframes sp-fill{to{transform:scaleX(1)}}
      `}</style>
    </div>
  );
}
