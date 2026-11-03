'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export type NotificationAffichee = {
  id: string;
  kind: string;
  titre: string;
  corps: string | null;
  route: string | null;
  atMs: number;
  lue: boolean;
};

function ilYA(atMs: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - atMs) / 60000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}

/**
 * CLOCHE — copie du comportement du prototype : le compteur des non lues,
 * la liste au clic, et la règle du propriétaire : une notification lue
 * disparaît 48 heures plus tard.
 */
export function BellMenu({ initiales, nonLuesInitiales }: { initiales: NotificationAffichee[]; nonLuesInitiales: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState(initiales);
  const [nonLues, setNonLues] = useState(nonLuesInitiales);
  const zone = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function surClic(evenement: MouseEvent) {
      if (ouvert && zone.current && !zone.current.contains(evenement.target as Node)) setOuvert(false);
    }
    document.addEventListener('mousedown', surClic);
    return () => document.removeEventListener('mousedown', surClic);
  }, [ouvert]);

  async function agir(action: 'lire' | 'tout_lire', id?: string) {
    try {
      const reponse = await fetch('/api/campus/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { nonLues?: number; notifications?: NotificationAffichee[] };
      if (typeof donnees.nonLues === 'number') setNonLues(donnees.nonLues);
      if (Array.isArray(donnees.notifications)) setListe(donnees.notifications);
    } catch {
      /* le clic suivant retentera */
    }
  }

  return (
    <div className="dd-anchor" ref={zone}>
      <button className="icon-btn" aria-label="Notifications" onClick={() => setOuvert((etat) => !etat)}>
        <Icon nom="bell" taille={18} />
        {nonLues > 0 && (
          <span
            className="badge b-red"
            style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px', fontSize: 10, justifyContent: 'center' }}
          >
            {nonLues > 9 ? '9+' : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <div className="dd-menu" style={{ minWidth: 320, right: 0, left: 'auto', maxHeight: 'min(70vh, 460px)', overflowY: 'auto' }}>
          <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
            <b style={{ fontSize: 13 }}>Notifications</b>
            {nonLues > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => void agir('tout_lire')}>
                Tout marquer lu
              </button>
            )}
          </div>
          {liste.length === 0 && <div className="xs muted" style={{ padding: 14 }}>Aucune notification pour l’instant.</div>}
          {liste.map((notification) => (
            <div
              key={notification.id}
              className="dd-item"
              style={{ alignItems: 'flex-start', opacity: notification.lue ? 0.62 : 1 }}
              onClick={async () => {
                if (!notification.lue) await agir('lire', notification.id);
                if (notification.route) window.location.href = notification.route;
              }}
            >
              <Icon nom={notification.kind === 'coach' ? 'message' : notification.kind === 'ai' ? 'sparkles' : 'bell'} taille={15} />
              <span className="wrap">
                <b style={{ fontSize: 12.5 }}>{notification.titre}</b>
                {notification.corps && <div className="xs muted">{notification.corps}</div>}
                <div className="xs faint">{ilYA(notification.atMs)}</div>
              </span>
            </div>
          ))}
          <div className="xs faint" style={{ padding: '8px 14px', borderTop: '1px solid var(--line)' }}>
            Une notification lue disparaît après 48 heures.
          </div>
        </div>
      )}
    </div>
  );
}
