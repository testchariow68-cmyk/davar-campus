'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

/**
 * LES DEUX COLONNES DU PROTOTYPE (`vNotifs`) : « Formation (prioritaire) »
 * puis « Campus ». La première ne prend que les types que le prototype y met
 * (`exercise, eval, coach, module, quiz, formation`) — ici : une réponse de
 * coach et une décision sur un devoir. Une distinction, une motivation, une
 * ressource ou un rappel restent dans « Campus », comme le prototype les range.
 */
const FORMATION = ['coach', 'devoir'];

function jour(atMs: number): string {
  return new Date(atMs).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * NOTIFICATIONS — `vNotifs()` du prototype : « Vos formations d'abord, la vie
 * du campus ensuite ». Deux colonnes, un bouton « Tout marquer comme lu », et
 * une ligne qui s'ouvre sur la page concernée quand elle en a une.
 */
export function NotificationsEcran({ initiales }: { initiales: NotificationAffichee[] }) {
  const router = useRouter();
  const [liste, setListe] = useState(initiales);

  async function poster(action: string, id?: string) {
    const reponse = await fetch('/api/campus/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, id }),
    });
    const donnees = (await reponse.json().catch(() => ({}))) as { notifications?: NotificationAffichee[] };
    if (Array.isArray(donnees.notifications)) setListe(donnees.notifications);
    else if (action === 'tout_lire') setListe((precedente) => precedente.map((n) => ({ ...n, lue: true })));
    router.refresh();
  }

  function ouvrir(notification: NotificationAffichee) {
    if (!notification.route) return;
    if (!notification.lue) void poster('lire', notification.id);
    router.push(notification.route);
  }

  const formations = liste.filter((notification) => FORMATION.includes(notification.kind));
  const campus = liste.filter((notification) => !FORMATION.includes(notification.kind));

  if (liste.length === 0) {
    return (
      <div className="empty">
        <Icon nom="bell" taille={30} />
        <div className="mt8" style={{ fontWeight: 700, color: 'var(--muted)' }}>
          Rien à signaler pour l’instant
        </div>
        <div className="xs mt4">Les activités de vos formations et du campus apparaîtront ici.</div>
      </div>
    );
  }

  const colonne = (titre: string, lignes: NotificationAffichee[]) => (
    <div className="card card-pad">
      <div className="eyebrow mb8">{titre}</div>
      {lignes.length === 0 ? (
        <div className="xs muted">
          {titre.startsWith('Formation')
            ? 'Aucune notification de formation.'
            : 'Aucune notification du campus.'}
        </div>
      ) : (
        lignes.map((notification) => (
          <div
            key={notification.id}
            className={`nt-line ${notification.lue ? '' : 'unread'} ${notification.route ? 'go' : ''}`}
            onClick={() => ouvrir(notification)}
            title={notification.route ? 'Ouvrir la page concernée' : undefined}
          >
            <b>{notification.titre}</b>
            <span className="xs muted">{notification.corps}</span>
            <span className="xs faint">{jour(notification.atMs)}</span>
            {notification.route && <Icon nom="chevR" taille={13} />}
          </div>
        ))
      )}
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p>Vos formations d’abord, la vie du campus ensuite.</p>
        </div>
        <button className="btn btn-sm" onClick={() => poster('tout_lire')}>
          <Icon nom="check" taille={14} /> Tout marquer comme lu
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start' }}>
        {colonne('Formation (prioritaire)', formations)}
        {colonne('Campus', campus)}
      </div>
    </>
  );
}
