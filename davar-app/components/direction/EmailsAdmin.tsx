'use client';

import { useState } from 'react';

export type Modele = { id: string; objet: string; description: string };
export type LigneEnvoi = { id: string; type: 'essai' | 'production'; libelle: string; atMs: number };

const EXPEDITEURS = [
  { valeur: 'infos@davarcampus.co', libelle: 'Infos (renseignements)' },
  { valeur: 'support@davarcampus.co', libelle: 'Support (aide)' },
  { valeur: 'contact@davarcampus.co', libelle: 'Contact (partenariats)' },
  { valeur: 'direction@davarcampus.co', libelle: 'Direction (officiel)' },
];

function quand(atMs: number): string {
  return new Date(atMs).toLocaleString('fr-FR');
}

/**
 * E-MAILS — `aEmails()` du prototype.
 *
 * Trois blocs, et rien d'autre : essayer chaque modèle un par un, écrire un
 * e-mail libre, et relire ce qui est déjà parti. Le journal ne montre jamais
 * le destinataire : il dit qui a envoyé quoi, il n'archive pas d'adresses.
 */
export function EmailsAdmin({
  modeles,
  envois,
  emailProprietaire,
}: {
  modeles: Modele[];
  envois: LigneEnvoi[];
  emailProprietaire: string;
}) {
  const [destinataire, setDestinataire] = useState(emailProprietaire);
  const [libre, setLibre] = useState({ email: '', objet: '', texte: '', de: EXPEDITEURS[0].valeur });
  const [note, setNote] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  async function poster(corps: Record<string, unknown>, cle: string) {
    setNote(null);
    setErreur(null);
    setEnCours(cle);
    try {
      const reponse = await fetch('/api/direction/systeme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!donnees.ok) setErreur(donnees.message ?? 'Envoi refusé.');
      else setNote(donnees.message ?? 'Envoyé.');
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="eyebrow mb8">Tester un modèle</div>
        <div className="row mb8" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="inp"
            value={destinataire}
            onChange={(evenement) => setDestinataire(evenement.target.value)}
            style={{ minWidth: 260 }}
            placeholder="destinataire@exemple.com"
          />
          <div className="xs muted wrap">
            L’e-mail de test part à l’adresse ci-contre — mettez la vôtre pour vérifier la réception.
          </div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 10 }}>
          {modeles.map((modele) => (
            <div key={modele.id} className="card" style={{ padding: '12px 14px', border: '1px solid var(--line)' }}>
              <b style={{ fontSize: 13 }}>{modele.objet}</b>
              <div className="xs muted mt4 mb8">{modele.description}</div>
              <button
                className="btn btn-sm"
                type="button"
                disabled={enCours !== null}
                onClick={() => poster({ action: 'courriel_modele', modele: modele.id, email: destinataire }, modele.id)}
              >
                {enCours === modele.id ? 'Envoi…' : 'Envoyer un test'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="eyebrow mb8">E-mail libre</div>
        <div className="row mb8" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="inp"
            placeholder="destinataire@exemple.com"
            style={{ minWidth: 220 }}
            value={libre.email}
            onChange={(evenement) => setLibre({ ...libre, email: evenement.target.value })}
          />
          <input
            className="inp wrap"
            placeholder="Objet de l’e-mail"
            style={{ minWidth: 280 }}
            value={libre.objet}
            onChange={(evenement) => setLibre({ ...libre, objet: evenement.target.value })}
          />
        </div>
        <div className="field">
          <label>Message</label>
          <textarea
            className="inp"
            rows={5}
            placeholder="Écrivez ici le contenu de votre e-mail…"
            value={libre.texte}
            onChange={(evenement) => setLibre({ ...libre, texte: evenement.target.value })}
          />
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select
            className="inp"
            style={{ maxWidth: 300 }}
            value={libre.de}
            onChange={(evenement) => setLibre({ ...libre, de: evenement.target.value })}
          >
            {EXPEDITEURS.map((expediteur) => (
              <option key={expediteur.valeur} value={expediteur.valeur}>
                {expediteur.libelle} — {expediteur.valeur}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={enCours !== null}
            onClick={() => poster({ action: 'courriel_libre', ...libre }, 'libre')}
          >
            {enCours === 'libre' ? 'Envoi…' : 'Envoyer l’e-mail'}
          </button>
        </div>
        {(note || erreur) && (
          <p className="small mt8" style={erreur ? { color: 'var(--red, #c0392b)' } : undefined}>
            {erreur ?? note}
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Derniers e-mails envoyés</h3>
        </div>
        {envois.length === 0 ? (
          <div className="empty small">Aucun e-mail envoyé pour l’instant.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Objet</th>
                <th>Type</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {envois.map((envoi) => (
                <tr key={envoi.id}>
                  <td className="xs">{envoi.libelle}</td>
                  <td>
                    <span className={`badge ${envoi.type === 'essai' ? 'b-violet' : 'b-grey'}`}>
                      {envoi.type === 'essai' ? 'test' : 'production'}
                    </span>
                  </td>
                  <td className="xs muted">{quand(envoi.atMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
