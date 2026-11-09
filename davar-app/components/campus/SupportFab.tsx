'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { PanneauAide, type Contacts } from './PanneauAide';

/**
 * BOUTON D'AIDE FLOTTANT — décision écrite du propriétaire :
 *   « icône casque (sans tête humaine) dans un cercle, flottant ; visible dès
 *     qu'on est dans un module + dans le profil ; jamais le mot “Support” écrit ».
 *
 * Il ouvre les moyens de contact réels (WhatsApp, appel, e-mail) et rappelle que
 * la discussion en direct n'est pas encore ouverte — dit franchement, jamais simulé.
 */
export function SupportFab({ whatsapp, telephone, courriel }: Contacts) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <button className="fab-sup" title="Aide" aria-label="Aide" onClick={() => setOuvert(true)}>
        <Icon nom="headset" taille={20} />
      </button>

      {ouvert && (
        <PanneauAide
          contacts={{ whatsapp, telephone, courriel }}
          onFermer={() => setOuvert(false)}
        />
      )}
    </>
  );
}
