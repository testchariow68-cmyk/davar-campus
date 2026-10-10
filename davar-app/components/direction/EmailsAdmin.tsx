'use client';

import { useState } from 'react';

const ENVOIS_AUTOMATIQUES = [
  { quand: 'À l’achat reconnu', quoi: 'Le lien d’accès au campus, à l’adresse utilisée sur Chariow.' },
  { quand: 'À l’inscription', quoi: 'La confirmation d’adresse, pour que le compte soit le vôtre.' },
  { quand: 'Invitation d’un membre de l’équipe', quoi: 'Le lien d’entrée, valable une fois.' },
  { quand: 'Certification délivrée', quoi: 'L’annonce, sans jamais joindre le certificat en fichier.' },
  { quand: 'Avis demandé', quoi: 'Le rappel d’environ deux semaines, puis d’un mois.' },
];

/**
 * E-MAILS — l’état de l’envoi, un essai réel, et la liste de ce qui part tout seul.
 * Aucun réglage n’a besoin d’être deviné : si le service n’est pas branché, la page le dit.
 */
export function EmailsAdmin({
  kind,
  configure,
  plafond,
  emailProprietaire,
}: {
  kind: string;
  configure: boolean;
  plafond: number;
  emailProprietaire: string;
}) {
  const [destinataire, setDestinataire] = useState(emailProprietaire);
  const [note, setNote] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyerEssai() {
    setNote(null);
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await fetch('/api/direction/systeme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'courriel_test', email: destinataire }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!donnees.ok) setErreur(donnees.message ?? 'Essai refusé.');
      else setNote(donnees.message ?? 'Essai envoyé.');
    } finally {
      setEnCours(false);
    }
  }

  const nomService = kind === 'apps_script' ? 'Script Google (Apps Script)' : kind === 'brevo' ? 'Brevo' : 'Aucun';

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Service d’envoi</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{nomService}</div>
            <p className="small muted mt8" style={{ maxWidth: 560 }}>
              {configure
                ? `Les envois partent réellement. Plafond quotidien ménagé par la plateforme : ${plafond} messages. Au-delà, les envois attendent le lendemain — aucune facture surprise.`
                : 'Les adresses d’envoi ne sont pas encore posées côté serveur. La plateforme fonctionne entièrement sans elles : seuls les e-mails attendent.'}
            </p>
          </div>
          <span className={configure ? 'badge' : 'badge b-grey'} style={configure ? { background: 'var(--green-soft, #e6f4ea)', color: 'var(--green-deep, #1e6b3a)' } : undefined}>
            {configure ? 'Prêt' : 'En attente'}
          </span>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="mb4">Essai d’envoi</h3>
        <p className="small muted mb16">Le seul moyen d’être sûr : recevoir soi-même un message.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="adresse@exemple.com"
            value={destinataire}
            onChange={(evenement) => setDestinataire(evenement.target.value)}
          />
          <button className="btn btn-primary" type="button" disabled={enCours} onClick={envoyerEssai}>
            {enCours ? 'Envoi…' : 'Envoyer un essai'}
          </button>
        </div>
        {(note || erreur) && (
          <p className="small mt8" style={erreur ? { color: 'var(--red, #c0392b)' } : undefined}>
            {erreur ?? note}
          </p>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="mb8">Ce qui part automatiquement</h3>
        {ENVOIS_AUTOMATIQUES.map((ligne) => (
          <div key={ligne.quand} className="row" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <b className="small" style={{ minWidth: 210 }}>{ligne.quand}</b>
            <span className="small muted" style={{ flex: 1, minWidth: 220 }}>{ligne.quoi}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
