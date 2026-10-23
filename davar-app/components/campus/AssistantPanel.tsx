'use client';

import { useState } from 'react';
import { Icon } from './Icon';

export type MessagePanneau = { id: string; auteur: 'student' | 'ai' | 'coach' | 'sys'; texte: string; atMs: number };

function heure(atMs: number): string {
  try {
    return new Date(atMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * PANNEAU DE DISCUSSION — copie fidèle de `chatPanelHTML()` du prototype.
 *
 * Deux onglets, jamais confondus : « Assistant virtuel — immédiat » et « Coach humain ».
 * La ligne de contexte affiche le module et la formation, comme dans le prototype.
 * Le coach peut intervenir à tout moment : la réponse de l'assistant n'est pas un mur.
 */
export function AssistantPanel({
  nom,
  hue,
  formationId,
  formationTitre,
  moduleId,
  moduleTitre,
  messagesIA,
  messagesCoach,
  apercu = false,
}: {
  nom: string;
  hue: number;
  formationId: string;
  formationTitre: string;
  moduleId: string | null;
  moduleTitre: string | null;
  messagesIA: MessagePanneau[];
  messagesCoach: MessagePanneau[];
  apercu?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState<'ai' | 'coach'>('ai');
  const [messages, setMessages] = useState<{ ai: MessagePanneau[]; coach: MessagePanneau[] }>({
    ai: messagesIA,
    coach: messagesCoach,
  });
  const [question, setQuestion] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fil = mode === 'ai' ? messages.ai : messages.coach;

  async function envoyer() {
    const texte = question.trim();
    if (texte.length < 3 || enCours) return;
    const provisoire: MessagePanneau = { id: `local_${Date.now()}`, auteur: 'student', texte, atMs: Date.now() };
    setMessages((actuel) =>
      mode === 'ai' ? { ...actuel, ai: [...actuel.ai, provisoire] } : { ...actuel, coach: [...actuel.coach, provisoire] }
    );
    setQuestion('');
    setEnCours(true);
    setNote(null);
    try {
      const reponse = await fetch('/api/campus/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formationId, moduleId, mode, text: texte }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { reponse?: string; message?: string; error?: string };
      if (donnees.reponse) {
        const reponseIA: MessagePanneau = {
          id: `rep_${Date.now()}`,
          auteur: mode === 'ai' ? 'ai' : 'sys',
          texte: donnees.reponse,
          atMs: Date.now(),
        };
        setMessages((actuel) =>
          mode === 'ai' ? { ...actuel, ai: [...actuel.ai, reponseIA] } : { ...actuel, coach: [...actuel.coach, reponseIA] }
        );
      } else if (donnees.message) {
        setNote(donnees.message);
      }
    } catch {
      setNote('Le réseau n’a pas répondu. Réessayez dans un instant.');
    }
    setEnCours(false);
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOuvert(true)}>
        <Icon nom="sparkles" taille={15} /> Demander à {nom}
      </button>
      <div className="xs faint" style={{ textAlign: 'center' }}>
        {nom} (IA) répond immédiatement · Coach humain sous 48 h
      </div>

      {ouvert && (
        <div className="chat-overlay" onClick={(evenement) => evenement.target === evenement.currentTarget && setOuvert(false)}>
          <div className="chat-panel">
            <div className="chat-head">
              <span className="avatar" style={{ background: `hsl(${hue} 60% 45%)`, overflow: 'hidden' }}>
                <Icon nom="sparkles" taille={15} />
              </span>
              <div className="wrap">
                <b style={{ fontSize: 13.5 }}>{nom}</b>
                <div className="xs faint">Assistant virtuel · supervisé par vos coachs</div>
              </div>
              <button className="icon-btn" onClick={() => setOuvert(false)} aria-label="Fermer">
                <Icon nom="x" taille={17} />
              </button>
            </div>

            <div className="chat-tabs">
              <button className={`chat-tab ${mode === 'ai' ? 'active' : ''}`} onClick={() => setMode('ai')}>
                <Icon nom="sparkles" taille={14} /> Assistant virtuel — immédiat
              </button>
              <button className={`chat-tab coach ${mode === 'coach' ? 'active' : ''}`} onClick={() => setMode('coach')}>
                <Icon nom="message" taille={14} /> Coach humain
              </button>
            </div>

            <div className="chat-ctx">
              <Icon nom="book" taille={11} /> Contexte : {moduleTitre ?? 'module en cours'} — {formationTitre}
            </div>

            <div className="chat-msgs">
              {fil.length === 0 && (
                <div className="empty small">
                  {mode === 'ai'
                    ? `Posez vos questions. ${nom} est le cerveau virtuel de votre coach. Il répond à partir des connaissances fournies par le coach principal. N’hésitez pas.`
                    : 'Votre question sera transmise à votre coach.'}
                </div>
              )}
              {fil.map((message) => (
                <div key={message.id} className={`msg ${message.auteur === 'student' ? 'me' : message.auteur === 'coach' ? 'coach' : message.auteur === 'ai' ? 'ai' : 'sys'}`}>
                  {message.auteur !== 'sys' && (
                    <span className="who">
                      {message.auteur === 'student' ? `Vous · ${heure(message.atMs)}` : message.auteur === 'ai' ? `${nom} · ${heure(message.atMs)}` : `Coach · ${heure(message.atMs)}`}
                    </span>
                  )}
                  <span className="bubble" style={{ whiteSpace: 'pre-wrap' }}>
                    {message.texte}
                  </span>
                </div>
              ))}
              {enCours && (
                <div className="msg ai">
                  <span className="who">{nom}</span>
                  <span className="bubble">
                    <span className="typing">
                      <i></i>
                      <i></i>
                      <i></i>
                    </span>
                  </span>
                </div>
              )}
            </div>

            <div className="chat-foot">
              {note && (
                <div className="chat-note" style={{ color: 'var(--gold2)' }}>
                  <Icon nom="alert" taille={13} /> {note}
                </div>
              )}
              {mode === 'coach' ? (
                <div className="chat-note">
                  <Icon nom="clock" taille={13} /> Votre Coach répond généralement sous <b>&nbsp;48 heures</b>.
                </div>
              ) : (
                <div className="chat-note">
                  <Icon nom="zap" taille={13} /> Réponse immédiate. Un coach peut intervenir à tout moment pour valider ou compléter.
                </div>
              )}
              {apercu && (
                <div className="chat-note">
                  <Icon nom="eye" taille={13} /> Vue test : la réponse est affichée, rien n’est enregistré.
                </div>
              )}
              <div className="chat-input">
                <input
                  className="inp"
                  placeholder="Écrivez votre question…"
                  value={question}
                  maxLength={1200}
                  onChange={(evenement) => setQuestion(evenement.target.value)}
                  onKeyDown={(evenement) => evenement.key === 'Enter' && void envoyer()}
                />
                <button className="btn btn-primary" disabled={enCours} onClick={() => void envoyer()}>
                  <Icon nom="send" taille={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
