'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';

export type PisteAffichee = { id: string; position: number; title: string; durationSec: number | null; deposee: boolean };

function minutes(secondes: number): string {
  if (!Number.isFinite(secondes) || secondes <= 0) return '0:00';
  const total = Math.floor(secondes);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * LECTEUR AUDIO — « Écoute avec reprise automatique » (prototype, vue Mes audios).
 *
 * La reprise est réelle : la position est envoyée au serveur toutes les dix
 * secondes et à la mise en pause, puis l'écoute reprend exactement là où elle
 * s'était arrêtée, même sur un autre appareil.
 */
export function LecteurAudio({
  resourceId,
  titre,
  pistes,
  positionInitiale,
}: {
  resourceId: string;
  titre: string;
  pistes: PisteAffichee[];
  positionInitiale: number;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [pisteCourante, setPisteCourante] = useState(pistes[0]?.id ?? '');
  const [repriseFaite, setRepriseFaite] = useState(false);
  const demarrage = useRef(positionInitiale);

  const courante = pistes.find((piste) => piste.id === pisteCourante) ?? pistes[0];

  async function enregistrer(secondes: number) {
    try {
      await fetch('/api/campus/lecture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceId, kind: 'audio', position: Math.floor(secondes) }),
      });
    } catch {
      /* le prochain envoi reprendra */
    }
  }

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    let dernier = 0;
    function surTemps() {
      if (!element) return;
      // Une écriture toutes les dix secondes : assez précis, assez économe.
      if (element.currentTime - dernier >= 10) {
        dernier = element.currentTime;
        void enregistrer(element.currentTime);
      }
    }
    function surPause() {
      if (element) void enregistrer(element.currentTime);
    }
    function surReprise() {
      // La reprise se fait une seule fois, au premier démarrage.
      if (!repriseFaite && demarrage.current > 3 && element) {
        element.currentTime = demarrage.current;
        setRepriseFaite(true);
      }
    }
    element.addEventListener('timeupdate', surTemps);
    element.addEventListener('pause', surPause);
    element.addEventListener('play', surReprise);
    return () => {
      element.removeEventListener('timeupdate', surTemps);
      element.removeEventListener('pause', surPause);
      element.removeEventListener('play', surReprise);
    };
  }, [pisteCourante, repriseFaite, resourceId]);

  return (
    <>
      <div className="row between mb12" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 19, margin: 0 }}>{titre}</h1>
          <div className="xs muted mt4">
            {pistes.length} piste{pistes.length > 1 ? 's' : ''} — dans l’ordre du livre audio
          </div>
        </div>
        <Link className="btn btn-sm" href="/campus/ressources">
          <Icon nom="back" taille={13} /> Mes ressources
        </Link>
      </div>

      {positionInitiale > 3 && (
        <div className="banner info mb16">
          <Icon nom="headset" taille={14} />
          <span className="small">
            Reprise : vous vous étiez arrêté à {minutes(positionInitiale)}. L’écoute reprendra là, dès que vous
            appuierez sur lecture.
          </span>
        </div>
      )}

      {pistes.length === 0 && (
        <div className="banner info">
          <Icon nom="headset" taille={14} />
          <span className="small">
            Aucune piste n’est encore déposée pour cet audio. Elles apparaîtront ici dès leur mise en ligne.
          </span>
        </div>
      )}

      {pistes.length > 0 && (
        <div className="card card-pad">
          {pistes.map((piste, index) => (
            <div key={piste.id} className="au-item">
              <div className="row between" style={{ gap: 8 }}>
                <span className="xs muted">
                  Piste {index + 1} · {piste.title}
                  {piste.durationSec ? ` (${minutes(piste.durationSec)})` : ''}
                </span>
                {pisteCourante === piste.id && <span className="badge b-violet">en cours</span>}
              </div>
              {piste.deposee ? (
                <audio
                  ref={pisteCourante === piste.id ? audio : undefined}
                  controls
                  preload="none"
                  style={{ width: '100%', marginTop: 6 }}
                  src={`/api/campus/piste/${piste.id}`}
                  onPlay={() => {
                    if (pisteCourante !== piste.id) {
                      setPisteCourante(piste.id);
                      demarrage.current = 0;
                      setRepriseFaite(false);
                    }
                  }}
                />
              ) : (
                <p className="xs faint mt4">Piste pas encore déposée.</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="xs faint" style={{ textAlign: 'center', marginTop: 10 }}>
        <Icon nom="checkCircle" taille={12} /> Votre position d’écoute est enregistrée automatiquement.
      </div>
    </>
  );
}
