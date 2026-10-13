'use client';

import { useState } from 'react';
import {
  COULEURS_DEFAUT,
  PALETTE_DEFAUT,
  PALETTES,
  couleursPersonnalisees,
  type CouleursPersonnalisees,
} from '@/lib/palette';
import {
  CLE_COULEURS_NAVIGATEUR,
  CLE_PALETTE_NAVIGATEUR,
  appliquerPalette,
} from '@/components/PaletteLoader';

/**
 * APPARENCE — la palette du campus, comme dans le prototype :
 * « Palette du campus — toute la plateforme change (clair et sombre, chez tous
 * les utilisateurs) ». Rien n'est appliqué définitivement tant que l'on n'a pas
 * enregistré ; mais l'aperçu, lui, est immédiat.
 */
export function ApparenceAdmin({
  paletteInitiale,
  couleursInitiales,
}: {
  paletteInitiale: string;
  couleursInitiales: CouleursPersonnalisees;
}) {
  const [palette, setPalette] = useState(paletteInitiale || PALETTE_DEFAUT);
  const [couleurs, setCouleurs] = useState<CouleursPersonnalisees>(couleursInitiales ?? COULEURS_DEFAUT);
  const [note, setNote] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  function choisir(id: string) {
    setPalette(id);
    setNote(null);
    setErreur(null);
    appliquerPalette(id, id === 'custom' ? couleurs : null);
  }

  function changerCouleur(champ: 'p' | 's' | 'a', valeur: string) {
    const suivantes = { ...couleurs, [champ]: valeur };
    setCouleurs(suivantes);
    setPalette('custom');
    appliquerPalette('custom', suivantes);
  }

  async function enregistrer() {
    setNote(null);
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await fetch('/api/direction/systeme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reglages',
          reglages: {
            'apparence.palette': palette,
            'apparence.couleurs': JSON.stringify(couleurs),
          },
        }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!donnees.ok) {
        setErreur(donnees.message ?? 'Enregistrement refusé.');
        return;
      }
      try {
        localStorage.setItem(CLE_PALETTE_NAVIGATEUR, palette);
        localStorage.setItem(CLE_COULEURS_NAVIGATEUR, JSON.stringify(couleurs));
      } catch {
        /* stockage indisponible : la palette reste appliquée pour cette session */
      }
      appliquerPalette(palette, palette === 'custom' ? couleurs : null);
      setNote('Palette appliquée à tout le campus.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="card card-pad">
      <h3 className="mb4">Palette du campus</h3>
      <p className="small muted mb16">
        Toute la plateforme change, en clair comme en sombre, chez tous les utilisateurs. Votre choix n’est appliqué
        qu’après l’enregistrement.
      </p>

      <div className="pal-grid">
        {Object.entries(PALETTES).map(([cle, definition]) => (
          <button
            key={cle}
            type="button"
            className={`pal-card ${palette === cle ? 'sel' : ''}`}
            onClick={() => choisir(cle)}
          >
            <span className="pal-dots">
              <i style={{ background: definition.p }} />
              <i style={{ background: definition.s }} />
              <i style={{ background: definition.a }} />
            </span>
            <span className="wrap">
              <b>{definition.label}</b>
              {paletteInitiale === cle && palette === cle && (
                <span className="xs" style={{ color: 'var(--green)', display: 'block' }}>appliquée ✓</span>
              )}
              {palette === cle && paletteInitiale !== cle && (
                <span className="xs" style={{ color: 'var(--gold)', display: 'block' }}>
                  sélectionnée — non enregistrée
                </span>
              )}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`pal-card pal-custom ${palette === 'custom' ? 'sel' : ''}`}
          onClick={() => choisir('custom')}
        >
          <span className="pal-dots">
            <i style={{ background: 'conic-gradient(#F00,#FF0,#0F0,#0FF,#00F,#F0F,#F00)' }} />
          </span>
          <span className="wrap">
            <b>Au choix — composez la vôtre</b>
            {palette === 'custom' && (
              <span className="xs" style={{ color: 'var(--gold)', display: 'block' }}>sélectionnée — non enregistrée</span>
            )}
          </span>
        </button>
      </div>

      {palette === 'custom' && (
        <div className="pal-picker mt16">
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            <label className="col" style={{ gap: 4, alignItems: 'center' }}>
              <input type="color" value={couleurs.p} onChange={(evenement) => changerCouleur('p', evenement.target.value)} title="Couleur principale" />
              <span className="xs muted">Principale</span>
            </label>
            <label className="col" style={{ gap: 4, alignItems: 'center' }}>
              <input type="color" value={couleurs.s} onChange={(evenement) => changerCouleur('s', evenement.target.value)} title="Couleur secondaire" />
              <span className="xs muted">Secondaire</span>
            </label>
            <label className="col" style={{ gap: 4, alignItems: 'center' }}>
              <input type="color" value={couleurs.a} onChange={(evenement) => changerCouleur('a', evenement.target.value)} title="Couleur premium (or)" />
              <span className="xs muted">Premium</span>
            </label>
            <label className="row small" style={{ gap: 7, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={couleurs.grad}
                onChange={(evenement) => {
                  const suivantes = couleursPersonnalisees(JSON.stringify({ ...couleurs, grad: evenement.target.checked }));
                  setCouleurs(suivantes);
                  appliquerPalette('custom', suivantes);
                }}
              />
              Dégradés
            </label>
          </div>
          <div className="xs faint mt8">
            La principale remplace le violet partout, la premium remplace l’or. Rien n’est appliqué à tout le monde
            avant l’enregistrement.
          </div>
        </div>
      )}

      <div className="row mt16" style={{ gap: 8 }}>
        <button className="btn btn-primary" type="button" disabled={enCours} onClick={enregistrer}>
          {enCours ? 'Enregistrement…' : 'Enregistrer la palette'}
        </button>
        <span className="xs faint">Rien n’est sauvegardé avant cet appui.</span>
      </div>

      {(note || erreur) && (
        <p className="small mt8" style={erreur ? { color: 'var(--red, #c0392b)' } : undefined}>
          {erreur ?? note}
        </p>
      )}
    </div>
  );
}
