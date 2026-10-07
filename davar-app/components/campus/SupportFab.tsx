'use client';

import { useState } from 'react';
import { Icon } from './Icon';

/**
 * BOUTON D'AIDE FLOTTANT — décision écrite du propriétaire :
 *   « icône casque (sans tête humaine) dans un cercle, flottant ; visible dès
 *     qu'on est dans un module + dans le profil ; jamais le mot “Support” écrit ».
 *
 * Il ouvre les moyens de contact réels (WhatsApp, appel, e-mail) et rappelle que
 * la discussion en direct n'est pas encore ouverte — dit franchement, jamais simulé.
 */
export function SupportFab({
  whatsapp,
  telephone,
  courriel,
}: {
  whatsapp: string;
  telephone: string;
  courriel: string;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <button className="fab-sup" title="Aide" aria-label="Aide" onClick={() => setOuvert(true)}>
        <Icon nom="headset" taille={20} />
      </button>

      {ouvert && (
        <>
          <div className="sup-pop-back" onClick={() => setOuvert(false)} />
          <div className="sup-pop" role="dialog" aria-label="Aide">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <b>Besoin d&apos;aide ?</b>
                <span className="xs muted">
                  Écrivez-nous : nous répondons sous 48 h maximum.
                </span>
              </div>
              <button className="icon-btn" onClick={() => setOuvert(false)} aria-label="Fermer">
                <Icon nom="x" taille={16} />
              </button>
            </div>

            <div className="col" style={{ gap: 9, marginTop: 12 }}>
              <a className="sp-btn" href={whatsapp} target="_blank" rel="noopener">
                <span className="ic">
                  <Icon nom="whatsapp" taille={15} />
                </span>
                <span className="wrap">
                  <span className="lb">WhatsApp</span>
                  <small>Réponse rapide sur votre téléphone.</small>
                </span>
              </a>
              <a className="sp-btn" href={`tel:${telephone.replace(/\s+/g, '')}`}>
                <span className="ic">
                  <Icon nom="phone" taille={15} />
                </span>
                <span className="wrap">
                  <span className="lb">Appeler</span>
                  <small>Ouvre directement votre téléphone.</small>
                </span>
              </a>
              <a className="sp-btn" href={`mailto:${courriel}`}>
                <span className="ic">
                  <Icon nom="mail" taille={15} />
                </span>
                <span className="wrap">
                  <span className="lb">Envoyer un e-mail</span>
                  <small>{courriel}</small>
                </span>
              </a>
            </div>
          </div>
        </>
      )}
    </>
  );
}
