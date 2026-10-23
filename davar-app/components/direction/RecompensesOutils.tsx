'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { messageDe, poster } from './api';

type EtudiantVue = { id: string; nom: string };
type BadgeVue = { id: string; name: string; cat: string };
type Reglages = { absenceDays: number; periodDays: number; minActiveDays: number };

/**
 * RÉCOMPENSES — les trois gestes de l'écran du prototype : enregistrer les
 * réglages du moteur, attribuer une distinction à la main (avec son motif), et
 * vérifier le cycle (rappels d'absence + distinctions du temps).
 *
 * Le propriétaire seul voit les réglages : ils changent le comportement de tout
 * le campus. Le manager peut, lui, attribuer une distinction et lancer le cycle.
 */
export function RecompensesOutils({
  reglages,
  etudiants,
  badges,
  proprietaire,
}: {
  reglages: Reglages;
  etudiants: EtudiantVue[];
  badges: BadgeVue[];
  proprietaire: boolean;
}) {
  const router = useRouter();
  const [bilan, setBilan] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const [absenceDays, setAbsenceDays] = useState(String(reglages.absenceDays));
  const [periodDays, setPeriodDays] = useState(String(reglages.periodDays));
  const [minActiveDays, setMinActiveDays] = useState(String(reglages.minActiveDays));

  const [choix, setChoix] = useState({ userId: etudiants[0]?.id ?? '', badgeId: badges[0]?.id ?? '', motif: '' });

  async function agir(corps: Record<string, unknown>) {
    setEnCours(true);
    const reponse = await poster('/api/direction/recompenses', corps);
    setBilan({ ok: reponse.ok, texte: messageDe(reponse) });
    setEnCours(false);
    if (reponse.ok) router.refresh();
  }

  return (
    <>
      {bilan && (
        <div className={`banner ${bilan.ok ? 'info' : 'warn'} mb16`} role="status">
          <span>{bilan.texte}</span>
        </div>
      )}

      <div className="grid g2 mb16" style={{ alignItems: 'start' }}>
        {proprietaire && (
          <div className="card card-pad">
            <div className="eyebrow mb8">Réglages du moteur</div>
            <div className="field">
              <label>Absence avant rappel (jours)</label>
              <input
                className="inp"
                type="number"
                min={1}
                value={absenceDays}
                onChange={(evenement) => setAbsenceDays(evenement.target.value)}
              />
              <div className="hint">
                Rappel chaleureux à J+{absenceDays || '—'}, puis à chaque nouveau cycle (
                {Number(absenceDays) * 2 || '—'} j, {Number(absenceDays) * 3 || '—'} j…). Jamais culpabilisant.
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="field wrap">
                <label>Régularité — période (jours)</label>
                <input
                  className="inp"
                  type="number"
                  min={1}
                  value={periodDays}
                  onChange={(evenement) => setPeriodDays(evenement.target.value)}
                />
              </div>
              <div className="field wrap">
                <label>Jours actifs minimum</label>
                <input
                  className="inp"
                  type="number"
                  min={1}
                  value={minActiveDays}
                  onChange={(evenement) => setMinActiveDays(evenement.target.value)}
                />
              </div>
            </div>
            <button
              className="btn btn-primary btn-sm"
              disabled={enCours}
              onClick={() => agir({ action: 'reglages', absenceDays, periodDays, minActiveDays })}
            >
              Enregistrer les réglages
            </button>
            <div className="divider" />
            <div className="eyebrow mb8">Cycle d&apos;assiduité</div>
            <p className="small muted mb8">
              Les rappels partent à la demande, jamais en tâche de fond : le campus ne dépense pas de quota pour dormir.
              Rejouer la vérification ne double rien.
            </p>
            <button className="btn btn-sm" disabled={enCours} onClick={() => agir({ action: 'verifier' })}>
              Vérifier le cycle maintenant
            </button>
          </div>
        )}

        <div className="card card-pad">
          <div className="eyebrow mb8">Attribution manuelle (situation exceptionnelle)</div>
          <div className="field">
            <label>Étudiant</label>
            <select
              className="inp"
              value={choix.userId}
              onChange={(evenement) => setChoix({ ...choix, userId: evenement.target.value })}
            >
              {etudiants.map((etudiant) => (
                <option key={etudiant.id} value={etudiant.id}>
                  {etudiant.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Distinction</label>
            <select
              className="inp"
              value={choix.badgeId}
              onChange={(evenement) => setChoix({ ...choix, badgeId: evenement.target.value })}
            >
              {badges.map((badge) => (
                <option key={badge.id} value={badge.id}>
                  {badge.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Motif (consigné dans l&apos;historique)</label>
            <input
              className="inp"
              placeholder="Ex. reprise exceptionnelle validée par le coach"
              value={choix.motif}
              onChange={(evenement) => setChoix({ ...choix, motif: evenement.target.value })}
            />
          </div>
          <button
            className="btn btn-gold btn-sm"
            disabled={enCours || !etudiants.length || !badges.length}
            onClick={() => agir({ action: 'attribuer', ...choix })}
          >
            Attribuer
          </button>
          <div className="xs faint mt8">
            Consigné avec le mode MANUEL, et votre nom à côté. Un étudiant ne peut jamais s&apos;attribuer une distinction
            lui-même.
          </div>
        </div>
      </div>

      {!proprietaire && (
        <p className="xs faint mb16">
          Les réglages du moteur (rappel d&apos;absence, régularité) restent au propriétaire : ils changent le comportement
          de tout le campus. Vous pouvez attribuer une distinction et vérifier le cycle.
        </p>
      )}
    </>
  );
}
