'use client';

import { useState } from 'react';
import { Icon } from './Icon';

export type QuestionAffichee = { id: string; position: number; question: string; options: string[]; explication?: string | null; explain?: string | null };
export type EvaluationAffichee = {
  id: string;
  questions: QuestionAffichee[];
  title: string;
  intro: string | null;
  minScore: number;
  reussie: boolean;
  meilleurPct: number | null;
  tentativeCount: number;
  devoir: { statut: string; motif: string | null } | null;
};

type Correction = { questionId: string; correct: boolean; bonne: number; explication: string | null };

/**
 * EXERCICE ET ÉVALUATION — la distinction est capitale, et elle est écrite :
 *   - l'EXERCICE NE BLOQUE JAMAIS : il entraîne, il corrige, il explique ;
 *   - l'ÉVALUATION BLOQUE : score minimum, et validation humaine ensuite.
 * L'écran le dit en clair, pour que l'étudiant ne confonde jamais les deux.
 */
export function ExerciceBloc({
  exercice,
  evaluation,
}: {
  exercice: { id: string; title: string; intro: string | null; questions: QuestionAffichee[] } | null;
  evaluation: EvaluationAffichee | null;
}) {
  const [reponses, setReponses] = useState<Record<string, number>>({});
  const [correction, setCorrection] = useState<Correction[] | null>(null);
  const [resultat, setResultat] = useState<{ score: number; total: number; pct: number } | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [noteDevoir, setNoteDevoir] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const questions = exercice?.questions ?? evaluation?.questions ?? [];
  const cible = exercice ? 'exercice' : 'evaluation';
  const identifiant = exercice?.id ?? evaluation?.id ?? '';

  if (!exercice && !evaluation) return null;

  async function repondre() {
    if (questions.some((question) => reponses[question.id] === undefined)) {
      setMessage('Répondez à toutes les questions avant de valider.');
      return;
    }
    setEnCours('repondre');
    setMessage(null);
    try {
      const reponse = await fetch('/api/campus/pedagogie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: cible,
          id: identifiant,
          reponses: questions.map((question) => ({ questionId: question.id, choiceIndex: reponses[question.id] })),
        }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as {
        ok?: boolean;
        score?: number;
        total?: number;
        pct?: number;
        detail?: Correction[];
        error?: string;
      };
      if (donnees.ok && typeof donnees.pct === 'number') {
        setResultat({ score: donnees.score ?? 0, total: donnees.total ?? 0, pct: donnees.pct });
        setCorrection(donnees.detail ?? []);
        // Les badges se vérifient après coup : jamais avant, jamais à la place.
        void fetch('/api/campus/pedagogie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'badges' }),
        });
      } else {
        setMessage('La correction n’a pas abouti. Réessayez.');
      }
    } catch {
      setMessage('Le réseau n’a pas répondu.');
    }
    setEnCours(null);
  }

  async function rendre() {
    if (noteDevoir.trim().length < 5) {
      setMessage('Écrivez quelques mots pour accompagner votre devoir.');
      return;
    }
    setEnCours('devoir');
    setMessage(null);
    try {
      const reponse = await fetch('/api/campus/pedagogie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'devoir', id: evaluation?.id, note: noteDevoir }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      setMessage(donnees.message ?? (donnees.ok ? 'Devoir transmis.' : 'Le devoir n’a pas abouti.'));
      if (donnees.ok) setNoteDevoir('');
    } catch {
      setMessage('Le réseau n’a pas répondu.');
    }
    setEnCours(null);
  }

  return (
    <div className="card card-pad mt16">
      <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15 }}>
          <Icon nom={exercice ? 'clipboard' : 'target'} taille={15} /> {exercice ? exercice.title : evaluation?.title}
        </h3>
        <span className={`badge ${exercice ? 'b-grey' : 'b-gold'}`}>
          {exercice ? 'Entraînement — ne bloque rien' : `Évaluation — minimum ${evaluation?.minScore} %`}
        </span>
      </div>
      {(exercice?.intro || evaluation?.intro) && <p className="small muted mt8">{exercice?.intro ?? evaluation?.intro}</p>}

      {evaluation?.reussie && !exercice && (
        <div className="banner info mt8">
          <Icon nom="checkCircle" taille={14} />
          <span className="small">
            Score atteint : {evaluation.meilleurPct} % ({evaluation.tentativeCount} tentative
            {evaluation.tentativeCount > 1 ? 's' : ''}). Vous pouvez rendre votre devoir pour validation.
          </span>
        </div>
      )}
      {!exercice && !evaluation?.reussie && evaluation && evaluation.meilleurPct !== null && (
        <div className="banner err mt8">
          <Icon nom="alert" taille={14} />
          <span className="small">
            Meilleur score : {evaluation.meilleurPct} % — il faut {evaluation.minScore} % pour continuer. Vous pouvez
            repasser l’évaluation autant de fois que nécessaire.
          </span>
        </div>
      )}

      {questions.map((question) => {
        const ligneCorrection = correction?.find((candidat) => candidat.questionId === question.id);
        return (
          <div key={question.id} className="mt16">
            <b className="small">
              {question.position}. {question.question}
            </b>
            <div className="col mt8" style={{ gap: 6 }}>
              {question.options.map((option, index) => {
                const choisi = reponses[question.id] === index;
                const bonne = ligneCorrection && index === ligneCorrection.bonne;
                return (
                  <label
                    key={index}
                    className="row small"
                    style={{
                      gap: 9,
                      cursor: correction ? 'default' : 'pointer',
                      padding: '7px 10px',
                      borderRadius: 9,
                      background: bonne ? 'var(--violet-soft)' : choisi ? 'var(--gold-soft)' : 'transparent',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      checked={choisi}
                      disabled={Boolean(correction)}
                      onChange={() => setReponses((actuel) => ({ ...actuel, [question.id]: index }))}
                    />
                    <span>{option}</span>
                    {bonne && <span className="badge b-green" style={{ marginLeft: 'auto' }}>bonne réponse</span>}
                    {ligneCorrection && choisi && !ligneCorrection.correct && (
                      <span className="badge b-red" style={{ marginLeft: 'auto' }}>votre choix</span>
                    )}
                  </label>
                );
              })}
            </div>
            {ligneCorrection?.explication && (
              <p className="xs muted mt8" style={{ borderLeft: '2px solid var(--gold)', paddingLeft: 8 }}>
                {ligneCorrection.explication}
              </p>
            )}
          </div>
        );
      })}

      {!correction && (
        <button className="btn btn-primary mt16" disabled={enCours === 'repondre'} onClick={() => void repondre()}>
          <Icon nom="check" taille={15} /> {exercice ? 'Vérifier mes réponses' : 'Passer l’évaluation'}
        </button>
      )}

      {resultat && (
        <p className="small mt16">
          <b>
            {resultat.score} / {resultat.total} — {resultat.pct} %
          </b>{' '}
          {exercice
            ? '— entraînement terminé, rien ne bloque votre progression.'
            : resultat.pct >= (evaluation?.minScore ?? 80)
              ? '— évaluation réussie.'
              : `— il faut ${evaluation?.minScore} % : reprenez quand vous voulez, sans limite.`}
        </p>
      )}

      {!exercice && evaluation?.reussie && evaluation.devoir?.statut !== 'pending' && (
        <div className="mt16">
          <div className="field">
            <label>Votre devoir — décrivez ce que vous avez réalisé</label>
            <textarea
              className="inp"
              rows={4}
              value={noteDevoir}
              onChange={(evenement) => setNoteDevoir(evenement.target.value)}
              placeholder="Ce que vous avez fait, ce que vous en avez appris…"
            />
          </div>
          <button className="btn btn-primary" disabled={enCours === 'devoir'} onClick={() => void rendre()}>
            <Icon nom="upload" taille={15} /> Rendre mon devoir
          </button>
        </div>
      )}

      {!exercice && evaluation?.devoir?.statut === 'pending' && (
        <div className="banner info mt16">
          <Icon nom="clock" taille={14} />
          <span className="small">Votre devoir est en cours de correction par la direction.</span>
        </div>
      )}
      {!exercice && evaluation?.devoir?.statut === 'approved' && (
        <div className="banner info mt16">
          <Icon nom="checkCircle" taille={14} />
          <span className="small">Devoir validé.</span>
        </div>
      )}
      {!exercice && evaluation?.devoir?.statut === 'refused' && (
        <div className="banner err mt16">
          <Icon nom="alert" taille={14} />
          <span className="small">
            Devoir refusé. {evaluation.devoir.motif} — corrigez et rendez de nouveau.
          </span>
        </div>
      )}

      {message && <p className="xs muted mt8">{message}</p>}
    </div>
  );
}
