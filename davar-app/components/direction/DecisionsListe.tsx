'use client';

import { useState } from 'react';
import { Icon } from '@/components/campus/Icon';

export type ElementADecider = {
  id: string;
  titre: string;
  sousTitre: string;
  detail: string | null;
  meta: string;
  statut: string;
  /** Pour un devoir : « devoir ». Pour un certificat : « certificat ». */
  genre: 'devoir' | 'certificat';
};

/**
 * VALIDER OU REFUSER — les deux décisions humaines de la plateforme.
 * Un refus SANS explication est refusé par le serveur : l'explication est
 * obligatoire, parce qu'un refus muet serait un mur pour l'étudiant.
 */
export function DecisionsListe({ elements }: { elements: ElementADecider[] }) {
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [etats, setEtats] = useState<Record<string, string>>({});
  const [traites, setTraites] = useState<string[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function decider(element: ElementADecider, decision: 'approved' | 'refused') {
    setEnCours(element.id);
    setNote(null);
    try {
      const reponse = await fetch('/api/direction/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: element.genre, id: element.id, decision, motif: motifs[element.id] ?? '' }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string; code?: string };
      if (donnees.ok) {
        const message = donnees.code ? `${donnees.message}` : (donnees.message ?? 'Décision enregistrée.');
        setEtats((actuel) => ({ ...actuel, [element.id]: message }));
        setTraites((actuel) => [...actuel, element.id]);
        setNote(message);
      } else {
        setNote(donnees.message ?? 'La décision n’a pas abouti.');
      }
    } catch {
      setNote('Le réseau n’a pas répondu.');
    }
    setEnCours(null);
  }

  const restants = elements.filter((element) => !traites.includes(element.id));

  if (elements.length === 0) {
    return (
      <div className="card card-pad">
        <div className="empty">
          <Icon nom="checkCircle" taille={24} />
          <h3 className="mt16">Rien en attente</h3>
          <p className="muted small mt8">Tout est traité. Les nouvelles demandes apparaîtront ici.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {note && (
        <div className="banner info mb16">
          <Icon nom="checkCircle" taille={14} />
          <span>{note}</span>
        </div>
      )}
      <div className="col" style={{ gap: 10 }}>
        {restants.map((element) => (
          <div className="card card-pad" key={element.id}>
            <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span>
                <b>{element.titre}</b>
                <div className="xs faint">{element.sousTitre}</div>
              </span>
              <span className="badge b-gold">{element.meta}</span>
            </div>
            {element.detail && <p className="small muted mt8" style={{ whiteSpace: 'pre-wrap' }}>{element.detail}</p>}

            <div className="field mt16">
              <label>Motif (obligatoire pour un refus)</label>
              <textarea
                className="inp"
                rows={2}
                maxLength={800}
                value={motifs[element.id] ?? ''}
                onChange={(evenement) => setMotifs((actuel) => ({ ...actuel, [element.id]: evenement.target.value }))}
                placeholder={
                  element.genre === 'devoir'
                    ? 'Ce qui doit être repris, comment l’améliorer…'
                    : 'La raison du refus, s’il y en a une.'
                }
              />
            </div>

            <div className="row mt8" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" disabled={enCours === element.id} onClick={() => void decider(element, 'approved')}>
                <Icon nom="checkCircle" taille={14} /> Valider
              </button>
              <button className="btn btn-sm" disabled={enCours === element.id} onClick={() => void decider(element, 'refused')}>
                <Icon nom="x" taille={14} /> Refuser
              </button>
              {etats[element.id] && <span className="xs muted">{etats[element.id]}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
