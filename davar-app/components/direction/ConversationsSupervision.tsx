'use client';

import { useState } from 'react';
import { Icon } from '@/components/campus/Icon';

export type FilAffiche = {
  id: string;
  etudiant: string;
  courriel: string;
  formation: string;
  module: string | null;
  mode: string;
  resolue: boolean;
  iaValidee: boolean;
  dernierMessage: string | null;
  nbMessages: number;
  atMs: number;
};

/**
 * SUPERVISION DES CONVERSATIONS — « L'assistant répond en premier niveau. Les coachs
 * peuvent valider, corriger ou répondre à la place de l'IA — sans jamais être bloqués
 * par elle. » Répondre en coach valide la réponse de l'assistant du même geste.
 */
export function ConversationsSupervision({ fils }: { fils: FilAffiche[] }) {
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [etats, setEtats] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  async function agir(conversationId: string, corps: Record<string, unknown>, message: string) {
    setEnCours(conversationId);
    setNote(null);
    try {
      const reponse = await fetch('/api/direction/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, ...corps }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (donnees.ok) {
        setNote(donnees.message ?? message);
        setEtats((actuel) => ({ ...actuel, [conversationId]: message }));
      } else {
        setNote("L'action n'a pas abouti.");
      }
    } catch {
      setNote('Le réseau n’a pas répondu.');
    }
    setEnCours(null);
  }

  if (fils.length === 0) {
    return (
      <div className="card card-pad">
        <div className="empty">
          <Icon nom="message" taille={24} />
          <h3 className="mt16">Aucune conversation</h3>
          <p className="muted small mt8">
            Les questions des étudiants apparaîtront ici, avec la réponse de l’assistant et la possibilité
            de la valider, de la corriger ou de répondre vous-même.
          </p>
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
        {fils.map((fil) => (
          <div className="card card-pad" key={fil.id}>
            <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Icon nom={fil.mode === 'coach' ? 'message' : 'sparkles'} taille={15} />
                <b className="small">{fil.etudiant}</b>
                <span className="xs faint">{fil.courriel}</span>
                <span className="badge b-grey">{fil.formation}</span>
                {fil.module && <span className="badge b-grey">{fil.module}</span>}
                {fil.mode === 'coach' ? (
                  <span className="badge b-gold">coach humain</span>
                ) : fil.iaValidee ? (
                  <span className="badge b-green">IA validée</span>
                ) : (
                  <span className="badge b-violet">IA à superviser</span>
                )}
                {fil.resolue && <span className="badge b-green">close</span>}
              </span>
              <span className="xs muted">{fil.nbMessages} message(s)</span>
            </div>

            {fil.dernierMessage && (
              <p className="small muted mt8" style={{ whiteSpace: 'pre-wrap' }}>
                {fil.dernierMessage.slice(0, 220)}
                {fil.dernierMessage.length > 220 ? '…' : ''}
              </p>
            )}

            <div className="row mt16" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => setOuverts((actuel) => ({ ...actuel, [fil.id]: !actuel[fil.id] }))}>
                <Icon nom="message" taille={14} /> Répondre en coach
              </button>
              {fil.mode === 'ai' && !fil.iaValidee && (
                <button
                  className="btn btn-sm"
                  disabled={enCours === fil.id}
                  onClick={() => void agir(fil.id, { action: 'valider' }, 'Réponse validée.')}
                >
                  <Icon nom="checkCircle" taille={14} /> Valider la réponse
                </button>
              )}
              {!fil.resolue && (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={enCours === fil.id}
                  onClick={() => void agir(fil.id, { action: 'resoudre' }, 'Conversation close.')}
                >
                  <Icon nom="check" taille={14} /> Clore
                </button>
              )}
              {etats[fil.id] && <span className="xs muted">{etats[fil.id]}</span>}
            </div>

            {ouverts[fil.id] && (
              <div className="mt16">
                <textarea
                  className="inp"
                  rows={3}
                  maxLength={2000}
                  placeholder="Votre réponse, au nom du coach…"
                  value={reponses[fil.id] ?? ''}
                  onChange={(evenement) => setReponses((actuel) => ({ ...actuel, [fil.id]: evenement.target.value }))}
                />
                <button
                  className="btn btn-primary btn-sm mt8"
                  disabled={enCours === fil.id || (reponses[fil.id] ?? '').trim().length < 2}
                  onClick={async () => {
                    await agir(fil.id, { action: 'repondre', text: reponses[fil.id] }, 'Réponse envoyée : l’étudiant est notifié.');
                    setReponses((actuel) => ({ ...actuel, [fil.id]: '' }));
                  }}
                >
                  <Icon nom="send" taille={14} /> Envoyer la réponse
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
