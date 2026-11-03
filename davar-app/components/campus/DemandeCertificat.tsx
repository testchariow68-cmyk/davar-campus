'use client';

import { useState } from 'react';
import { Icon } from './Icon';

type Formation = { id: string; titre: string; dejaCertifiee: boolean; dejaDemande: boolean; progression: number };

/** Demander son certificat : un geste explicite, jamais automatique. */
export function DemandeCertificat({ formations }: { formations: Formation[] }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [faites, setFaites] = useState<string[]>([]);

  if (formations.length === 0) return null;

  async function demander(formation: Formation) {
    setEnCours(formation.id);
    try {
      const reponse = await fetch('/api/campus/certificat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formationId: formation.id }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      setMessages((actuel) => ({ ...actuel, [formation.id]: donnees.message ?? 'Demande enregistrée.' }));
      if (donnees.ok) setFaites((actuel) => [...actuel, formation.id]);
    } catch {
      setMessages((actuel) => ({ ...actuel, [formation.id]: 'Le réseau n’a pas répondu.' }));
    }
    setEnCours(null);
  }

  return (
    <div className="card card-pad">
      <h3 className="mb8">Demander mon certificat</h3>
      <p className="small muted mb16">
        Le certificat atteste d’une formation suivie et validée. Votre nom tel qu’il figure sur votre profil sera
        celui du certificat : vérifiez-le avant de demander.
      </p>
      {formations.map((formation) => (
        <div key={formation.id} className="row between" style={{ gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <span className="small">
            <b>{formation.titre}</b>
            <div className="xs faint">Progression : {formation.progression} %</div>
          </span>
          {formation.dejaCertifiee ? (
            <span className="badge b-green">
              <Icon nom="checkCircle" taille={12} /> délivré
            </span>
          ) : formation.dejaDemande || faites.includes(formation.id) ? (
            <span className="badge b-gold">
              <Icon nom="clock" taille={12} /> en attente de validation
            </span>
          ) : (
            <button className="btn btn-primary btn-sm" disabled={enCours === formation.id} onClick={() => void demander(formation)}>
              <Icon nom="award" taille={14} /> Demander
            </button>
          )}
          {messages[formation.id] && <div className="xs muted" style={{ flexBasis: '100%' }}>{messages[formation.id]}</div>}
        </div>
      ))}
    </div>
  );
}
