'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { DicteeVocale } from './DicteeVocale';

/**
 * LE PORTAIL — l'écran qui attend l'étudiant et ne le lâche pas.
 *
 * Le propriétaire a fixé trois temps, et ils sont BLOQUANTS :
 *   1. dès l'arrivée, ses attentes ;
 *   2. quinze jours après l'achat, son avis ;
 *   3. un mois après l'achat, son avis de nouveau.
 *
 * Aussi longtemps que la parole n'est pas donnée, le campus reste derrière ce
 * voile : pas de menu, pas de cours, pas de sortie. Il n'y a volontairement
 * aucun bouton « Annuler » et aucune croix : la demande est ferme. Une fois
 * envoyée, la page se recharge et l'étudiant retrouve son campus.
 *
 * Comme partout ailleurs, la dictée est possible : l'enregistrement n'est jamais
 * conservé, seul le texte l'est.
 */
export function PortailAvis({
  genre,
  step,
  formationId,
  formationTitre,
  titre,
  consigne,
  moteurTranscription = 'groq-whisper',
}: {
  genre: 'attentes' | 'avis';
  step: number;
  formationId: string;
  formationTitre: string;
  titre: string;
  consigne: string;
  moteurTranscription?: string;
}) {
  const [corps, setCorps] = useState('');
  const [kind, setKind] = useState<'ecrit' | 'audio'>('ecrit');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [origine, setOrigine] = useState<'en-ligne' | 'appareil' | null>(null);

  const mots = corps.trim() === '' ? 0 : corps.trim().split(/\s+/).length;
  const adresse = genre === 'attentes' ? '/api/campus/attentes' : '/api/campus/avis';

  async function envoyer() {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch(adresse, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formationId,
          ...(genre === 'avis' ? { step } : {}),
          kind,
          body: corps,
          transcribedBy:
            kind === 'audio' ? (origine === 'appareil' ? 'navigateur' : origine === 'en-ligne' ? 'en-ligne' : 'saisie-manuelle') : null,
        }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (donnees.ok) {
        // La parole est donnée : on recharge, le serveur rouvre le campus.
        window.location.reload();
        return;
      }
      setMessage(donnees.message ?? 'Votre réponse n’a pas été enregistrée.');
    } catch {
      setMessage('Le réseau n’a pas répondu.');
    }
    setEnCours(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 620, width: '100%' }}>
      {/*
        LA MARQUE — une étoile, et deux mots, plantés en haut à gauche, HORS de
        la carte. Le propriétaire la veut comme une signature : avant même de
        lire la consigne, l'élève voit qu'on lui demande SON avis.
      */}
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <img src="/etoile-avis.svg" alt="" width={46} height={46} aria-hidden="true" />
        <span
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: '0.01em',
            color: 'var(--gold)',
          }}
        >
          {genre === 'attentes' ? 'mes attentes' : 'mon avis'}
        </span>
      </div>
      <div className="card card-pad">
        <div className="row" style={{ gap: 10 }}>
          <span className="badge b-gold">
            <Icon nom={genre === 'attentes' ? 'star' : 'quote'} taille={12} /> {genre === 'attentes' ? 'à l’arrivée' : `n°${step}`}
          </span>
          <b className="small">{formationTitre}</b>
        </div>

        <h1 style={{ fontSize: 22, marginTop: 12 }}>{titre}</h1>
        <p className="small muted mt8">{consigne}</p>

        <div className="row mt16" style={{ gap: 14 }}>
          <label className="row xs" style={{ gap: 5 }}>
            <input type="radio" name="portail-kind" checked={kind === 'ecrit'} onChange={() => setKind('ecrit')} /> écrit
          </label>
          <label className="row xs" style={{ gap: 5 }}>
            <input type="radio" name="portail-kind" checked={kind === 'audio'} onChange={() => setKind('audio')} /> dicté
          </label>
        </div>

        <textarea
          className="inp mt8"
          rows={7}
          value={corps}
          onChange={(evenement) => setCorps(evenement.target.value)}
          placeholder={
            genre === 'attentes'
              ? 'Ce que vous voulez savoir faire à la fin, ce qui vous a décidé, ce qui compte pour vous…'
              : 'Ce que cette formation a changé pour vous, ce qui vous a servi, ce qui pourrait être plus clair…'
          }
        />

        <div className="row between mt8" style={{ gap: 8 }}>
          <span className="xs faint" style={{ color: mots > 1000 ? 'var(--red)' : undefined }}>
            {mots} / 1000 mots
          </span>
          <button className="btn btn-primary" disabled={enCours || mots === 0 || mots > 1000} onClick={() => void envoyer()}>
            <Icon nom="send" taille={14} /> {genre === 'attentes' ? 'Envoyer mes attentes' : 'Envoyer mon avis'}
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
              <Icon nom="lock" taille={12} /> Votre voix est transcrite, puis l’enregistrement est effacé : seul le texte
              est conservé.
            </p>
          </>
        )}

        {message && <p className="xs mt8" style={{ color: 'var(--red)' }}>{message}</p>}

        <p className="xs faint mt16">
          Votre parole reste bloquante : le campus vous attend de l’autre côté.
        </p>
      </div>
      </div>
    </div>
  );
}
