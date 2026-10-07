'use client';

import { useState } from 'react';
import { Icon } from '@/components/campus/Icon';

type Facture = {
  numero: string;
  reference: string;
  acheteur: string;
  formation: string;
  montant: string;
  devise: string;
  verifieeLeMs: number;
};

type LigneJournal = { kind: string; rows: number; atMs: number };

const TYPES: Array<{ cle: string; libelle: string; detail: string }> = [
  { cle: 'etudiants', libelle: 'Étudiants', detail: 'Nom, e-mail, statut, formations' },
  { cle: 'ventes', libelle: 'Ventes', detail: 'Références, montants, acheteurs' },
  { cle: 'progressions', libelle: 'Progressions', detail: 'Leçons faites par étudiant et par formation' },
  { cle: 'avis', libelle: 'Avis', detail: 'Les avis écrits reçus' },
  { cle: 'certifications', libelle: 'Certifications', detail: 'Codes, titulaires, dates' },
  { cle: 'devoirs', libelle: 'Devoirs rendus', detail: 'Statuts, notes, retours' },
];

/**
 * EXPORTS ET FACTURES — « derrière le mot de passe ».
 *
 * Rien ne sort sans le mot de passe du propriétaire, même s'il est déjà connecté :
 * c'est le geste qui protège les données de ses étudiants. Chaque sortie est notée
 * dans un journal qu'il peut relire ici même.
 */
export function ExportsAdmin({ journalInitial }: { journalInitial: LigneJournal[] }) {
  const [motDePasse, setMotDePasse] = useState('');
  const [journal, setJournal] = useState(journalInitial);
  const [note, setNote] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [factures, setFactures] = useState<Facture[] | null>(null);
  const [factureTexte, setFactureTexte] = useState<string | null>(null);

  type ReponseApi = {
    ok?: boolean;
    message?: string;
    error?: string;
    nom?: string;
    contenu?: string;
    lignes?: number;
    factures?: Facture[];
    texte?: string;
    journal?: LigneJournal[];
  };

  async function appeler(corps: Record<string, unknown>): Promise<ReponseApi> {
    const reponse = await fetch('/api/direction/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...corps, motDePasse }),
    });
    return (await reponse.json().catch(() => ({}))) as ReponseApi;
  }

  async function rafraichirJournal() {
    const donnees = await appeler({ action: 'journal' });
    if (donnees.journal) setJournal(donnees.journal);
  }

  async function exporter(kind: string) {
    setErreur(null);
    setNote(null);
    setEnCours(`export-${kind}`);
    const donnees = await appeler({ action: 'csv', kind });
    setEnCours(null);
    if (!donnees.ok || !donnees.contenu) {
      setErreur(donnees.message ?? 'Export refusé.');
      return;
    }
    const blob = new Blob([donnees.contenu], { type: 'text/csv;charset=utf-8' });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = donnees.nom ?? 'davar-export.csv';
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    URL.revokeObjectURL(lien.href);
    setNote(donnees.message ?? 'Export prêt.');
    await rafraichirJournal();
  }

  async function chargerFactures() {
    setErreur(null);
    setNote(null);
    setEnCours('factures');
    const donnees = await appeler({ action: 'factures' });
    setEnCours(null);
    if (!donnees.ok || !donnees.factures) {
      setErreur(donnees.message ?? 'Factures indisponibles.');
      return;
    }
    setFactures(donnees.factures);
    await rafraichirJournal();
    setNote(donnees.message ?? null);
  }

  async function ouvrirFacture(saleId: string) {
    setEnCours(`facture-${saleId}`);
    const donnees = await appeler({ action: 'facture', saleId });
    setEnCours(null);
    if (!donnees.ok || !donnees.texte) {
      setErreur(donnees.message ?? 'Facture introuvable.');
      return;
    }
    setFactureTexte(donnees.texte);
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="eyebrow mb8">Votre mot de passe</div>
        <p className="small muted mb8">
          Exigé pour toute sortie de données. Il n’est ni conservé ni transmis : il sert uniquement à confirmer que c’est
          bien vous.
        </p>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          placeholder="Mot de passe du propriétaire"
          value={motDePasse}
          onChange={(evenement) => setMotDePasse(evenement.target.value)}
        />
        {(note || erreur) && (
          <p className={erreur ? 'small mt8' : 'small muted mt8'} style={erreur ? { color: 'var(--red, #c0392b)' } : undefined}>
            {erreur ?? note}
          </p>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="mb4">Exporter</h3>
        <p className="small muted mb16">Un fichier CSV s’ouvre dans Excel ou Google Sheets, accents compris.</p>
        <div className="col" style={{ gap: 8 }}>
          {TYPES.map((type) => (
            <div key={type.cle} className="row between" style={{ gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
              <span className="small">
                <b>{type.libelle}</b>
                <span className="xs faint" style={{ display: 'block' }}>{type.detail}</span>
              </span>
              <button className="btn btn-ghost" type="button" disabled={enCours === `export-${type.cle}`} onClick={() => exporter(type.cle)}>
                <Icon nom="download" taille={14} /> {enCours === `export-${type.cle}` ? 'Préparation…' : 'Télécharger'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="row between mb8" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 className="mb4">Factures</h3>
            <p className="small muted">Une facture par vente vérifiée, numérotée sans trou.</p>
          </div>
          <button className="btn btn-primary" type="button" disabled={enCours === 'factures'} onClick={chargerFactures}>
            {enCours === 'factures' ? 'Chargement…' : 'Afficher les factures'}
          </button>
        </div>
        {factures !== null && factures.length === 0 && <p className="small muted mt8">Aucune vente vérifiée pour l’instant.</p>}
        {factures !== null && factures.length > 0 && (
          <div className="col" style={{ gap: 0 }}>
            {factures.map((facture) => (
              <div key={facture.reference} className="row between" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                <span className="small">
                  <b>{facture.numero}</b> <span className="xs faint">{facture.acheteur}</span>
                  <span className="xs faint" style={{ display: 'block' }}>
                    {facture.formation} · {new Date(facture.verifieeLeMs).toLocaleDateString('fr-FR')}
                  </span>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <span className="badge b-grey">{facture.montant} {facture.devise}</span>
                  <button className="btn btn-ghost" type="button" onClick={() => ouvrirFacture(facture.reference)}>
                    Ouvrir
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {factureTexte && (
        <div className="card card-pad">
          <div className="row between mb8">
            <h3>Facture</h3>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost" type="button" onClick={() => window.print()}>
                Imprimer
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setFactureTexte(null)}>
                Fermer
              </button>
            </div>
          </div>
          <pre className="small" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{factureTexte}</pre>
        </div>
      )}

      <div className="card card-pad">
        <h3 className="mb8">Journal des exports</h3>
        {journal.length === 0 ? (
          <p className="small muted">Aucun export n’a encore été fait depuis cette plateforme.</p>
        ) : (
          journal.map((ligne, index) => (
            <div key={`${ligne.atMs}-${index}`} className="row between small" style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
              <span>{ligne.kind}</span>
              <span className="xs muted">
                {ligne.rows} ligne(s) · {new Date(ligne.atMs).toLocaleString('fr-FR')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
