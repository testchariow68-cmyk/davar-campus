'use client';

import { useState } from 'react';

export type RapportCycleAffiche = {
  sessionsExpirees: number;
  jetonsExpires: number;
  notificationsLues: number;
  notificationsAnciennes: number;
  conversationsIa: number;
  conversationsCoach: number;
  journauxTechniques: number;
  comptesEligibles: number;
  comptesEnQuarantaine: number;
  comptesAPurger: number;
  comptesSuspendusParException: number;
  certificatsHorsPolitique: number;
  devoirsEnAttente: number;
  dernierPassageMs: number;
  actif: boolean;
};

type LigneJournal = { kind: string; count: number; result: string; detail: string; atMs: number };

/**
 * CYCLE DE VIE — l'écran du propriétaire.
 *
 * Rien ne part tout seul. L'état se lit, puis le passage s'exécute à la main,
 * avec son mot de passe et la phrase de confirmation. Ce qui doit survivre
 * (certificats, ventes, devoirs à corriger) est nommé ici, pas caché.
 */
export function CycleDeVieAdmin({
  rapportInitial,
  journalInitial,
}: {
  rapportInitial: RapportCycleAffiche;
  journalInitial: LigneJournal[];
}) {
  const [rapport, setRapport] = useState(rapportInitial);
  const [journal, setJournal] = useState(journalInitial);
  const [motDePasse, setMotDePasse] = useState('');
  const [phrase, setPhrase] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  type ReponseApi = {
    ok?: boolean;
    message?: string;
    error?: string;
    rapport?: RapportCycleAffiche;
    journal?: LigneJournal[];
  };

  async function appeler(corps: Record<string, unknown>): Promise<ReponseApi> {
    const reponse = await fetch('/api/direction/cycle-de-vie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...corps, motDePasse }),
    });
    return (await reponse.json().catch(() => ({}))) as ReponseApi;
  }

  async function rafraichirEtat() {
    const donnees = await appeler({ action: 'etat' });
    if (donnees.rapport) setRapport(donnees.rapport);
    if (donnees.journal) setJournal(donnees.journal);
  }

  async function basculerActif() {
    setEnCours('actif');
    const donnees = await appeler({ action: 'actif', actif: !rapport.actif });
    setEnCours(null);
    if (donnees.ok) {
      setNote(donnees.message ?? null);
      await rafraichirEtat();
    } else setErreur(donnees.message ?? 'Réglage refusé.');
  }

  async function passage() {
    setNote(null);
    setErreur(null);
    setEnCours('passage');
    const donnees = await appeler({ action: 'passage', phrase });
    setEnCours(null);
    if (!donnees.ok) {
      setErreur(donnees.message ?? 'Passage refusé.');
      return;
    }
    if (donnees.rapport) setRapport(donnees.rapport);
    if (donnees.journal) setJournal(donnees.journal);
    setPhrase('');
    setNote(donnees.message ?? 'Passage effectué.');
  }

  async function decider(userId: string, decision: 'suspendre' | 'reprendre' | 'annuler') {
    setEnCours(`${decision}-${userId}`);
    const donnees = await appeler({ action: 'quarantaine', userId, decision });
    setEnCours(null);
    if (donnees.rapport) setRapport(donnees.rapport);
    if (donnees.journal) setJournal(donnees.journal);
    setNote(donnees.message ?? null);
  }

  const ligne = (libelle: string, valeur: number, detail: string) => (
    <div className="row between" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
      <span className="small">
        <b>{libelle}</b>
        <span className="xs faint" style={{ display: 'block' }}>{detail}</span>
      </span>
      <span className={valeur > 0 ? 'badge' : 'badge b-grey'} style={valeur > 0 ? { background: 'var(--violet-soft)', color: 'var(--violet-deep)' } : undefined}>
        {valeur}
      </span>
    </div>
  );

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 className="mb4">Passage périodique</h3>
            <p className="small muted" style={{ maxWidth: 560 }}>
              Le prototype prévoyait un passage toutes les 12 heures. Ici, <b>rien ne part jamais tout seul</b> : même
              autorisé, l’entretien attend votre geste. Dernier passage :{' '}
              {rapport.dernierPassageMs ? new Date(rapport.dernierPassageMs).toLocaleString('fr-FR') : 'aucun à ce jour'}.
            </p>
          </div>
          <button className={rapport.actif ? 'btn btn-ghost' : 'btn btn-primary'} type="button" disabled={enCours === 'actif'} onClick={basculerActif}>
            {rapport.actif ? 'Mettre en pause' : 'Autoriser le passage'}
          </button>
        </div>
        <span className={rapport.actif ? 'badge' : 'badge b-grey'} style={rapport.actif ? { background: 'var(--green-soft, #e6f4ea)', color: 'var(--green-deep, #1e6b3a)' } : undefined}>
          {rapport.actif ? 'autorisation donnée' : 'en pause'}
        </span>
      </div>

      <div className="card card-pad">
        <h3 className="mb8">Ce qui attend d’être purgé</h3>
        {ligne('Sessions expirées', rapport.sessionsExpirees, 'Purge après expiration')}
        {ligne('Codes et jetons', rapport.jetonsExpires, 'Utilisés ou expirés')}
        {ligne('Notifications lues', rapport.notificationsLues, 'Disparaissent 48 h après lecture')}
        {ligne('Notifications anciennes', rapport.notificationsAnciennes, '180 jours au plus')}
        {ligne('Conversations IA', rapport.conversationsIa, '90 jours — statistiques anonymisées conservées')}
        {ligne('Conversations coach', rapport.conversationsCoach, '12 mois — les conversations résolues (litige) restent')}
        {ligne('Journaux techniques', rapport.journauxTechniques, '90 jours')}
        {ligne('Certificats hors politique', rapport.certificatsHorsPolitique, 'Au-delà de 30 ans')}
        <div className="row between" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
          <span className="small">
            <b>Devoirs en attente de correction</b>
            <span className="xs faint" style={{ display: 'block' }}>Jamais purgés : un travail d’étudiant se rend, il ne s’efface pas</span>
          </span>
          <span className="badge b-grey">{rapport.devoirsEnAttente} conservé(s)</span>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="mb4">Comptes</h3>
        <p className="small muted mb16">
          Un compte devient éligible quand l’étudiant a terminé et que <b>12 mois ont passé sans nouvelle formation</b>.
          Se connecter ou relire une leçon ne remet pas le compteur à zéro. Il passe alors 7 jours en quarantaine —
          le temps qu’apparaisse une nouvelle formation, un certificat en cours ou un devoir à corriger.
        </p>
        <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
          <span className="small"><b>{rapport.comptesEligibles}</b> <span className="muted">éligible(s)</span></span>
          <span className="small"><b>{rapport.comptesEnQuarantaine}</b> <span className="muted">en quarantaine</span></span>
          <span className="small"><b>{rapport.comptesAPurger}</b> <span className="muted">effaçable(s) maintenant</span></span>
          <span className="small"><b>{rapport.comptesSuspendusParException}</b> <span className="muted">suspendu(s) par exception</span></span>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="mb4">Exécuter un passage maintenant</h3>
        <p className="small muted mb16">
          Deux verrous : votre mot de passe, puis la phrase de confirmation. Les sessions, jetons, notifications et
          conversations au-delà de leur durée seront purgés ; les comptes éligibles passeront d’abord en quarantaine.
        </p>
        <div className="col" style={{ gap: 10 }}>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="Mot de passe du propriétaire"
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
          />
          <input
            className="input"
            placeholder="Recopiez PURGER"
            value={phrase}
            onChange={(evenement) => setPhrase(evenement.target.value)}
          />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="button" disabled={enCours === 'passage'} onClick={passage}>
              {enCours === 'passage' ? 'Passage en cours…' : 'Effectuer le passage'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={rafraichirEtat}>
              Recalculer l’état
            </button>
          </div>
        </div>
        {(note || erreur) && (
          <p className="small mt8" style={erreur ? { color: 'var(--red, #c0392b)' } : undefined}>
            {erreur ?? note}
          </p>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="mb8">Journal de purge</h3>
        <p className="small muted mb16">Des compteurs et des motifs — jamais un contenu, jamais un nom.</p>
        {journal.length === 0 ? (
          <p className="small muted">Aucun passage n’a encore eu lieu. C’est l’état normal d’une plateforme neuve.</p>
        ) : (
          journal.map((entree, index) => (
            <div key={`${entree.atMs}-${index}`} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <span>
                <b>{entree.kind}</b> <span className="xs muted">{entree.detail}</span>
              </span>
              <span className="xs muted">
                {entree.count} · {entree.result} · {new Date(entree.atMs).toLocaleString('fr-FR')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
