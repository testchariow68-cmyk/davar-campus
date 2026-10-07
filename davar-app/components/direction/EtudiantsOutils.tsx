'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { messageDe, poster } from './api';

type Acces = { trainingId: string; titre: string; source: string; acquisMs: number };
type EtudiantVue = {
  id: string;
  email: string;
  nom: string;
  statut: string;
  confirme: boolean;
  estTest: boolean;
  creeMs: number;
  acces: Acces[];
  leconsTerminees: number;
};

/** Liste des étudiants : ouvrir un accès, le retirer, suspendre ou réactiver un compte. */
export function EtudiantsOutils({ etudiants, formations }: { etudiants: EtudiantVue[]; formations: { id: string; title: string }[] }) {
  const router = useRouter();
  const [recherche, setRecherche] = useState('');
  const [bilan, setBilan] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [choix, setChoix] = useState<Record<string, string>>({});

  async function agir(corps: Record<string, unknown>) {
    setEnCours(true);
    const reponse = await poster('/api/direction/people', corps);
    setBilan({ ok: reponse.ok, texte: messageDe(reponse) });
    setEnCours(false);
    if (reponse.ok) router.refresh();
  }

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return etudiants;
    return etudiants.filter((etudiant) => etudiant.email.includes(terme) || etudiant.nom.toLowerCase().includes(terme));
  }, [etudiants, recherche]);

  return (
    <div>
      {bilan && (
        <div className={`banner ${bilan.ok ? 'ok' : 'err'} mb16`} role="status">
          <span>{bilan.texte}</span>
        </div>
      )}

      <div className="row between mb16" style={{ gap: 12, flexWrap: 'wrap' }}>
        <input
          className="inp"
          style={{ maxWidth: 320 }}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un nom ou une adresse…"
          aria-label="Rechercher un étudiant"
        />
        <span className="small muted">
          {filtres.length} étudiant{filtres.length > 1 ? 's' : ''} affiché{filtres.length > 1 ? 's' : ''}
        </span>
      </div>

      {etudiants.length === 0 ? (
        <div className="banner info">
          <span>
            Aucun étudiant pour l&apos;instant. Dès qu&apos;une personne créera son compte et confirmera son adresse, elle
            apparaîtra ici — et vous pourrez lui ouvrir un accès à la main.
          </span>
        </div>
      ) : (
        <div className="dv-list">
          {filtres.map((etudiant) => (
            <div key={etudiant.id} className="dv-item">
              <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {etudiant.nom}{' '}
                    {etudiant.statut === 'suspended' ? <span className="dv-tag closed">suspendu</span> : null}{' '}
                    {etudiant.confirme ? null : <span className="dv-tag closed">e-mail à confirmer</span>}{' '}
                    {etudiant.estTest ? <span className="dv-tag">compte de test</span> : null}
                  </div>
                  <div className="small muted">
                    {etudiant.email} · inscrit le {new Date(etudiant.creeMs).toLocaleDateString('fr-FR')} ·{' '}
                    {etudiant.leconsTerminees} leçon{etudiant.leconsTerminees > 1 ? 's' : ''} terminée{etudiant.leconsTerminees > 1 ? 's' : ''}
                  </div>
                </div>
                <span className="dv-actions">
                  <button
                    className="dv-mini"
                    disabled={enCours}
                    onClick={() => agir({ action: 'toggle-test', email: etudiant.email, estTest: !etudiant.estTest })}
                  >
                    {etudiant.estTest ? 'Compte réel' : 'Marquer test'}
                  </button>
                  <button
                    className="dv-mini"
                    disabled={enCours}
                    onClick={() => agir({ action: 'set-status', email: etudiant.email, statut: etudiant.statut === 'suspended' ? 'active' : 'suspended' })}
                  >
                    {etudiant.statut === 'suspended' ? 'Réactiver' : 'Suspendre'}
                  </button>
                </span>
              </div>

              <div className="mt8" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {etudiant.acces.length === 0 ? (
                  <span className="small muted">Aucun accès pour l&apos;instant.</span>
                ) : (
                  etudiant.acces.map((acces) => (
                    <div key={acces.trainingId} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="dv-tag open">{acces.titre}</span>
                      <span className="small muted">
                        {acces.source === 'verified_purchase' ? 'achat vérifié' : 'accès ouvert par la direction'} —{' '}
                        {new Date(acces.acquisMs).toLocaleDateString('fr-FR')}
                      </span>
                      {acces.source === 'staff_grant' ? (
                        <button
                          className="dv-mini danger"
                          disabled={enCours}
                          onClick={() => agir({ action: 'revoke-access', email: etudiant.email, formation: acces.trainingId })}
                        >
                          Retirer
                        </button>
                      ) : (
                        <span className="small muted">un achat ne se retire pas</span>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="row mt8" style={{ gap: 8, flexWrap: 'wrap' }}>
                <select
                  className="inp"
                  style={{ maxWidth: 260 }}
                  value={choix[etudiant.id] ?? formations[0]?.id ?? ''}
                  onChange={(e) => setChoix({ ...choix, [etudiant.id]: e.target.value })}
                  aria-label={`Formation à ouvrir pour ${etudiant.nom}`}
                >
                  {formations.map((formation) => (
                    <option key={formation.id} value={formation.id}>
                      {formation.title}
                    </option>
                  ))}
                </select>
                <button
                  className="btn"
                  disabled={enCours || formations.length === 0}
                  onClick={() => agir({ action: 'grant-access', email: etudiant.email, formation: choix[etudiant.id] ?? formations[0]?.id })}
                >
                  Ouvrir cet accès
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
