'use client';

import { useState } from 'react';

type TypeAnnonce = 'info' | 'nouveaute' | 'evenement' | 'rappel';
type AudienceAnnonce = 'all' | 'students' | 'staff';
type AnnonceEdition = {
  id: string;
  type: TypeAnnonce;
  texte: string;
  audience: AudienceAnnonce;
  active: boolean;
  expiration: string;
};

type Champs = {
  'support.whatsapp': string;
  'support.phone': string;
  'support.email': string;
  'emails.support': string;
  'emails.direction': string;
  'social.instagram': string;
  'social.tiktok': string;
  'social.facebook': string;
  'announce.items': string;
  'announce.text': string;
  'announce.active': string;
  'announce.audience': string;
};

function dateLocale(ms: unknown): string {
  const nombre = typeof ms === 'number'
    ? ms
    : typeof ms === 'string' && ms.trim()
      ? (Number.isFinite(Number(ms)) ? Number(ms) : Date.parse(ms))
      : NaN;
  if (!Number.isFinite(nombre) || nombre <= 0) return '';
  const date = new Date(nombre);
  const pad = (valeur: number) => String(valeur).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function lireAnnoncesInitiales(initiaux: Record<string, string>): AnnonceEdition[] {
  const brut = initiaux['announce.items']?.trim();
  if (brut) {
    try {
      const valeurs = JSON.parse(brut);
      if (Array.isArray(valeurs)) {
        return valeurs.flatMap((valeur, index) => {
          if (!valeur || typeof valeur !== 'object') return [];
          const entree = valeur as Record<string, unknown>;
          const texte = typeof entree.texte === 'string' ? entree.texte : typeof entree.text === 'string' ? entree.text : '';
          return [{
            id: typeof entree.id === 'string' && entree.id ? entree.id : `annonce-${index + 1}`,
            type: entree.type === 'nouveaute' || entree.type === 'evenement' || entree.type === 'rappel' ? entree.type : 'info',
            texte,
            audience: entree.audience === 'students' || entree.audience === 'staff' ? entree.audience : 'all',
            active: entree.active !== false,
            expiration: dateLocale(entree.expirationMs ?? entree.expiresAt ?? entree.expiration),
          } satisfies AnnonceEdition];
        });
      }
    } catch {
      /* une ancienne saisie invalide ne doit pas bloquer l'écran */
    }
  }
  const texteHistorique = initiaux['announce.text']?.trim() ?? '';
  return texteHistorique && initiaux['announce.active'] === '1'
    ? [{
        id: 'annonce-historique',
        type: 'info',
        texte: texteHistorique,
        audience: initiaux['announce.audience'] === 'students' || initiaux['announce.audience'] === 'staff' ? initiaux['announce.audience'] : 'all',
        active: true,
        expiration: '',
      }]
    : [];
}

function versStockage(annonces: AnnonceEdition[]): string {
  return JSON.stringify(
    annonces
      .map((annonce) => ({
        id: annonce.id,
        type: annonce.type,
        texte: annonce.texte.trim().slice(0, 300),
        audience: annonce.audience,
        active: annonce.active,
        expirationMs: annonce.expiration ? Date.parse(annonce.expiration) : null,
      }))
      .filter((annonce) => annonce.texte.length > 0)
  );
}

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
    'announce.items': initiaux['announce.items'] ?? '',
    'announce.text': initiaux['announce.text'] ?? '',
    'announce.active': initiaux['announce.active'] ?? '0',
    'announce.audience': initiaux['announce.audience'] ?? 'all',
  }));
  const [annonces, setAnnonces] = useState<AnnonceEdition[]>(() => lireAnnoncesInitiales(initiaux));
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
        body: JSON.stringify({
          action: 'reglages',
          reglages: {
            ...champs,
            'announce.items': versStockage(annonces),
            // L'ancienne annonce unique est neutralisée quand la liste est
            // enregistrée, afin qu'un message supprimé ne réapparaisse pas.
            'announce.text': '',
            'announce.active': '0',
          },
        }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!donnees.ok) setErreur(donnees.message ?? 'Enregistrement refusé.');
      else setNote(donnees.message ?? 'Réglages enregistrés.');
    } finally {
      setEnCours(false);
    }
  }

  function ajouterAnnonce() {
    setAnnonces((liste) => [
      ...liste,
      {
        id: `annonce-${Date.now().toString(36)}-${liste.length}`,
        type: 'info',
        texte: '',
        audience: 'all',
        active: true,
        expiration: '',
      },
    ]);
  }

  function modifierAnnonce(index: number, modification: Partial<AnnonceEdition>) {
    setAnnonces((liste) => liste.map((annonce, rang) => (rang === index ? { ...annonce, ...modification } : annonce)));
  }

  function supprimerAnnonce(index: number) {
    setAnnonces((liste) => liste.filter((_, rang) => rang !== index));
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

      <div className="card card-pad ticker-admin">
        <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 className="mb4">Messages du bandeau</h3>
            <p className="small muted mb16">
              Ajoutez plusieurs informations — nouveauté, événement, rappel — qui défileront avec les réseaux.
              Chaque message peut expirer automatiquement.
            </p>
          </div>
          <button className="btn btn-sm" type="button" onClick={ajouterAnnonce}>+ Ajouter</button>
        </div>

        {annonces.length === 0 ? (
          <div className="ticker-admin-empty small muted">Aucun message programmé pour l’instant.</div>
        ) : (
          <div className="ticker-admin-list">
            {annonces.map((annonce, index) => (
              <div className="ticker-admin-item" key={annonce.id}>
                <div className="row between mb8">
                  <b>Message {index + 1}</b>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => supprimerAnnonce(index)}>Supprimer</button>
                </div>
                <div className="ticker-admin-grid">
                  <label>
                    <span className="eyebrow">Type</span>
                    <select className="inp" value={annonce.type} onChange={(evenement) => modifierAnnonce(index, { type: evenement.target.value as TypeAnnonce })}>
                      <option value="info">Information</option>
                      <option value="nouveaute">Nouveauté</option>
                      <option value="evenement">Événement</option>
                      <option value="rappel">Rappel</option>
                    </select>
                  </label>
                  <label>
                    <span className="eyebrow">Audience</span>
                    <select className="inp" value={annonce.audience} onChange={(evenement) => modifierAnnonce(index, { audience: evenement.target.value as AudienceAnnonce })}>
                      <option value="all">Tout le monde</option>
                      <option value="students">Les étudiants seulement</option>
                      <option value="staff">L’équipe seulement</option>
                    </select>
                  </label>
                </div>
                <label className="ticker-admin-message">
                  <span className="eyebrow">Message à faire défiler</span>
                  <textarea className="inp" rows={2} maxLength={300} value={annonce.texte} onChange={(evenement) => modifierAnnonce(index, { texte: evenement.target.value })} placeholder="Ex. : Nouveau module disponible vendredi." />
                </label>
                <div className="ticker-admin-grid">
                  <label>
                    <span className="eyebrow">Expiration (facultative)</span>
                    <input className="inp" type="datetime-local" value={annonce.expiration} onChange={(evenement) => modifierAnnonce(index, { expiration: evenement.target.value })} />
                  </label>
                  <label className="row ticker-admin-active">
                    <input type="checkbox" checked={annonce.active} onChange={(evenement) => modifierAnnonce(index, { active: evenement.target.checked })} />
                    <span className="small">Afficher ce message</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="btn mt16" type="button" onClick={ajouterAnnonce}>+ Ajouter un autre message</button>
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
