'use client';

import { useState } from 'react';

type Champs = {
  'support.whatsapp': string;
  'support.phone': string;
  'support.email': string;
  'emails.support': string;
  'emails.direction': string;
  'social.instagram': string;
  'social.tiktok': string;
  'social.facebook': string;
  'announce.text': string;
  'announce.active': string;
  'announce.audience': string;
};

/**
 * RÉGLAGES DU CAMPUS — ce que les étudiants voient et par où ils vous joignent.
 * Les valeurs affichées au départ sont celles de votre prototype : elles ne
 * disparaissent jamais, elles ne font que s’affiner.
 */
export function ReglagesAdmin({ initiaux }: { initiaux: Record<string, string> }) {
  const [champs, setChamps] = useState<Champs>(() => ({
    'support.whatsapp': initiaux['support.whatsapp'] ?? '',
    'support.phone': initiaux['support.phone'] ?? '',
    'support.email': initiaux['support.email'] ?? '',
    'emails.support': initiaux['emails.support'] ?? '',
    'emails.direction': initiaux['emails.direction'] ?? '',
    'social.instagram': initiaux['social.instagram'] ?? '',
    'social.tiktok': initiaux['social.tiktok'] ?? '',
    'social.facebook': initiaux['social.facebook'] ?? '',
    'announce.text': initiaux['announce.text'] ?? '',
    'announce.active': initiaux['announce.active'] ?? '0',
    'announce.audience': initiaux['announce.audience'] ?? 'all',
  }));
  const [note, setNote] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  function changer(cle: keyof Champs, valeur: string) {
    setChamps((precedents) => ({ ...precedents, [cle]: valeur }));
  }

  async function enregistrer() {
    setNote(null);
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await fetch('/api/direction/systeme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reglages', reglages: champs }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!donnees.ok) setErreur(donnees.message ?? 'Enregistrement refusé.');
      else setNote(donnees.message ?? 'Réglages enregistrés.');
    } finally {
      setEnCours(false);
    }
  }

  const champ = (cle: keyof Champs, etiquette: string, aide: string, type = 'text') => (
    <label style={{ display: 'block' }}>
      <span className="eyebrow" style={{ display: 'block', marginBottom: 4 }}>{etiquette}</span>
      <input
        className="input"
        type={type}
        value={champs[cle]}
        onChange={(evenement) => changer(cle, evenement.target.value)}
        placeholder={aide}
      />
    </label>
  );

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card card-pad">
        <h3 className="mb4">Comment les étudiants vous joignent</h3>
        <p className="small muted mb16">
          Le bouton d’aide flottant du campus utilise ces valeurs. L’appel et WhatsApp ouvrent directement sur son
          téléphone.
        </p>
        <div className="col" style={{ gap: 12 }}>
          {champ('support.whatsapp', 'Lien WhatsApp', 'https://wa.me/message/…')}
          {champ('support.phone', 'Numéro d’appel', '+225 …', 'tel')}
          {champ('support.email', 'Adresse d’aide affichée', 'support.davaracademie@gmail.com', 'email')}
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="mb4">Adresses d’envoi</h3>
        <p className="small muted mb16">Elles servent aux messages automatiques et à leurs copies.</p>
        <div className="col" style={{ gap: 12 }}>
          {champ('emails.support', 'Assistance', 'support@…', 'email')}
          {champ('emails.direction', 'Direction', 'direction@…', 'email')}
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="mb4">Réseaux</h3>
        <p className="small muted mb16">
          Affichés dans le bandeau du bas, à côté des demandes d’abonnement. Un réseau disparaît des propositions dès
          que l’étudiant confirme son abonnement — et le propriétaire ne voit jamais ce bandeau chez lui. Adresses
          https exigées.
        </p>
        <div className="col" style={{ gap: 12 }}>
          {champ('social.instagram', 'Instagram', 'https://instagram.com/…')}
          {champ('social.tiktok', 'TikTok', 'https://tiktok.com/@…')}
          {champ('social.facebook', 'Facebook', 'https://facebook.com/…')}
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="mb4">Bandeau d’annonce</h3>
        <p className="small muted mb16">
          Un mot d’information en haut du campus, pour tous. Laissez vide pour l’éteindre.
        </p>
        <div className="col" style={{ gap: 12 }}>
          {champ('announce.text', 'Texte du bandeau', 'Ex. : Nouveau module disponible')}
          <label className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={champs['announce.active'] === '1'}
              onChange={(evenement) => changer('announce.active', evenement.target.checked ? '1' : '0')}
            />
            <span className="small">Afficher l’annonce dans le campus</span>
          </label>
          <label style={{ display: 'block' }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 4 }}>Qui la voit ?</span>
            <select
              className="inp"
              value={champs['announce.audience']}
              onChange={(evenement) => changer('announce.audience', evenement.target.value)}
            >
              <option value="all">Tout le monde</option>
              <option value="students">Les étudiants seulement</option>
              <option value="staff">L’équipe seulement</option>
            </select>
          </label>
        </div>
      </div>

      {(note || erreur) && (
        <p className="small" style={erreur ? { color: 'var(--red, #c0392b)' } : undefined}>
          {erreur ?? note}
        </p>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" type="button" disabled={enCours} onClick={enregistrer}>
          {enCours ? 'Enregistrement…' : 'Enregistrer les réglages'}
        </button>
      </div>
    </div>
  );
}
