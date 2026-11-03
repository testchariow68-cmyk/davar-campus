'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { messageDe, poster } from './api';

/** Création d'une formation. Elle naît FERMÉE : le propriétaire l'ouvre quand elle est prête. */
export function FormationCreator() {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [prixCfa, setPrixCfa] = useState('');
  const [chariowProductId, setChariowProductId] = useState('');
  const [buyUrl, setBuyUrl] = useState('');
  const [bilan, setBilan] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer() {
    setEnCours(true);
    const reponse = await poster('/api/direction/formation', {
      action: 'create',
      titre,
      description,
      prixCfa: Number(prixCfa || 0),
      chariowProductId,
      buyUrl,
    });
    setBilan({ ok: reponse.ok, texte: messageDe(reponse) });
    setEnCours(false);
    if (reponse.ok) {
      setTitre('');
      setDescription('');
      setPrixCfa('');
      setChariowProductId('');
      setBuyUrl('');
      setOuvert(false);
      router.refresh();
    }
  }

  if (!ouvert)
    return (
      <button className="btn btn-primary" onClick={() => setOuvert(true)}>
        Créer une formation
      </button>
    );

  return (
    <div className="card card-pad">
      <h3 className="mb8">Nouvelle formation</h3>
      <p className="small muted mb16">
        Elle sera enregistrée fermée. Vous construirez ses modules et ses leçons avant de l&apos;ouvrir.
      </p>
      <div className="field">
        <label htmlFor="f-titre">Titre</label>
        <input id="f-titre" className="inp" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Devenir un excellent orateur" />
      </div>
      <div className="field">
        <label htmlFor="f-desc">Description (présentation affichée au catalogue)</label>
        <textarea id="f-desc" className="inp" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid g2" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="f-prix">Prix en FCFA</label>
          <input id="f-prix" className="inp" inputMode="numeric" value={prixCfa} onChange={(e) => setPrixCfa(e.target.value.replace(/[^0-9]/g, ''))} placeholder="45000" />
        </div>
        <div className="field">
          <label htmlFor="f-produit">Identifiant du produit Chariow (facultatif)</label>
          <input id="f-produit" className="inp" value={chariowProductId} onChange={(e) => setChariowProductId(e.target.value)} placeholder="prd_xxxxxxx" />
          <div className="hint">C&apos;est lui qui rattache automatiquement les achats Chariow à cette formation.</div>
        </div>
      </div>
      <div className="field">
        <label htmlFor="f-url">Lien de paiement (facultatif)</label>
        <input id="f-url" className="inp" value={buyUrl} onChange={(e) => setBuyUrl(e.target.value)} placeholder="https://…" />
        <div className="hint">Sans lien, l&apos;étudiant ne verra jamais un bouton « Acheter » qui ne mène nulle part.</div>
      </div>
      {bilan && (
        <div className={`banner ${bilan.ok ? 'ok' : 'err'} mb16`} role="status">
          <span>{bilan.texte}</span>
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" onClick={envoyer} disabled={enCours || titre.trim().length < 3}>
          {enCours ? 'Enregistrement…' : 'Créer la formation'}
        </button>
        <button className="btn btn-ghost" onClick={() => setOuvert(false)} disabled={enCours}>
          Annuler
        </button>
      </div>
    </div>
  );
}
