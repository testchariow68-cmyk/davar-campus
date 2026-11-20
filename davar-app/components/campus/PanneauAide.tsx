'use client';

import { useState } from 'react';
import { Icon } from './Icon';

export type Contacts = { whatsapp: string; telephone: string; courriel: string };

/** Les formats acceptés en pièce jointe : une capture, un document, rien d'autre. */
const FORMATS = 'image/png,image/jpeg,image/webp,application/pdf';
const TAILLE_MAXIMALE = 5 * 1024 * 1024;

/**
 * LES MOYENS DE CONTACT RÉELS — le contenu du casque flottant, et celui de la
 * carte « Support » des paramètres. Un seul panneau, deux portes d'entrée.
 *
 * S'y ajoute « Écrire au support », avec une PIÈCE JOINTE : le propriétaire
 * l'a demandé, pour qu'un étudiant montre ce qui ne va pas plutôt que de le
 * décrire. Le fichier part directement au stockage ; notre base ne garde que
 * sa clé, jamais le fichier.
 */
export function PanneauAide({ contacts, onFermer }: { contacts: Contacts; onFermer: () => void }) {
  const [ecrire, setEcrire] = useState(false);
  const [message, setMessage] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'depot'>('repos');
  const [retour, setRetour] = useState<string | null>(null);

  async function envoyer() {
    setEtat('envoi');
    setRetour(null);
    let cle: string | null = null;
    try {
      if (fichier) {
        setEtat('depot');
        const demande = await fetch('/api/campus/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'depot', fileName: fichier.name }),
        });
        const adresse = (await demande.json().catch(() => ({}))) as { ok?: boolean; url?: string; cle?: string; message?: string };
        if (!adresse.ok || !adresse.url || !adresse.cle) {
          setRetour(adresse.message ?? 'La pièce jointe n’a pas pu être préparée.');
          setEtat('repos');
          return;
        }
        const depot = await fetch(adresse.url, {
          method: 'PUT',
          body: fichier,
          headers: { 'content-type': fichier.type || 'application/octet-stream' },
        });
        if (!depot.ok) {
          setRetour('La pièce jointe n’est pas partie. Réessayez, ou envoyez votre message sans pièce.');
          setEtat('repos');
          return;
        }
        cle = adresse.cle;
      }

      const reponse = await fetch('/api/campus/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'envoyer', body: message, fileKey: cle, fileName: fichier?.name ?? null }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (donnees.ok) {
        setRetour(donnees.message ?? 'Message transmis.');
        setMessage('');
        setFichier(null);
        setEtat('repos');
        return;
      }
      setRetour(donnees.message ?? 'Votre message n’est pas parti.');
    } catch {
      setRetour('Le réseau n’a pas répondu.');
    }
    setEtat('repos');
  }

  return (
    <>
      <div className="sup-pop-back" onClick={onFermer} />
      <div className="sup-pop" role="dialog" aria-label="Aide">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <b>Besoin d&apos;aide ?</b>
            <span className="xs muted">Écrivez-nous : nous répondons sous 48 h maximum.</span>
          </div>
          <button className="icon-btn" onClick={onFermer} aria-label="Fermer">
            <Icon nom="x" taille={16} />
          </button>
        </div>

        {!ecrire ? (
          <div className="col" style={{ gap: 9, marginTop: 12 }}>
            <a className="sp-btn" href={contacts.whatsapp} target="_blank" rel="noopener">
              <span className="ic">
                <Icon nom="whatsapp" taille={15} />
              </span>
              <span className="wrap">
                <span className="lb">WhatsApp</span>
                <small>Réponse rapide sur votre téléphone.</small>
              </span>
            </a>
            <a className="sp-btn" href={`tel:${contacts.telephone.replace(/\s+/g, '')}`}>
              <span className="ic">
                <Icon nom="phone" taille={15} />
              </span>
              <span className="wrap">
                <span className="lb">Appeler</span>
                <small>Ouvre directement votre téléphone.</small>
              </span>
            </a>
            <a className="sp-btn" href={`mailto:${contacts.courriel}`}>
              <span className="ic">
                <Icon nom="mail" taille={15} />
              </span>
              <span className="wrap">
                <span className="lb">Envoyer un e-mail</span>
                <small>{contacts.courriel}</small>
              </span>
            </a>
            <button className="sp-btn" onClick={() => setEcrire(true)}>
              <span className="ic">
                <Icon nom="edit" taille={15} />
              </span>
              <span className="wrap">
                <span className="lb">Écrire au support</span>
                <small>Un message, et une capture si besoin.</small>
              </span>
            </button>
          </div>
        ) : (
          <div className="col" style={{ gap: 8, marginTop: 12 }}>
            <textarea
              className="inp"
              rows={4}
              value={message}
              onChange={(evenement) => setMessage(evenement.target.value)}
              placeholder="Décrivez votre problème…"
            />
            <label className="row xs" style={{ gap: 8, flexWrap: 'wrap' }}>
              <input
                type="file"
                accept={FORMATS}
                onChange={(evenement) => {
                  const choix = evenement.target.files?.[0] ?? null;
                  if (choix && choix.size > TAILLE_MAXIMALE) {
                    setRetour('Votre fichier dépasse 5 Mo. Recadrez votre capture, puis réessayez.');
                    evenement.target.value = '';
                    return;
                  }
                  setRetour(null);
                  setFichier(choix);
                }}
              />
              <span className="muted">
                Une capture d’écran (PNG, JPEG, WebP) ou un PDF — 5 Mo au plus.
              </span>
            </label>
            {fichier && (
              <span className="xs">
                <Icon nom="paperclip" taille={12} /> {fichier.name}
              </span>
            )}
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={etat !== 'repos' || message.trim().length < 10}
                onClick={() => void envoyer()}
              >
                <Icon nom="send" taille={14} /> {etat === 'depot' ? 'Envoi de la pièce…' : 'Envoyer'}
              </button>
              <button className="btn" onClick={() => setEcrire(false)}>
                Retour
              </button>
            </div>
          </div>
        )}

        {retour && <p className="xs muted mt8">{retour}</p>}
      </div>
    </>
  );
}

/** Un bouton qui ouvre le panneau d'aide — les paramètres s'en servent trois fois. */
export function BoutonAide({
  contacts,
  libelle,
  icone,
  style,
}: {
  contacts: Contacts;
  libelle: string;
  icone: 'message' | 'mail';
  style?: React.CSSProperties;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button
        className="btn"
        style={{ width: '100%', marginBottom: 8, ...style }}
        onClick={() => setOuvert(true)}
      >
        <Icon nom={icone} taille={16} /> {libelle}
      </button>
      {ouvert && <PanneauAide contacts={contacts} onFermer={() => setOuvert(false)} />}
    </>
  );
}
