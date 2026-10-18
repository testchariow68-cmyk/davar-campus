'use client';

import { useState } from 'react';
import { Icon } from './Icon';

export type Contacts = { whatsapp: string; telephone: string; courriel: string };

/**
 * LES MOYENS DE CONTACT RÉELS — le contenu du casque flottant, et celui de la
 * carte « Support » des paramètres. Un seul panneau, deux portes d'entrée.
 */
export function PanneauAide({ contacts, onFermer }: { contacts: Contacts; onFermer: () => void }) {
  return (
    <>
      <div className="sup-pop-back" onClick={onFermer} />
      <div className="sup-pop" role="dialog" aria-label="Aide">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <b>Besoin d&apos;aide ?</b>
            <span className="xs muted">Écrivez-nous : nous répondons sous 48 h maximum.</span>
          </div>
          <button className="icon-btn" onClick={onFermer} aria-label="Fermer">
            <Icon nom="x" taille={16} />
          </button>
        </div>

        <div className="col" style={{ gap: 9, marginTop: 12 }}>
          <a className="sp-btn" href={contacts.whatsapp} target="_blank" rel="noopener">
            <span className="ic">
              <Icon nom="whatsapp" taille={15} />
            </span>
            <span className="wrap">
              <span className="lb">WhatsApp</span>
              <small>Réponse rapide sur votre téléphone.</small>
            </span>
          </a>
          <a className="sp-btn" href={`tel:${contacts.telephone.replace(/\s+/g, '')}`}>
            <span className="ic">
              <Icon nom="phone" taille={15} />
            </span>
            <span className="wrap">
              <span className="lb">Appeler</span>
              <small>Ouvre directement votre téléphone.</small>
            </span>
          </a>
          <a className="sp-btn" href={`mailto:${contacts.courriel}`}>
            <span className="ic">
              <Icon nom="mail" taille={15} />
            </span>
            <span className="wrap">
              <span className="lb">Envoyer un e-mail</span>
              <small>{contacts.courriel}</small>
            </span>
          </a>
        </div>
      </div>
    </>
  );
}

/** Un bouton qui ouvre le panneau d'aide — les paramètres s'en servent trois fois. */
export function BoutonAide({
  contacts,
  libelle,
  icone,
  style,
}: {
  contacts: Contacts;
  libelle: string;
  icone: 'message' | 'mail';
  style?: React.CSSProperties;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button
        className="btn"
        style={{ width: '100%', marginBottom: 8, ...style }}
        onClick={() => setOuvert(true)}
      >
        <Icon nom={icone} taille={16} /> {libelle}
      </button>
      {ouvert && <PanneauAide contacts={contacts} onFermer={() => setOuvert(false)} />}
    </>
  );
}
