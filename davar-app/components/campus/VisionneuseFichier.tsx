'use client';

import { useEffect } from 'react';
import { Icon } from './Icon';
import { BoutonInstaller } from './BoutonInstaller';

/**
 * LA VISIONNEUSE — le document s'OUVRE, il ne se télécharge pas.
 *
 * Le propriétaire l'a décrit très exactement : sur WhatsApp, toucher un PDF le
 * télécharge ; chez nous, toucher un PDF l'ouvre en plein écran, sur n'importe
 * quel appareil — téléphone, tablette, ordinateur. Le téléchargement reste un
 * choix, un bouton, jamais une conséquence du toucher.
 *
 * Trois sorties : la croix, la touche Échap, ou le fond.
 */
export function VisionneuseFichier({
  titre,
  url,
  type,
  taille,
  onClose,
}: {
  titre: string;
  url: string;
  type: string;
  taille: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', surTouche);
    // Le corps ne défile plus derrière la visionneuse.
    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', surTouche);
      document.body.style.overflow = precedent;
    };
  }, [onClose]);

  const estImage = type === 'image';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(6,4,12,.94)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* La barre du haut : le nom du fichier, et la croix pour sortir. */}
      <div
        className="row between"
        onClick={(e) => e.stopPropagation()}
        style={{
          gap: 12,
          padding: '10px 14px',
          background: 'rgba(255,255,255,.06)',
          borderBottom: '1px solid rgba(255,255,255,.14)',
          flex: 'none',
        }}
      >
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          <Icon nom={estImage ? 'eye' : 'file'} taille={15} />
          <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</b>
          {taille && <span className="xs faint" style={{ flex: 'none' }}>{taille}</span>}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          title="Fermer"
          style={{
            flex: 'none',
            width: 36,
            height: 36,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,.2)',
            background: 'rgba(255,255,255,.08)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon nom="x" taille={16} />
        </button>
      </div>

      {/* Le document, qui prend toute la place restante. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ flex: 1, minHeight: 0, background: estImage ? 'transparent' : '#fff' }}
      >
        {estImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt={titre}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <iframe
            src={url}
            title={titre}
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          />
        )}
      </div>

      {/* Le bas : installer l'application, ou télécharger — au choix. */}
      <div
        className="row"
        onClick={(e) => e.stopPropagation()}
        style={{
          gap: 10,
          padding: 12,
          background: 'rgba(255,255,255,.06)',
          borderTop: '1px solid rgba(255,255,255,.14)',
          flex: 'none',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <BoutonInstaller className="btn btn-ghost btn-sm" />
        <a className="btn btn-primary btn-sm" href={url} download target="_blank" rel="noreferrer">
          <Icon nom="download" taille={14} /> Télécharger
        </a>
      </div>
    </div>
  );
}
