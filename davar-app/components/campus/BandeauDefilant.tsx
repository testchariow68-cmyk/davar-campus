'use client';

import { useState } from 'react';
import { Icon, type NomIcone } from '@/components/campus/Icon';
import { LogoSocial } from '@/components/campus/LogoSocial';

type Reseau = { id: string; nom: string; lien: string };
type Annonce = { id: string; texte: string; audience: string; type: 'info' | 'nouveaute' | 'evenement' | 'rappel'; expirationMs: number | null };

function iconeAnnonce(type: Annonce['type']): NomIcone {
  if (type === 'evenement') return 'calendar';
  if (type === 'nouveaute') return 'sparkles';
  if (type === 'rappel') return 'clock';
  return 'bell';
}

/**
 * LE BANDEAU DU BAS — annonces éditoriales + réseaux sociaux.
 *
 * Les annonces ne sont plus limitées aux réseaux : la Direction peut en
 * programmer plusieurs, leur donner un type et une date d'expiration. Le
 * serveur ne transmet que celles qui sont encore actives pour la personne.
 */
export function BandeauDefilant({
  annonces,
  reseaux,
}: {
  annonces: Annonce[];
  reseaux: Reseau[];
}) {
  const [restants, setRestants] = useState(reseaux);
  const [enAttente, setEnAttente] = useState<string | null>(null);
  const [merci, setMerci] = useState<string | null>(null);

  async function confirmer(reseau: Reseau) {
    setEnAttente(null);
    setMerci(reseau.nom);
    setRestants((liste) => liste.filter((entree) => entree.id !== reseau.id));
    try {
      await fetch('/api/campus/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plateforme: reseau.id }),
      });
    } catch {
      /* hors ligne : le bandeau a déjà retiré la plateforme pour cette session */
    }
  }

  if (annonces.length === 0 && restants.length === 0 && !merci) return null;

  function contenu(suffixe: string) {
    return (
      <>
        {annonces.map((annonce, index) => (
          <span key={`${annonce.id}-${suffixe}`} className="tk-it tk-ann">
            <Icon nom={iconeAnnonce(annonce.type)} taille={13} /> {annonce.texte}
            {(index < annonces.length - 1 || restants.length > 0) && <span className="tk-dot" />}
          </span>
        ))}
        {restants.map((reseau, index) => (
          <span key={`${reseau.id}-${suffixe}`} className="tk-it">
            <span className="tk-ico">
              <LogoSocial plateforme={reseau.id} />
            </span>{' '}
            Rejoignez Davar Académie sur <b>&nbsp;{reseau.nom}</b>
            {enAttente === reseau.id ? (
              <span className="row" style={{ gap: 6, marginLeft: 6 }}>
                <span className="xs">Avez-vous rejoint&nbsp;?</span>
                <button type="button" onClick={() => confirmer(reseau)}>
                  Oui, je suis abonné(e)
                </button>
                <button type="button" className="tk-later" onClick={() => setEnAttente(null)}>
                  Plus tard
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  window.open(reseau.lien, '_blank', 'noopener');
                  setEnAttente(reseau.id);
                }}
              >
                S’abonner
              </button>
            )}
            {index < restants.length - 1 && <span className="tk-dot" style={{ marginLeft: 20 }} />}
          </span>
        ))}
        {merci && restants.length === 0 && annonces.length === 0 && (
          <span className="tk-it" key={`merci-${suffixe}`}>
            <Icon nom="star" taille={13} /> Merci d’avoir rejoint {merci} !
          </span>
        )}
      </>
    );
  }

  return (
    <div className="ticker" role="complementary" aria-label="Annonces et réseaux">
      <div className="ticker-track">
        {contenu('a')}
        {contenu('b')}
      </div>
    </div>
  );
}
