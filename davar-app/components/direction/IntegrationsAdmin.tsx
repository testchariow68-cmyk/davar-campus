'use client';

import { useState } from 'react';
import { Icon } from '@/components/campus/Icon';

export type CleApiAffichee = {
  id: string;
  label: string;
  prefix: string;
  createdAtMs: number;
  lastUsedAtMs: number | null;
  revokedAtMs: number | null;
};

const TABLES: Array<{ cle: string; libelle: string }> = [
  { cle: 'etudiants', libelle: 'Étudiants' },
  { cle: 'ventes', libelle: 'Ventes' },
  { cle: 'progressions', libelle: 'Progressions' },
  { cle: 'avis', libelle: 'Avis' },
  { cle: 'certifications', libelle: 'Certifications' },
  { cle: 'devoirs', libelle: 'Devoirs rendus' },
];

/**
 * INTÉGRATIONS — clés d’accès et Google Sheets.
 *
 * Une clé en clair n’est montrée qu’une seule fois : ensuite seule son empreinte
 * subsiste. Le relais Sheets est l’adresse de SON script : rien ne part sans son geste.
 */
export function IntegrationsAdmin({ urlSheetsInitiale }: { urlSheetsInitiale: string }) {
  const [cles, setCles] = useState<CleApiAffichee[]>([]);
  const [libelle, setLibelle] = useState('Mon outil');
  const [cleFraiche, setCleFraiche] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [urlSheets, setUrlSheets] = useState(urlSheetsInitiale);
  const [note, setNote] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  type ReponseApi = { ok?: boolean; message?: string; error?: string; cle?: string; cles?: CleApiAffichee[]; lignes?: number };

  async function appeler(corps: Record<string, unknown>): Promise<ReponseApi> {
    const reponse = await fetch('/api/direction/systeme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    return (await reponse.json().catch(() => ({}))) as ReponseApi;
  }

  async function charger() {
    const donnees = await appeler({ action: 'etat' });
    if (donnees.cles) setCles(donnees.cles);
  }

  async function creer() {
    setErreur(null);
    setNote(null);
    setCleFraiche(null);
    setEnCours('cle');
    const donnees = await appeler({ action: 'cle_creer', label: libelle });
    setEnCours(null);
    if (!donnees.ok || !donnees.cle) {
      setErreur(donnees.message ?? 'Création refusée.');
      return;
    }
    setCleFraiche(donnees.cle);
    if (donnees.cles) setCles(donnees.cles);
    else await charger();
  }

  async function revoquer(id: string) {
    setEnCours(id);
    const donnees = await appeler({ action: 'cle_revoquer', id });
    setEnCours(null);
    if (donnees.cles) setCles(donnees.cles);
    else await charger();
    setNote(donnees.message ?? null);
  }

  async function enregistrerSheets() {
    setErreur(null);
    setNote(null);
    setEnCours('sheets-url');
    const donnees = await appeler({ action: 'sheets_url', url: urlSheets });
    setEnCours(null);
    if (!donnees.ok) {
      setErreur(donnees.message ?? 'Adresse refusée.');
      return;
    }
    setNote(donnees.message ?? 'Enregistré.');
  }

  async function envoyerTable(kind: string) {
    setErreur(null);
    setNote(null);
    setEnCours(`sheets-${kind}`);
    const donnees = await appeler({ action: 'sheets_envoyer', kind, url: urlSheets });
    setEnCours(null);
    if (!donnees.ok) {
      setErreur(donnees.message ?? 'Envoi refusé.');
      return;
    }
    setNote(donnees.message ?? 'Envoyé.');
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card card-pad">
        <h3 className="mb4">Clés d’accès</h3>
        <p className="small muted mb16">
          Pour brancher vos propres outils sans jamais donner votre mot de passe. La clé ne s’affiche qu’une fois :
          copiez-la tout de suite et rangez-la en lieu sûr.
        </p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="À quoi sert cette clé ?"
            value={libelle}
            onChange={(evenement) => setLibelle(evenement.target.value)}
          />
          <button className="btn btn-primary" type="button" disabled={enCours === 'cle'} onClick={creer}>
            <Icon nom="key" taille={14} /> {enCours === 'cle' ? 'Création…' : 'Créer une clé'}
          </button>
        </div>

        {cleFraiche && (
          <div className="card card-pad mt16" style={{ background: 'var(--violet-soft)' }}>
            <div className="eyebrow mb8">Votre nouvelle clé — copiez-la maintenant</div>
            <code className="small" style={{ wordBreak: 'break-all', display: 'block', marginBottom: 8 }}>{cleFraiche}</code>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(cleFraiche);
                  setCopie(true);
                } catch {
                  setCopie(false);
                }
              }}
            >
              {copie ? 'Copiée' : 'Copier'}
            </button>
          </div>
        )}

        {(note || erreur) && (
          <p className="small mt8" style={erreur ? { color: 'var(--red, #c0392b)' } : undefined}>
            {erreur ?? note}
          </p>
        )}

        <div className="mt16">
          <button className="btn btn-ghost" type="button" onClick={charger}>
            Afficher mes clés
          </button>
        </div>

        {cles.length > 0 && (
          <div className="col mt16" style={{ gap: 0 }}>
            {cles.map((cle) => (
              <div key={cle.id} className="row between" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                <span className="small">
                  <b>{cle.label}</b>
                  <span className="xs faint" style={{ display: 'block' }}>
                    {cle.prefix}… · créée le {new Date(cle.createdAtMs).toLocaleDateString('fr-FR')}
                    {cle.lastUsedAtMs ? ` · utilisée le ${new Date(cle.lastUsedAtMs).toLocaleDateString('fr-FR')}` : ' · jamais utilisée'}
                  </span>
                </span>
                {cle.revokedAtMs ? (
                  <span className="badge b-grey">révoquée</span>
                ) : (
                  <button className="btn btn-ghost" type="button" disabled={enCours === cle.id} onClick={() => revoquer(cle.id)}>
                    Révoquer
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="mb4">Google Sheets</h3>
        <p className="small muted mb16">
          Collez l’adresse de votre script Google (déployé en « application web »). Il recevra chaque tableau en une fois :
          la plateforme ne garde aucune clé Google et n’écrit jamais dans votre feuille sans votre clic.
        </p>
        <input
          className="input"
          placeholder="https://script.google.com/macros/s/…/exec"
          value={urlSheets}
          onChange={(evenement) => setUrlSheets(evenement.target.value)}
        />
        <div className="row mt8" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" type="button" disabled={enCours === 'sheets-url'} onClick={enregistrerSheets}>
            {enCours === 'sheets-url' ? 'Enregistrement…' : 'Enregistrer l’adresse'}
          </button>
        </div>
        <div className="eyebrow mt16 mb8">Envoyer un tableau maintenant</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {TABLES.map((table) => (
            <button key={table.cle} className="btn btn-ghost" type="button" disabled={enCours === `sheets-${table.cle}`} onClick={() => envoyerTable(table.cle)}>
              {enCours === `sheets-${table.cle}` ? 'Envoi…' : table.libelle}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
