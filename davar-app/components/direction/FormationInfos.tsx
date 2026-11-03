'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { messageDe, poster } from './api';
import type { Formation } from '@/lib/server/direction';

/** Informations d'une formation : enregistrer, ouvrir/fermer, supprimer. */
export function FormationInfos({ formation }: { formation: Formation }) {
  const router = useRouter();
  const [titre, setTitre] = useState(formation.title);
  const [description, setDescription] = useState(formation.description);
  const [prixCfa, setPrixCfa] = useState(String(formation.priceCfa));
  const [chariowProductId, setChariowProductId] = useState(formation.chariowProductId);
  const [buyUrl, setBuyUrl] = useState(formation.buyUrl);
  const [code, setCode] = useState(formation.code ?? '');
  const [heures, setHeures] = useState(formation.hours > 0 ? String(formation.hours) : '');
  const [note, setNote] = useState(formation.rating !== null ? String(formation.rating) : '');
  const [bilan, setBilan] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(corps: Record<string, unknown>) {
    setEnCours(true);
    const reponse = await poster('/api/direction/formation', { id: formation.id, ...corps });
    setBilan({ ok: reponse.ok, texte: messageDe(reponse) });
    setEnCours(false);
    if (reponse.ok) router.refresh();
  }

  return (
    <div className="card card-pad">
      <div className="row between mb16" style={{ gap: 10, flexWrap: 'wrap' }}>
        <h3>Informations</h3>
        <span className={`dv-tag ${formation.published ? 'open' : 'closed'}`}>
          {formation.published ? 'Ouverte à la vente' : 'Fermée — invisible du public'}
        </span>
      </div>

      <div className="field">
        <label htmlFor="i-titre">Titre</label>
        <input id="i-titre" className="inp" value={titre} onChange={(e) => setTitre(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="i-desc">Description</label>
        <textarea id="i-desc" className="inp" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid g2" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="i-prix">Prix en FCFA</label>
          <input id="i-prix" className="inp" inputMode="numeric" value={prixCfa} onChange={(e) => setPrixCfa(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>
        <div className="field">
          <label htmlFor="i-produit">Identifiant produit Chariow</label>
          <input id="i-produit" className="inp" value={chariowProductId} onChange={(e) => setChariowProductId(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="i-url">Lien de paiement</label>
        <input id="i-url" className="inp" value={buyUrl} onChange={(e) => setBuyUrl(e.target.value)} />
      </div>

      <div className="eyebrow mt16 mb8">Ce que la carte du catalogue affiche</div>
      <div className="grid g3" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="i-code">Référence</label>
          <input
            id="i-code"
            className="inp"
            placeholder="OR-101"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 20))}
          />
        </div>
        <div className="field">
          <label htmlFor="i-heures">Durée en heures</label>
          <input
            id="i-heures"
            className="inp"
            inputMode="numeric"
            placeholder="non renseignée"
            value={heures}
            onChange={(e) => setHeures(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          />
        </div>
        <div className="field">
          <label htmlFor="i-note">Note sur 5</label>
          <input
            id="i-note"
            className="inp"
            inputMode="decimal"
            placeholder="non renseignée"
            value={note}
            onChange={(e) => setNote(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 4))}
          />
        </div>
      </div>
      <p className="xs faint mt4">
        Laissées vides, la durée et la note ne sont pas affichées : la carte ne montre que ce que
        vous avez renseigné.
      </p>

      {bilan && (
        <div className={`banner ${bilan.ok ? 'ok' : 'err'} mb16`} role="status">
          <span>{bilan.texte}</span>
        </div>
      )}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          disabled={enCours}
          onClick={() =>
            envoyer({
              action: 'update',
              titre,
              description,
              prixCfa: Number(prixCfa || 0),
              chariowProductId,
              buyUrl,
              code,
              hours: Number(heures || 0),
              rating: note.trim() === '' ? null : Number(note.replace(',', '.')),
            })
          }
        >
          Enregistrer
        </button>
        <button
          className="btn"
          disabled={enCours}
          onClick={() => envoyer({ action: 'publish', publie: !formation.published })}
        >
          {formation.published ? 'Fermer la formation' : 'Ouvrir la formation'}
        </button>
        <button
          className="btn btn-danger"
          disabled={enCours}
          onClick={() => {
            if (confirm('Supprimer définitivement cette formation ? Refusé si un étudiant y a accès ou si elle a été achetée.'))
              envoyer({ action: 'delete' });
          }}
        >
          Supprimer
        </button>
      </div>
      <p className="small muted mt16">
        Ouvrir une formation vide est refusé : sans leçon, l&apos;étudiant paierait pour une page blanche.
      </p>
    </div>
  );
}
