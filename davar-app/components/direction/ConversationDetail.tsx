'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Icon } from '@/components/campus/Icon';

export type MessageAffiche = {
  id: string;
  auteur: 'student' | 'ai' | 'coach' | 'sys';
  texte: string;
  atMs: number;
  valide: boolean;
};

export type FilDetail = {
  id: string;
  etudiant: string;
  courriel: string;
  formation: string;
  module: string | null;
  mode: string;
  resolue: boolean;
  iaValidee: boolean;
};

/** CONVERSATION (détail) — relire le fil, valider la réponse de l'assistant, répondre à sa place, clôturer. */
export default function ConversationDetail({
  fil,
  messages,
  nomAssistant,
}: {
  fil: FilDetail;
  messages: MessageAffiche[];
  nomAssistant: string;
}) {
  const router = useRouter();
  const [texte, setTexte] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  const aUneReponseIA = messages.some((message) => message.auteur === 'ai');

  async function agir(action: 'repondre' | 'valider' | 'resoudre', corps: Record<string, unknown> = {}) {
    setOccupe(true);
    setNote(null);
    const reponse = await fetch('/api/direction/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: fil.id, action, ...corps }),
    });
    const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    setOccupe(false);
    if (!donnees.ok) {
      setNote('L’action n’a pas abouti.');
      return;
    }
    if (action === 'repondre') setTexte('');
    setNote(donnees.message ?? 'Fait.');
    router.refresh();
  }

  async function envoyer() {
    const contenu = texte.trim();
    if (contenu.length < 2 || occupe) return;
    await agir('repondre', { text: contenu });
  }

  function initiales(nom: string): string {
    return (
      nom
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((mot) => mot[0]?.toUpperCase() ?? '')
        .join('') || 'É'
    );
  }

  function heure(atMs: number): string {
    return new Date(atMs).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <>
      <div className="breadcrumb">
        <Link href="/direction/conversations">Conversations</Link>
        <Icon nom="chevR" taille={12} />
        <span>{fil.etudiant}</span>
      </div>

      {note && (
        <div className="banner info mb16">
          <Icon nom="checkCircle" taille={14} />
          <span>{note}</span>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px', alignItems: 'start' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div className="row">
              <span className="avatar">{initiales(fil.etudiant)}</span>
              <div>
                <b style={{ fontSize: 13.5 }}>{fil.etudiant}</b>
                <div className="xs faint">
                  {fil.module ? `${fil.formation} · ${fil.module}` : fil.formation}
                </div>
              </div>
            </div>
            {fil.resolue ? (
              <span className="badge b-green">Résolue</span>
            ) : (
              <button
                type="button"
                className="btn btn-sm"
                disabled={occupe}
                onClick={() => agir('resoudre')}
              >
                <Icon nom="check" taille={13} /> Clôturer
              </button>
            )}
          </div>

          <div className="chat-msgs" style={{ height: 420 }}>
            {messages.length === 0 && <div className="empty small">Aucun message pour l’instant.</div>}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`msg ${
                  message.auteur === 'student'
                    ? 'me'
                    : message.auteur === 'coach'
                      ? 'coach'
                      : message.auteur === 'ai'
                        ? 'ai'
                        : 'sys'
                }`}
              >
                {message.auteur !== 'sys' && (
                  <span className="who">
                    {message.auteur === 'student'
                      ? `${fil.etudiant} · ${heure(message.atMs)}`
                      : message.auteur === 'ai'
                        ? `${nomAssistant}${message.valide ? ' · validée' : ''} · ${heure(message.atMs)}`
                        : `Coach · ${heure(message.atMs)}`}
                  </span>
                )}
                <span className="bubble" style={{ whiteSpace: 'pre-wrap' }}>
                  {message.texte}
                </span>
              </div>
            ))}
          </div>

          <div className="chat-foot">
            <div className="chat-input">
              <input
                ref={champ}
                className="inp"
                value={texte}
                placeholder="Répondre en tant que coach…"
                onChange={(evenement) => setTexte(evenement.target.value)}
                onKeyDown={(evenement) => {
                  if (evenement.key === 'Enter') void envoyer();
                }}
              />
              <button type="button" className="btn btn-primary" disabled={occupe} onClick={() => void envoyer()}>
                <Icon nom="send" taille={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <div className="card card-pad">
            <div className="eyebrow mb8">Supervision IA</div>
            {aUneReponseIA && !fil.iaValidee ? (
              <>
                <p className="xs muted mb8">
                  La réponse de {nomAssistant} n’a pas encore été revue par un humain.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-sm"
                  disabled={occupe}
                  onClick={() => agir('valider')}
                >
                  <Icon nom="shieldCheck" taille={14} /> Valider la réponse IA
                </button>
                <button
                  type="button"
                  className="btn btn-block btn-sm mt8"
                  disabled={occupe}
                  onClick={() => {
                    setNote('Écrivez votre correction ci-dessous : elle remplacera la réponse de l’assistant.');
                    champ.current?.focus();
                  }}
                >
                  <Icon nom="edit" taille={14} /> Corriger / compléter
                </button>
              </>
            ) : aUneReponseIA ? (
              <div className="banner ok" style={{ padding: '10px 12px' }}>
                <Icon nom="checkCircle" taille={14} />
                <span className="small">Réponse IA validée par l’équipe.</span>
              </div>
            ) : (
              <p className="xs muted">Aucune réponse IA dans cette conversation.</p>
            )}
          </div>

          <div className="card card-pad">
            <div className="eyebrow mb8">Règles d’accompagnement</div>
            <ul className="xs muted" style={{ marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>IA immédiatement, humain lorsque nécessaire.</li>
              <li>Le coach voit la question, la réponse IA et l’historique.</li>
              <li>Le coach peut valider, corriger ou se substituer à l’IA.</li>
            </ul>
          </div>

        </div>
      </div>
    </>
  );
}
