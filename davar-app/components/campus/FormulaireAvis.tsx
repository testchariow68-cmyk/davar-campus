'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { DicteeVocale } from './DicteeVocale';

/**
 * Donner son avis : écrit, ou DICTÉ puis transcrit.
 *
 * Les DEUX moteurs gardés par le propriétaire sont branchés (voir `DicteeVocale`) :
 *   - « en ligne » (défaut) : la voix part, le texte revient en quelques secondes ;
 *   - « sur l'appareil » : la transcription se fait dans le navigateur, et sert
 *     aussi de repli quand la transcription en ligne ne peut pas répondre.
 *
 * Dans les deux cas, l'enregistrement n'est pas conservé : seul le texte l'est —
 * c'est la règle écrite du propriétaire.
 */
export function FormulaireAvis({
  formationId,
  formationTitre,
  step,
  dejaDepose = false,
  moteurTranscription = 'groq-whisper',
}: {
  formationId: string;
  formationTitre: string;
  step: number;
  dejaDepose?: boolean;
  /** Le moteur choisi par le propriétaire dans la Direction. */
  moteurTranscription?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [corps, setCorps] = useState('');
  const [kind, setKind] = useState<'ecrit' | 'audio'>('ecrit');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [depose, setDepose] = useState(dejaDepose);
  // D'où vient le texte dicté : cela se dit honnêtement dans la fiche de l'avis.
  const [origine, setOrigine] = useState<'en-ligne' | 'appareil' | null>(null);

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
          transcribedBy:
            kind === 'audio' ? (origine === 'appareil' ? 'navigateur' : origine === 'en-ligne' ? 'en-ligne' : 'saisie-manuelle') : null,
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
            : 'Appuyez sur « Dicter mon avis » et parlez : le texte s’écrira ici, et vous pourrez le corriger.'
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
        <>
          <DicteeVocale
            formationId={formationId}
            moteur={moteurTranscription}
            onTexte={(texte, dOu) => {
              setOrigine(dOu);
              setCorps((actuel) => (actuel.trim().length > 0 ? `${actuel.trim()} ${texte}` : texte));
            }}
          />
          <p className="xs faint mt8">
            <Icon nom="lock" taille={12} />{' '}
            {moteurTranscription === 'browser-whisper'
              ? 'La transcription se fait sur votre appareil : l’enregistrement ne quitte jamais votre téléphone, et seule la transcription est conservée.'
              : 'Votre voix est transcrite, puis l’enregistrement est effacé aussitôt : seule la transcription est conservée.'}
          </p>
        </>
      )}
      {message && <p className="xs muted mt8">{message}</p>}
    </div>
  );
}
