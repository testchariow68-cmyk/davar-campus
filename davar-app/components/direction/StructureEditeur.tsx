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

type RessourceVue = {
  id: string;
  kind: 'illustration' | 'ressource';
  position: number;
  title: string;
  type: string;
  url: string | null;
  duration: string | null;
  ratio: string | null;
  size: string | null;
};
type LeconVue = {
  id: string;
  position: number;
  title: string;
  kind: string;
  resourceUrl: string;
  durationMin: number | null;
  /** Format d'image de la vidéo principale. */
  ratio: string;
  content: string;
  terminees: number;
  /** Vidéos d'illustration et ressources du cours. */
  assets: RessourceVue[];
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
  valeur: { titre: string; type: string; duree: string; ressource: string; contenu: string; ratio: string };
  onChange: (valeur: { titre: string; type: string; duree: string; ressource: string; contenu: string; ratio: string }) => void;
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

/** Formats d'image que sait afficher le lecteur. */
const FORMATS = ['16:9', '9:16', '4:3', '1:1'];
/** Types de ressource, dans les mots du prototype. */
const TYPES_RESSOURCE = [
  { valeur: 'pdf', libelle: 'PDF' },
  { valeur: 'doc', libelle: 'Document' },
  { valeur: 'audio', libelle: 'Audio' },
  { valeur: 'image', libelle: 'Image' },
  { valeur: 'video', libelle: 'Vidéo' },
  { valeur: 'autre', libelle: 'Autre' },
];

/**
 * UNE LEÇON — et, depuis l'enrichissement, ce qu'elle porte : le format d'image
 * de sa vidéo principale, ses vidéos d'illustration, et ses ressources
 * (documents, audio, images). Tout se fait en silence : aucune notification,
 * aucune progression réinitialisée.
 */
function LigneLecon({ lecon, disabled, agir }: { lecon: LeconVue; disabled: boolean; agir: Agir }) {
  const [edition, setEdition] = useState(false);
  const [enrichir, setEnrichir] = useState(false);
  const [valeur, setValeur] = useState({
    titre: lecon.title,
    type: lecon.kind,
    duree: lecon.durationMin == null ? '' : String(lecon.durationMin),
    ressource: lecon.resourceUrl,
    contenu: lecon.content,
    ratio: lecon.ratio || '16:9',
  });
  const [illustration, setIllustration] = useState({ titre: '', duree: '5:00', ratio: '16:9', url: '' });
  const [ressource, setRessource] = useState({ titre: '', type: 'pdf', taille: '', url: '' });

  const illustrations = lecon.assets.filter((a) => a.kind === 'illustration');
  const ressources = lecon.assets.filter((a) => a.kind === 'ressource');

  if (edition)
    return (
      <div className="dv-les" style={{ flexDirection: 'column', alignItems: 'stretch', background: 'var(--violet-soft)' }}>
        <ChampsLecon valeur={valeur} onChange={setValeur} prefixe={`e-${lecon.id}`} />
        <div className="field" style={{ marginBottom: 8, maxWidth: 220 }}>
          <label htmlFor={`r-e-${lecon.id}`}>Format de la vidéo</label>
          <select id={`r-e-${lecon.id}`} className="inp" value={valeur.ratio} onChange={(e) => setValeur({ ...valeur, ratio: e.target.value })}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-primary"
            disabled={disabled}
            onClick={async () => {
              await agir({ action: 'update-lesson', id: lecon.id, titre: valeur.titre, type: valeur.type, duree: valeur.duree, ressource: valeur.ressource, contenu: valeur.contenu, ratio: valeur.ratio });
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
    <div style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="dv-les">
        <span className="dv-num">{lecon.position}</span>
        <span style={{ fontWeight: 600 }}>{lecon.title}</span>
        <span className="dv-tag">{libelleType(lecon.kind)}</span>
        {lecon.durationMin ? <span className="small muted">{lecon.durationMin} min</span> : null}
        {lecon.resourceUrl ? (
          <span className="small" style={{ color: 'var(--green)' }}>
            vidéo en place
          </span>
        ) : (
          <span className="small" style={{ color: 'var(--amber)' }}>
            aucune vidéo
          </span>
        )}
        {lecon.assets.length > 0 ? (
          <span className="small muted">
            {illustrations.length} illustration{illustrations.length > 1 ? 's' : ''} · {ressources.length} ressource
            {ressources.length > 1 ? 's' : ''}
          </span>
        ) : null}
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
          <button className="dv-mini" onClick={() => setEnrichir((ouvert) => !ouvert)}>
            {enrichir ? 'Fermer' : 'Enrichir'}
          </button>
          <button
            className="dv-mini danger"
            disabled={disabled}
            onClick={() => {
              if (confirm(`Supprimer le cours « ${lecon.title} » ?`)) agir({ action: 'delete-lesson', id: lecon.id });
            }}
          >
            Supprimer
          </button>
        </span>
      </div>

      {enrichir && (
        <div className="card card-pad" style={{ margin: '0 12px 12px' }}>
          <h4 className="mb8">Vidéos d’illustration ({illustrations.length})</h4>
          <div className="small muted">
            Elles se jouent dans le lecteur du cours, à la place de la vidéo principale, et ne comptent jamais dans la
            progression.
          </div>
          {illustrations.map((v) => (
            <div className="row between mt8" key={v.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
              <span className="small">
                <b>{v.title}</b> <span className="xs faint">{v.duration} · {v.ratio}</span>
              </span>
              <button
                className="dv-mini danger"
                disabled={disabled}
                onClick={() => {
                  if (confirm(`Retirer l’illustration « ${v.title} » ?`)) agir({ action: 'delete-asset', id: v.id });
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 8, marginTop: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Titre</label>
              <input className="inp" value={illustration.titre} onChange={(e) => setIllustration({ ...illustration, titre: e.target.value })} placeholder="Complément : la posture" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Durée</label>
              <input className="inp" value={illustration.duree} onChange={(e) => setIllustration({ ...illustration, duree: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Format</label>
              <select className="inp" value={illustration.ratio} onChange={(e) => setIllustration({ ...illustration, ratio: e.target.value })}>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>URL de la vidéo</label>
              <input className="inp" value={illustration.url} onChange={(e) => setIllustration({ ...illustration, url: e.target.value })} placeholder="https://…" />
            </div>
          </div>
          <button
            className="btn btn-sm mt8"
            disabled={disabled || illustration.titre.trim().length < 2}
            onClick={async () => {
              await agir({ action: 'add-asset', id: lecon.id, genre: 'illustration', type: 'video', titre: illustration.titre, duree: illustration.duree, ratio: illustration.ratio, url: illustration.url });
              setIllustration({ titre: '', duree: '5:00', ratio: '16:9', url: '' });
            }}
          >
            + Ajouter l’illustration
          </button>

          <h4 className="mb8 mt16">Ressources ({ressources.length})</h4>
          <div className="small muted">Documents, audio, images : l’élève les télécharge ou les écoute.</div>
          {ressources.map((r) => (
            <div className="row between mt8" key={r.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
              <span className="small">
                <b>{r.title}</b>{' '}
                <span className="xs faint">
                  {TYPES_RESSOURCE.find((t) => t.valeur === r.type)?.libelle ?? r.type}
                  {r.size ? ` · ${r.size}` : ''}
                </span>
              </span>
              <button
                className="dv-mini danger"
                disabled={disabled}
                onClick={() => {
                  if (confirm(`Retirer la ressource « ${r.title} » ?`)) agir({ action: 'delete-asset', id: r.id });
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 8, marginTop: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Nom</label>
              <input className="inp" value={ressource.titre} onChange={(e) => setRessource({ ...ressource, titre: e.target.value })} placeholder="Fiche respiration (PDF)" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Type</label>
              <select className="inp" value={ressource.type} onChange={(e) => setRessource({ ...ressource, type: e.target.value })}>
                {TYPES_RESSOURCE.map((t) => (
                  <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Taille</label>
              <input className="inp" value={ressource.taille} onChange={(e) => setRessource({ ...ressource, taille: e.target.value })} placeholder="1,1 Mo" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>URL (https)</label>
              <input className="inp" value={ressource.url} onChange={(e) => setRessource({ ...ressource, url: e.target.value })} placeholder="https://…" />
            </div>
          </div>
          <button
            className="btn btn-sm mt8"
            disabled={disabled || ressource.titre.trim().length < 2}
            onClick={async () => {
              await agir({ action: 'add-asset', id: lecon.id, genre: 'ressource', type: ressource.type, titre: ressource.titre, taille: ressource.taille, url: ressource.url });
              setRessource({ titre: '', type: 'pdf', taille: '', url: '' });
            }}
          >
            + Ajouter la ressource
          </button>
        </div>
      )}
    </div>
  );
}

function BlocModule({ module, disabled, agir }: { module: ModuleVue; disabled: boolean; agir: Agir }) {
  const [edition, setEdition] = useState(false);
  const [titre, setTitre] = useState(module.title);
  const [resume, setResume] = useState(module.summary);
  const [ajout, setAjout] = useState(false);
  const [lecon, setLecon] = useState({ titre: '', type: 'video', duree: '', ressource: '', contenu: '', ratio: '16:9' });

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
                  await agir({ action: 'add-lesson', id: module.id, titre: lecon.titre, type: lecon.type, duree: lecon.duree, ressource: lecon.ressource, contenu: lecon.contenu, ratio: lecon.ratio });
                  setLecon({ titre: '', type: 'video', duree: '', ressource: '', contenu: '', ratio: '16:9' });
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
type ChapitreVue = { id: string; position: number; title: string; summary: string; modules: ModuleVue[] };

/**
 * UN CHAPITRE — son titre, ses modules, et de quoi le tenir à jour.
 * Le niveau module reste inchangé : `BlocModule` continue d'y ajouter les cours.
 */
function BlocChapitre({
  chapitre,
  formationId,
  disabled,
  agir,
}: {
  chapitre: ChapitreVue;
  formationId: string;
  disabled: boolean;
  agir: Agir;
}) {
  const [edition, setEdition] = useState(false);
  const [titre, setTitre] = useState(chapitre.title);
  const [resume, setResume] = useState(chapitre.summary);
  const [ajout, setAjout] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [nouveau, setNouveau] = useState({ titre: '', resume: '' });

  return (
    <div className="dv-mod">
      <header>
        <span className="dv-num">Chapitre {chapitre.position}</span>
        {edition ? (
          <input className="inp" style={{ maxWidth: 300 }} value={titre} onChange={(e) => setTitre(e.target.value)} />
        ) : (
          <strong>{chapitre.title}</strong>
        )}
        <span className="small muted">
          {chapitre.modules.length} module{chapitre.modules.length > 1 ? 's' : ''}
        </span>
        <span className="dv-actions">
          <button
            className="dv-mini"
            disabled={disabled}
            onClick={() => agir({ action: 'move-chapter', id: chapitre.id, sens: 'haut' })}
            title="Monter le chapitre"
          >
            {'↑'}
          </button>
          <button
            className="dv-mini"
            disabled={disabled}
            onClick={() => agir({ action: 'move-chapter', id: chapitre.id, sens: 'bas' })}
            title="Descendre le chapitre"
          >
            {'↓'}
          </button>
          {edition ? (
            <>
              <button
                className="dv-mini"
                disabled={disabled || titre.trim().length < 2}
                onClick={async () => {
                  await agir({ action: 'update-chapter', id: chapitre.id, titre, resume });
                  setEdition(false);
                }}
                title="Enregistrer"
              >
                {'✓'}
              </button>
              <button
                className="dv-mini"
                disabled={disabled}
                onClick={() => {
                  setTitre(chapitre.title);
                  setResume(chapitre.summary);
                  setEdition(false);
                }}
                title="Annuler"
              >
                {'✕'}
              </button>
            </>
          ) : (
            <button className="dv-mini" disabled={disabled} onClick={() => setEdition(true)} title="Renommer">
              {'✎'}
            </button>
          )}
          {confirmer ? (
            <>
              <button
                className="dv-mini"
                disabled={disabled}
                onClick={async () => {
                  await agir({ action: 'delete-chapter', id: chapitre.id });
                  setConfirmer(false);
                }}
                title="Confirmer la suppression"
              >
                {'oui'}
              </button>
              <button className="dv-mini" disabled={disabled} onClick={() => setConfirmer(false)} title="Annuler">
                {'non'}
              </button>
            </>
          ) : (
            <button
              className="dv-mini"
              disabled={disabled}
              onClick={() => setConfirmer(true)}
              title="Supprimer le chapitre et son contenu"
            >
              {'🗑'}
            </button>
          )}
        </span>
      </header>

      {edition && (
        <div className="field mt8" style={{ marginBottom: 8 }}>
          <label>Résumé du chapitre (facultatif)</label>
          <input className="inp" value={resume} onChange={(e) => setResume(e.target.value)} />
        </div>
      )}
      {!edition && chapitre.summary && <p className="small muted">{chapitre.summary}</p>}

      {confirmer && (
        <p className="xs" style={{ color: 'var(--red)' }}>
          Supprimer ce chapitre supprime aussi ses modules et leurs cours. La progression déjà acquise par les étudiants
          empêche la suppression.
        </p>
      )}

      {chapitre.modules.length > 0 && (
        <div className="dv-list mt8">
          {chapitre.modules.map((module) => (
            <BlocModule key={module.id} module={module} disabled={disabled} agir={agir} />
          ))}
        </div>
      )}

      {ajout ? (
        <div className="card card-pad mt8">
          <h4 className="mb8">Nouveau module dans ce chapitre</h4>
          <div className="grid g2" style={{ gap: 12 }}>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Titre du module</label>
              <input
                className="inp"
                value={nouveau.titre}
                onChange={(e) => setNouveau({ ...nouveau, titre: e.target.value })}
                placeholder="Les fondations de la voix"
              />
            </div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Résumé (facultatif)</label>
              <input
                className="inp"
                value={nouveau.resume}
                onChange={(e) => setNouveau({ ...nouveau, resume: e.target.value })}
              />
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-primary"
              disabled={disabled || nouveau.titre.trim().length < 2}
              onClick={async () => {
                await agir({
                  action: 'add-module',
                  id: formationId,
                  chapitre: chapitre.id,
                  titre: nouveau.titre,
                  resume: nouveau.resume,
                });
                setNouveau({ titre: '', resume: '' });
                setAjout(false);
              }}
            >
              Ajouter le module
            </button>
            <button className="btn btn-ghost" disabled={disabled} onClick={() => setAjout(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm mt8" disabled={disabled} onClick={() => setAjout(true)}>
          + Ajouter un module dans ce chapitre
        </button>
      )}
    </div>
  );
}

/**
 * LA STRUCTURE — trois niveaux, dans l'ordre que le propriétaire a fixé :
 * la formation contient des chapitres, un chapitre contient des modules, un
 * module contient les cours. C'est cette profondeur qui gouverne le déblocage
 * côté élève : un chapitre ne s'ouvre que lorsque le précédent est terminé.
 */
export function StructureEditeur({
  formationId,
  chapitres,
}: {
  formationId: string;
  chapitres: ChapitreVue[];
}) {
  const router = useRouter();
  const [bilan, setBilan] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [nouveauChapitre, setNouveauChapitre] = useState({ titre: '', resume: '' });

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

      {chapitres.length === 0 ? (
        <div className="banner info mb16">
          <span>
            Cette formation n&apos;a encore aucun chapitre. Le campus se parcourt chapitre par chapitre : créez le
            premier, puis ses modules, puis les cours de chaque module.
          </span>
        </div>
      ) : (
        <div className="dv-list mb16">
          {chapitres.map((chapitre) => (
            <BlocChapitre
              key={chapitre.id}
              chapitre={chapitre}
              formationId={formationId}
              disabled={enCours}
              agir={agir}
            />
          ))}
        </div>
      )}

      <div className="card card-pad">
        <h4 className="mb8">Ajouter un chapitre</h4>
        <div className="grid g2" style={{ gap: 12 }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="nc-titre">Titre du chapitre</label>
            <input
              id="nc-titre"
              className="inp"
              value={nouveauChapitre.titre}
              onChange={(e) => setNouveauChapitre({ ...nouveauChapitre, titre: e.target.value })}
              placeholder="Chapitre 1 — Les fondations"
            />
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="nc-resume">Résumé (facultatif)</label>
            <input
              id="nc-resume"
              className="inp"
              value={nouveauChapitre.resume}
              onChange={(e) => setNouveauChapitre({ ...nouveauChapitre, resume: e.target.value })}
            />
          </div>
        </div>
        <button
          className="btn btn-primary"
          disabled={enCours || nouveauChapitre.titre.trim().length < 2}
          onClick={async () => {
            await agir({
              action: 'add-chapter',
              id: formationId,
              titre: nouveauChapitre.titre,
              resume: nouveauChapitre.resume,
            });
            setNouveauChapitre({ titre: '', resume: '' });
          }}
        >
          Ajouter le chapitre
        </button>
      </div>
    </div>
  );
}
