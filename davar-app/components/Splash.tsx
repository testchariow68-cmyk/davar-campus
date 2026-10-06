"use client";

import { useEffect, useState } from "react";

/**
 * 🎬 L'Expérience d'Ouverture — 5 secondes.
 * Fond noir absolu · logo campus en zoom fondu (0,8 s) · halo violet #5B2A86
 * qui pulse comme une respiration · barre de chargement or (#D4AF37 à 30 %)
 * remplie de violet profond de gauche à droite · fondu vers la connexion.
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
      const wait = Math.max(0, 5000 - (Date.now() - t0));
      setTimeout(() => {
        setOff(true);
        setTimeout(() => setGone(true), 900);
      }, wait);
    };
    window.addEventListener("load", hide);
    const safety = setTimeout(hide, 8000);
    return () => {
      window.removeEventListener("load", hide);
      clearTimeout(safety);
    };
  }, []);

  if (gone) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#000", zIndex: 999,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 34, transition: "opacity .8s ease", opacity: off ? 0 : 1,
        pointerEvents: off ? "none" : "auto",
      }}
    >
      {/* Halo violet pulsant */}
      <div
        style={{
          position: "absolute", width: 420, height: 420, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(91,42,134,.55) 0%, rgba(91,42,134,.28) 42%, transparent 72%)",
          animation: "sp-halo 2.5s ease-in-out infinite",
        }}
      />
      {/* Logo : naît plus petit, prend sa taille définitive en 0,8 s */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/campus-slogan.png"
        alt="DAVAR ACADÉMIE CAMPUS — L'école de l'excellence oratoire"
        style={{
          position: "relative", width: "min(380px, 70vw)", zIndex: 2,
          opacity: 0, transform: "scale(.8)",
          animation: "sp-logo .8s ease-out .15s forwards",
          filter: "drop-shadow(0 10px 46px rgba(91,42,134,.6))",
        }}
      />
      {/* Barre : piste or 30 %, remplissage violet sur 5 s */}
      <div
        style={{
          position: "relative", width: "min(280px, 60vw)", height: 3,
          borderRadius: 99, overflow: "hidden", zIndex: 2,
          background: "rgba(212,175,55,.30)",
        }}
      >
        <i
          style={{
            position: "absolute", inset: 0, background: "#5B2A86",
            transformOrigin: "left", transform: "scaleX(0)",
            animation: "sp-fill 5s linear .1s forwards", display: "block",
          }}
        />
      </div>
      <style>{`
        @keyframes sp-halo{0%,100%{transform:scale(.92);opacity:.65}50%{transform:scale(1.18);opacity:1}}
        @keyframes sp-logo{to{opacity:1;transform:scale(1)}}
        @keyframes sp-fill{to{transform:scaleX(1)}}
      `}</style>
    </div>
  );
}
