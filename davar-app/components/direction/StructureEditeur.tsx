'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { messageDe, poster } from './api';

/** Types de leçon, tels que le campus sait les afficher. */
const TYPES = [
  { valeur: 'video', libelle: 'Vidéo' },
  { valeur: 'text', libelle: 'Texte' },
  { valeur: 'exercise', libelle: 'Exercice' },
  { valeur: 'live', libelle: 'Séance en direct' },
];

type LeconVue = {
  id: string;
  position: number;
  title: string;
  kind: string;
  resourceUrl: string;
  durationMin: number | null;
  terminees: number;
};
type ModuleVue = { id: string; position: number; title: string; summary: string; lecons: LeconVue[] };

type Agir = (corps: Record<string, unknown>) => Promise<void>;

const libelleType = (valeur: string) => TYPES.find((t) => t.valeur === valeur)?.libelle ?? valeur;

/** Champs d'une leçon — partagés par le formulaire d'ajout et d'édition. */
function ChampsLecon({
  valeur,
  onChange,
  prefixe,
}: {
  valeur: { titre: string; type: string; duree: string; ressource: string };
  onChange: (valeur: { titre: string; type: string; duree: string; ressource: string }) => void;
  prefixe: string;
}) {
  return (
    <>
      <div className="grid g3" style={{ gap: 8 }}>
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor={`${prefixe}-titre`}>Titre de la leçon</label>
          <input id={`${prefixe}-titre`} className="inp" value={valeur.titre} onChange={(e) => onChange({ ...valeur, titre: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor={`${prefixe}-type`}>Type</label>
          <select id={`${prefixe}-type`} className="inp" value={valeur.type} onChange={(e) => onChange({ ...valeur, type: e.target.value })}>
            {TYPES.map((type) => (
              <option key={type.valeur} value={type.valeur}>
                {type.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor={`${prefixe}-duree`}>Durée en minutes</label>
          <input id={`${prefixe}-duree`} className="inp" inputMode="numeric" value={valeur.duree} onChange={(e) => onChange({ ...valeur, duree: e.target.value.replace(/[^0-9]/g, '') })} placeholder="12" />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor={`${prefixe}-ressource`}>Adresse de la ressource (vidéo, document) — facultatif</label>
        <input id={`${prefixe}-ressource`} className="inp" value={valeur.ressource} onChange={(e) => onChange({ ...valeur, ressource: e.target.value })} placeholder="https://…" />
        <div className="hint">Laissée vide, la leçon annonce honnêtement « Ressource pas encore publiée » à l&apos;étudiant.</div>
      </div>
    </>
  );
}

function LigneLecon({ lecon, disabled, agir }: { lecon: LeconVue; disabled: boolean; agir: Agir }) {
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState({
    titre: lecon.title,
    type: lecon.kind,
    duree: lecon.durationMin == null ? '' : String(lecon.durationMin),
    ressource: lecon.resourceUrl,
  });

  if (edition)
    return (
      <div className="dv-les" style={{ flexDirection: 'column', alignItems: 'stretch', background: 'var(--violet-soft)' }}>
        <ChampsLecon valeur={valeur} onChange={setValeur} prefixe={`e-${lecon.id}`} />
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-primary"
            disabled={disabled}
            onClick={async () => {
              await agir({ action: 'update-lesson', id: lecon.id, titre: valeur.titre, type: valeur.type, duree: valeur.duree, ressource: valeur.ressource });
              setEdition(false);
            }}
          >
            Enregistrer
          </button>
          <button className="btn btn-ghost" onClick={() => setEdition(false)}>
            Annuler
          </button>
        </div>
      </div>
    );

  return (
    <div className="dv-les">
      <span className="dv-num">{lecon.position}</span>
      <span style={{ fontWeight: 600 }}>{lecon.title}</span>
      <span className="dv-tag">{libelleType(lecon.kind)}</span>
      {lecon.durationMin ? <span className="small muted">{lecon.durationMin} min</span> : null}
      {lecon.resourceUrl ? (
        <span className="small" style={{ color: 'var(--green)' }}>
          ressource en place
        </span>
      ) : (
        <span className="small" style={{ color: 'var(--amber)' }}>
          aucune ressource
        </span>
      )}
      {lecon.terminees > 0 ? (
        <span className="small muted">
          {lecon.terminees} étudiant{lecon.terminees > 1 ? 's' : ''} l&apos;ont terminée
        </span>
      ) : null}
      <span className="dv-actions">
        <button className="dv-mini" disabled={disabled} onClick={() => agir({ action: 'move-lesson', id: lecon.id, sens: 'haut' })} title="Monter">
          ↑
        </button>
        <button className="dv-mini" disabled={disabled} onClick={() => agir({ action: 'move-lesson', id: lecon.id, sens: 'bas' })} title="Descendre">
          ↓
        </button>
        <button className="dv-mini" onClick={() => setEdition(true)}>
          Modifier
        </button>
        <button
          className="dv-mini danger"
          disabled={disabled}
          onClick={() => {
            if (confirm(`Supprimer la leçon « ${lecon.title} » ?`)) agir({ action: 'delete-lesson', id: lecon.id });
          }}
        >
          Supprimer
        </button>
      </span>
    </div>
  );
}

function BlocModule({ module, disabled, agir }: { module: ModuleVue; disabled: boolean; agir: Agir }) {
  const [edition, setEdition] = useState(false);
  const [titre, setTitre] = useState(module.title);
  const [resume, setResume] = useState(module.summary);
  const [ajout, setAjout] = useState(false);
  const [lecon, setLecon] = useState({ titre: '', type: 'video', duree: '', ressource: '' });

  return (
    <div className="dv-mod">
      <header>
        <span className="dv-num">{module.position}</span>
        {edition ? (
          <input className="inp" style={{ maxWidth: 340 }} value={titre} onChange={(e) => setTitre(e.target.value)} />
        ) : (
          <strong>{module.title}</strong>
        )}
        <span className="small muted">
          {module.lecons.length} leçon{module.lecons.length > 1 ? 's' : ''}
        </span>
        <span className="dv-actions">
          <button className="dv-mini" disabled={disabled} onClick={() => agir({ action: 'move-module', id: module.id, sens: 'haut' })} title="Monter">
            ↑
          </button>
          <button className="dv-mini" disabled={disabled} onClick={() => agir({ action: 'move-module', id: module.id, sens: 'bas' })} title="Descendre">
            ↓
          </button>
          {edition ? (
            <>
              <button
                className="dv-mini"
                disabled={disabled}
                onClick={async () => {
                  await agir({ action: 'update-module', id: module.id, titre, resume });
                  setEdition(false);
                }}
              >
                Enregistrer
              </button>
              <button className="dv-mini" onClick={() => setEdition(false)}>
                Annuler
              </button>
            </>
          ) : (
            <button className="dv-mini" onClick={() => setEdition(true)}>
              Modifier
            </button>
          )}
          <button
            className="dv-mini danger"
            disabled={disabled}
            onClick={() => {
              if (confirm(`Supprimer le module « ${module.title} » et ses ${module.lecons.length} leçon(s) ?`))
                agir({ action: 'delete-module', id: module.id });
            }}
          >
            Supprimer
          </button>
        </span>
      </header>

      {edition && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor={`m-${module.id}-resume`}>Résumé du module (facultatif)</label>
            <input id={`m-${module.id}-resume`} className="inp" value={resume} onChange={(e) => setResume(e.target.value)} />
          </div>
        </div>
      )}

      {module.lecons.map((item) => (
        <LigneLecon key={item.id} lecon={item} disabled={disabled} agir={agir} />
      ))}

      <div style={{ padding: '10px 14px', background: '#FAF9FC' }}>
        {ajout ? (
          <div>
            <ChampsLecon valeur={lecon} onChange={setLecon} prefixe={`a-${module.id}`} />
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={disabled || lecon.titre.trim().length < 2}
                onClick={async () => {
                  await agir({ action: 'add-lesson', id: module.id, titre: lecon.titre, type: lecon.type, duree: lecon.duree, ressource: lecon.ressource });
                  setLecon({ titre: '', type: 'video', duree: '', ressource: '' });
                  setAjout(false);
                }}
              >
                Ajouter la leçon
              </button>
              <button className="btn btn-ghost" onClick={() => setAjout(false)}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button className="dv-mini" onClick={() => setAjout(true)}>
            + Ajouter une leçon
          </button>
        )}
      </div>
    </div>
  );
}

/** Construire la structure d'une formation : modules, leçons, ordre. */
export function StructureEditeur({ formationId, modules }: { formationId: string; modules: ModuleVue[] }) {
  const router = useRouter();
  const [bilan, setBilan] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [nouveau, setNouveau] = useState({ titre: '', resume: '' });

  async function agir(corps: Record<string, unknown>) {
    setEnCours(true);
    const reponse = await poster('/api/direction/structure', corps);
    setBilan({ ok: reponse.ok, texte: messageDe(reponse) });
    setEnCours(false);
    if (reponse.ok) router.refresh();
  }

  return (
    <div>
      {bilan && (
        <div className={`banner ${bilan.ok ? 'ok' : 'err'} mb16`} role="status">
          <span>{bilan.texte}</span>
        </div>
      )}

      {modules.length === 0 ? (
        <div className="banner info mb16">
          <span>
            Cette formation n&apos;a encore aucun module. Tant qu&apos;elle n&apos;a pas de leçon, elle ne peut pas être ouverte : le
            bouton d&apos;ouverture refusera, avec le compte exact.
          </span>
        </div>
      ) : (
        <div className="dv-list mb16">
          {modules.map((module) => (
            <BlocModule key={module.id} module={module} disabled={enCours} agir={agir} />
          ))}
        </div>
      )}

      <div className="card card-pad">
        <h4 className="mb8">Ajouter un module</h4>
        <div className="grid g2" style={{ gap: 12 }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="nm-titre">Titre du module</label>
            <input id="nm-titre" className="inp" value={nouveau.titre} onChange={(e) => setNouveau({ ...nouveau, titre: e.target.value })} placeholder="Vaincre le trac" />
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="nm-resume">Résumé (facultatif)</label>
            <input id="nm-resume" className="inp" value={nouveau.resume} onChange={(e) => setNouveau({ ...nouveau, resume: e.target.value })} />
          </div>
        </div>
        <button
          className="btn btn-primary"
          disabled={enCours || nouveau.titre.trim().length < 2}
          onClick={async () => {
            await agir({ action: 'add-module', id: formationId, titre: nouveau.titre, resume: nouveau.resume });
            setNouveau({ titre: '', resume: '' });
          }}
        >
          Ajouter le module
        </button>
      </div>
    </div>
  );
}
