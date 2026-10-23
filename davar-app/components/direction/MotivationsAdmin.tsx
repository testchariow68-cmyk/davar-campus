'use client';

import { useState } from 'react';
import { messageDe, poster } from './api';

type Etat = {
  liste: string[];
  index: number;
  suivante: string[];
  restantes: number;
  courante: string;
  epuisee: boolean;
  prochainDimancheMs: number;
};

/**
 * MOTIVATIONS — le stock numéroté du propriétaire.
 * Il colle sa liste, retire ce qu'il veut (les numéros se recalent), programme
 * la liste suivante, et envoie celle du dimanche À LA MAIN.
 */
export function MotivationsAdmin({ initial }: { initial: Etat }) {
  const [etat, setEtat] = useState(initial);
  const [texte, setTexte] = useState('');
  const [bilan, setBilan] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  async function agir(corps: Record<string, unknown>, cle: string): Promise<void> {
    setEnCours(cle);
    setBilan(null);
    const reponse = (await poster('/api/direction/motivations', corps)) as Record<string, unknown>;
    setEnCours(null);
    setBilan({ ok: Boolean(reponse.ok), texte: messageDe(reponse as never) });
    if (reponse.etat) setEtat(reponse.etat as Etat);
    if (reponse.ok && (corps.action === 'ajouter' || corps.action === 'remplacer')) setTexte('');
  }

  const prochainDimanche = new Date(etat.prochainDimancheMs).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="card card-pad">
      <div className="row between mb8" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h3 className="mb4">Motivations du dimanche</h3>
          <p className="small muted">
            Une motivation par dimanche, envoyée <b>à la main</b> — jamais deux fois la même. Prochain dimanche :{' '}
            {prochainDimanche}.
          </p>
        </div>
        <span className={etat.restantes > 10 ? 'badge b-grey' : 'badge b-gold'}>
          {etat.restantes} en stock
        </span>
      </div>

      {bilan && (
        <div className={`banner ${bilan.ok ? 'ok' : 'err'} mt8 mb8`} role="status">
          <span>{bilan.texte}</span>
        </div>
      )}

      <div className="card card-pad mt8" style={{ background: 'var(--violet-soft)' }}>
        <div className="eyebrow">Motivation en cours</div>
        <p className="small" style={{ fontStyle: 'italic', marginTop: 6 }}>
          « {etat.courante} »
        </p>
        <div className="xs faint mt4">
          {etat.index} motivation(s) déjà envoyée(s) sur {etat.liste.length}
          {etat.suivante.length > 0 ? ` · liste suivante programmée (${etat.suivante.length})` : ''}
        </div>
      </div>

      <div className="mt16">
        <span className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>
          Numérotées, comme vous les collez
        </span>
        {etat.liste.map((motivation, position) => (
          <div
            key={`${position}-${motivation.slice(0, 12)}`}
            className="row between"
            style={{ gap: 10, padding: '5px 0', borderBottom: '1px solid var(--line)' }}
          >
            <span className="small">
              <b className="muted">{position + 1}.</b>{' '}
              {position < etat.index ? <s className="faint">{motivation}</s> : motivation}
            </span>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={enCours === `retirer-${position}`}
              onClick={() => agir({ action: 'retirer', numero: position + 1 }, `retirer-${position}`)}
            >
              Retirer
            </button>
          </div>
        ))}
      </div>

      <div className="mt16">
        <textarea
          className="inp"
          rows={4}
          placeholder={'1. La parole est une arme…\n2. Ce n’est pas le talent qui brille…\n(sans numéro, la ligne prend le numéro suivant libre)'}
          value={texte}
          onChange={(evenement) => setTexte(evenement.target.value)}
        />
        <div className="row mt8" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={enCours === 'ajouter' || texte.trim().length === 0}
            onClick={() => agir({ action: 'ajouter', texte }, 'ajouter')}
          >
            {enCours === 'ajouter' ? 'Ajout…' : 'Ajouter au stock'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={enCours === 'remplacer' || texte.trim().length === 0}
            onClick={() => agir({ action: 'remplacer', texte }, 'remplacer')}
          >
            {enCours === 'remplacer' ? 'Enregistrement…' : 'Enregistrer comme liste suivante'}
          </button>
        </div>
        <div className="xs faint mt4">
          La liste suivante ne s’active qu’une fois la liste en cours épuisée — vos dimanches restent enchaînés.
        </div>
      </div>

      <div className="mt16">
        <button
          className="btn btn-primary"
          type="button"
          disabled={enCours === 'envoyer' || etat.restantes === 0}
          onClick={() => agir({ action: 'envoyer' }, 'envoyer')}
        >
          {enCours === 'envoyer' ? 'Envoi…' : `Envoyer la motivation n° ${etat.index + 1}`}
        </button>
        <div className="xs faint mt4">
          Elle arrive dans la cloche des étudiants, immédiatement. À vous de choisir le bon jour.
        </div>
      </div>
    </div>
  );
}
