'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';

export type PageAffichee = { id: string; position: number; title: string | null; body: string };

/**
 * LECTEUR DE LIVRE — copie fidèle de `vReader()` du prototype :
 * « Page N sur M », passage page par page, « Aller à », et la phrase rassurante
 * « Votre position est enregistrée automatiquement ».
 * Quand le livre est un PDF, il est montré tel quel dans son lecteur.
 */
export function LecteurLivre({
  resourceId,
  titre,
  pages,
  pageInitiale,
  pdfUrl,
}: {
  resourceId: string;
  titre: string;
  pages: PageAffichee[];
  pageInitiale: number;
  pdfUrl: string | null;
}) {
  const total = pages.length;
  const [page, setPage] = useState(Math.min(Math.max(pageInitiale || 1, 1), Math.max(total, 1)));
  const [allerA, setAllerA] = useState('');
  const [enregistre, setEnregistre] = useState(false);

  const courante = pages[page - 1];

  async function enregistrer(position: number) {
    setEnregistre(false);
    try {
      await fetch('/api/campus/lecture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceId, kind: 'book', position, forcer: true }),
      });
      setEnregistre(true);
    } catch {
      /* la position se réenregistrera au geste suivant */
    }
  }

  function aller(direction: number) {
    const suivante = Math.min(Math.max(1, page + direction), total);
    setPage(suivante);
    void enregistrer(suivante);
  }

  function sauter() {
    const voulue = Number.parseInt(allerA, 10);
    if (!Number.isFinite(voulue)) return;
    const cible = Math.min(Math.max(1, voulue), total);
    setPage(cible);
    void enregistrer(cible);
    setAllerA('');
  }

  if (pdfUrl) {
    return (
      <div className="rd-wrap">
        <div className="row between mb12" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: 19, margin: 0 }}>{titre}</h1>
          <Link className="btn btn-sm" href="/campus/ressources">
            <Icon nom="back" taille={13} /> Mes ressources
          </Link>
        </div>
        <div className="rd-pdf card">
          <iframe src={pdfUrl} title={`${titre} — lecture du PDF`} />
        </div>
        <div className="xs faint" style={{ textAlign: 'center', marginTop: 10 }}>
          Votre livre, tel qu’il est : zoomez et naviguez dans le lecteur PDF.
        </div>
      </div>
    );
  }

  return (
    <div className="rd-wrap">
      <div className="row between mb12" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 19, margin: 0 }}>{titre}</h1>
          <div className="xs muted mt4">
            Page {page} sur {total}
          </div>
        </div>
        <Link className="btn btn-sm" href="/campus/ressources">
          <Icon nom="back" taille={13} /> Mes ressources
        </Link>
      </div>

      <article className="rd-page card card-pad">
        {courante?.title && <h2 style={{ fontSize: 16, marginTop: 0 }}>{courante.title}</h2>}
        {(courante?.body ?? '').split('\n').map((paragraphe, index) => (
          <p key={index}>{paragraphe}</p>
        ))}
      </article>

      <div className="rd-bar card">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => aller(-1)}>
          <Icon nom="chevL" taille={14} /> Page précédente
        </button>
        <div className="row" style={{ gap: 6 }}>
          <input
            className="inp"
            style={{ width: 74 }}
            type="number"
            min={1}
            max={total}
            value={allerA}
            onChange={(evenement) => setAllerA(evenement.target.value)}
            onKeyDown={(evenement) => evenement.key === 'Enter' && sauter()}
            aria-label="Numéro de page"
          />
          <button className="btn btn-sm" onClick={sauter}>
            Aller à
          </button>
        </div>
        <button className="btn btn-sm btn-primary" disabled={page >= total} onClick={() => aller(1)}>
          Page suivante <Icon nom="chevR" taille={14} />
        </button>
      </div>

      <div className="xs faint" style={{ textAlign: 'center', marginTop: 10 }}>
        <Icon nom="checkCircle" taille={12} /> {enregistre ? 'Position enregistrée.' : 'Votre position est enregistrée automatiquement.'}
      </div>
    </div>
  );
}
