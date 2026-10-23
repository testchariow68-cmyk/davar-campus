'use client';

import { useState } from 'react';

type Champs = {
  'paiement.flutterwave.actif': '0' | '1';
  'paiement.flutterwave.cle': string;
  'paiement.flutterwave.webhook': string;
};

/**
 * PAIEMENT DANS L'APPLICATION — le bloc « Paiement & intégrations externes »
 * du prototype.
 *
 * Le propriétaire pose ici les clés de Flutterwave, le fournisseur qui encaisse
 * les achats suivants (mobile money — Wave, Orange Money, MTN MoMo, Moov Money
 * — et cartes internationales). Tant que la case n'est pas cochée ou que la clé
 * manque, aucun encaissement n'est ouvert et l'étudiant le lit sur l'écran de
 * commande : rien n'est jamais simulé.
 */
export function PaiementAdmin({ initiaux }: { initiaux: Record<string, string> }) {
  const [champs, setChamps] = useState<Champs>(() => ({
    'paiement.flutterwave.actif': initiaux['paiement.flutterwave.actif'] === '1' ? '1' : '0',
    'paiement.flutterwave.cle': initiaux['paiement.flutterwave.cle'] ?? '',
    'paiement.flutterwave.webhook': initiaux['paiement.flutterwave.webhook'] ?? '',
  }));
  const [note, setNote] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const actif = champs['paiement.flutterwave.actif'] === '1';
  const cleEnPlace = champs['paiement.flutterwave.cle'].trim().length > 0;
  const secretEnPlace = champs['paiement.flutterwave.webhook'].trim().length > 0;

  function changer(cle: keyof Champs, valeur: string) {
    setChamps((precedents) => ({ ...precedents, [cle]: valeur }));
  }

  async function enregistrer() {
    setNote(null);
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await fetch('/api/direction/systeme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reglages', reglages: champs }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!donnees.ok) setErreur(donnees.message ?? 'Enregistrement refusé.');
      else setNote(donnees.message ?? 'Intégrations enregistrées.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="row between mb8" style={{ gap: 10, flexWrap: 'wrap' }}>
        <h3 className="mb4">Paiement dans l’application</h3>
        <span className={`dv-tag ${actif && cleEnPlace ? 'open' : 'closed'}`}>
          {actif && cleEnPlace ? 'ouvert aux paiements' : 'fermé — aucun encaissement'}
        </span>
      </div>
      <p className="small muted mb16">
        Le <b>premier achat</b> se fait hors de l’application, chez Chariow : le Pulse rattache la formation au compte.
        Les <b>achats suivants</b> passent par Flutterwave, qui encaisse sur sa propre page — aucune carte, aucun
        numéro mobile ne transite par la plateforme.
      </p>

      <div className="eyebrow mb8">
        Flutterwave — mobile money (Côte d’Ivoire, Sénégal…) + cartes internationales
      </div>

      <label className="row small mb16" style={{ gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={actif}
          onChange={(evenement) => changer('paiement.flutterwave.actif', evenement.target.checked ? '1' : '0')}
        />
        <span>
          Activer Flutterwave pour les achats dans l’application — décoché, l’écran de commande annonce honnêtement
          que le paiement en ligne n’est pas ouvert.
        </span>
      </label>

      <div className="grid g2" style={{ gap: 12 }}>
        <label style={{ display: 'block' }}>
          <span className="eyebrow" style={{ display: 'block', marginBottom: 4 }}>
            Clé secrète Flutterwave <span className="xs faint">(FLWSECK-… — côté serveur uniquement)</span>
          </span>
          <input
            className="inp"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="FLWSECK-…"
            style={{ fontFamily: 'ui-monospace, monospace' }}
            value={champs['paiement.flutterwave.cle']}
            onChange={(evenement) => changer('paiement.flutterwave.cle', evenement.target.value)}
          />
        </label>
        <label style={{ display: 'block' }}>
          <span className="eyebrow" style={{ display: 'block', marginBottom: 4 }}>
            Secret du webhook <span className="xs faint">(en-tête verifi-hash)</span>
          </span>
          <input
            className="inp"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="votre secret"
            style={{ fontFamily: 'ui-monospace, monospace' }}
            value={champs['paiement.flutterwave.webhook']}
            onChange={(evenement) => changer('paiement.flutterwave.webhook', evenement.target.value)}
          />
        </label>
      </div>

      <div className="banner info mt16">
        <span className="small">
          Dans <b>Flutterwave → Settings → API</b> : relevez la clé secrète, puis déclarez l’URL du webhook{' '}
          <span className="kbd">https://VOTRE-DOMAINE/api/flutterwave/webhook</span> et copiez le <b>secret hash</b>{' '}
          ci-dessus. Le serveur vérifie l’en-tête <span className="kbd">verif-hash</span>, re-vérifie chaque
          transaction auprès du fournisseur et dédoublonne par <span className="kbd">tx_ref</span> : une vente ne peut
          jamais ouvrir deux accès.
        </span>
      </div>

      <div className="row mt16" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" disabled={enCours} onClick={enregistrer}>
          Enregistrer ces intégrations
        </button>
        <span className="xs faint">
          Clé {cleEnPlace ? 'en place ✓' : 'absente'} · secret {secretEnPlace ? 'en place ✓' : 'absent'}
        </span>
      </div>

      {note && (
        <div className="banner ok mt16" role="status">
          <span>{note}</span>
        </div>
      )}
      {erreur && (
        <div className="banner err mt16" role="alert">
          <span>{erreur}</span>
        </div>
      )}
    </div>
  );
}
