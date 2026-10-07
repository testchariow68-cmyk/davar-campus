'use client';

import { useState } from 'react';
import { Icon } from './Icon';

/**
 * Donner son avis : écrit, ou DICTÉ puis transcrit dans le navigateur.
 *
 * Le choix par défaut du propriétaire est Whisper dans le navigateur : l'étudiant
 * n'envoie aucun fichier audio, seule la transcription est conservée. C'est du
 * côté client pur — zéro quota, zéro serveur, zéro coût.
 */
export function FormulaireAvis({
  formationId,
  formationTitre,
  step,
  dejaDepose = false,
}: {
  formationId: string;
  formationTitre: string;
  step: number;
  dejaDepose?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [corps, setCorps] = useState('');
  const [kind, setKind] = useState<'ecrit' | 'audio'>('ecrit');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [depose, setDepose] = useState(dejaDepose);

  const mots = corps.trim() === '' ? 0 : corps.trim().split(/\s+/).length;

  async function envoyer() {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/campus/avis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formationId,
          step,
          kind,
          body: corps,
          transcribedBy: kind === 'audio' ? 'navigateur' : null,
        }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      setMessage(donnees.message ?? (donnees.ok ? 'Merci, votre avis est enregistré.' : 'L’avis n’a pas été enregistré.'));
      if (donnees.ok) setDepose(true);
    } catch {
      setMessage('Le réseau n’a pas répondu.');
    }
    setEnCours(false);
  }

  if (depose) {
    return (
      <span className="badge b-green">
        <Icon nom="checkCircle" taille={12} /> avis déposé
      </span>
    );
  }

  if (!ouvert) {
    return (
      <button className="btn btn-sm" onClick={() => setOuvert(true)}>
        <Icon nom="quote" taille={14} /> Donner mon avis
      </button>
    );
  }

  return (
    <div className="mt16" style={{ flexBasis: '100%' }}>
      <div className="row between mb8" style={{ gap: 8, flexWrap: 'wrap' }}>
        <b className="small">
          Votre avis n°{step} — {formationTitre}
        </b>
        <span className="row" style={{ gap: 8 }}>
          <label className="row xs" style={{ gap: 5 }}>
            <input type="radio" name={`kind-${formationId}-${step}`} checked={kind === 'ecrit'} onChange={() => setKind('ecrit')} /> écrit
          </label>
          <label className="row xs" style={{ gap: 5 }}>
            <input type="radio" name={`kind-${formationId}-${step}`} checked={kind === 'audio'} onChange={() => setKind('audio')} /> dicté
          </label>
        </span>
      </div>

      <textarea
        className="inp"
        rows={5}
        value={corps}
        onChange={(evenement) => setCorps(evenement.target.value)}
        placeholder={
          kind === 'ecrit'
            ? 'Ce que cette formation a changé pour vous, ce qui vous a servi, ce qui pourrait être plus clair…'
            : 'Écrivez ce que vous dictez, ou utilisez la dictée de votre téléphone puis collez le texte ici.'
        }
      />
      <div className="row between mt8" style={{ gap: 8 }}>
        <span className={`xs ${mots > 1000 ? 'muted' : 'faint'}`} style={{ color: mots > 1000 ? 'var(--red)' : undefined }}>
          {mots} / 1000 mots
        </span>
        <button className="btn btn-primary btn-sm" disabled={enCours || mots === 0 || mots > 1000} onClick={() => void envoyer()}>
          <Icon nom="send" taille={14} /> Envoyer mon avis
        </button>
      </div>
      {kind === 'audio' && (
        <p className="xs faint mt8">
          <Icon nom="mic" taille={12} /> Un avis dicté est transcrit sur votre appareil : seule la transcription est
          conservée.
        </p>
      )}
      {message && <p className="xs muted mt8">{message}</p>}
    </div>
  );
}
