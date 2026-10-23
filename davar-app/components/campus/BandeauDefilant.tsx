'use client';

import { useState } from 'react';
import { Icon } from '@/components/campus/Icon';
import { LogoSocial } from '@/components/campus/LogoSocial';

type Reseau = { id: string; nom: string; lien: string };

/**
 * LE BANDEAU DU BAS — annonces + réseaux, comme dans le prototype.
 *
 * « S'abonner » ouvre la VRAIE page du réseau, puis demande la confirmation :
 * aucune API publique ne permet de vérifier un abonnement, donc c'est la
 * confirmation de l'étudiant qui compte — horodatée, et visible par le
 * propriétaire. Dès qu'il confirme, la plateforme quitte son bandeau.
 */
export function BandeauDefilant({
  annonce,
  reseaux,
}: {
  annonce: { texte: string; audience: string } | null;
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

  if (!annonce && restants.length === 0) return null;

  const items = (
    <>
      {annonce && (
        <span className="tk-it tk-ann">
          <Icon nom="bell" taille={13} /> {annonce.texte}
        </span>
      )}
      {annonce && restants.length > 0 && <span className="tk-dot" />}
      {restants.map((reseau, index) => (
        <span key={reseau.id} className="tk-it">
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
      {merci && restants.length === 0 && !annonce && (
        <span className="tk-it">
          <Icon nom="star" taille={13} /> Merci d’avoir rejoint {merci} !
        </span>
      )}
    </>
  );

  return (
    <div className="ticker" role="complementary" aria-label="Annonces et réseaux">
      <div className="ticker-track">
        {items}
        {items}
      </div>
    </div>
  );
}
