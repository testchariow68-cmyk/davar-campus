'use client';

import { useState } from 'react';
import { Icon } from '@/components/campus/Icon';

type Moteur = {
  provider: string;
  nom: string;
  note: string;
  modele: string;
  cle: boolean;
  principal: boolean;
  dansChaine: boolean;
};

export function AssistantConfig({
  initial,
  moteurs,
  formations,
}: {
  initial: { displayName: string; defaultName: string; lang: string; temperature: number; studentDailyCap: number; transcription: string; primaryProvider: string };
  moteurs: Moteur[];
  formations: Array<{ id: string; titre: string; associee: boolean }>;
}) {
  const [config, setConfig] = useState(initial);
  const [etat, setEtat] = useState(moteurs);
  const [associations, setAssociations] = useState(formations);
  const [note, setNote] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(corps: Record<string, unknown>, message: string) {
    setEnCours(true);
    setNote(null);
    try {
      const reponse = await fetch('/api/direction/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; moteurs?: Moteur[] };
      if (donnees.ok) {
        setNote(donnees.message ?? message);
        if (Array.isArray(donnees.moteurs)) setEtat(donnees.moteurs);
      } else {
        setNote("L'enregistrement n'a pas abouti. Réessayez.");
      }
    } catch {
      setNote('Le réseau n’a pas répondu.');
    }
    setEnCours(false);
  }

  return (
    <>
      {note && (
        <div className="banner info mb16">
          <Icon nom="checkCircle" taille={14} />
          <span>{note}</span>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start', gap: 16 }}>
        <div className="card card-pad">
          <div className="row between mb16">
            <div className="eyebrow">Connexion</div>
            <span className={`badge ${etat.some((m) => m.cle) ? 'b-green' : 'b-red'}`}>
              <span className={`dot ${etat.some((m) => m.cle) ? 'dot-green' : 'dot-red'}`} />{' '}
              {etat.some((m) => m.cle) ? 'Au moins un moteur prêt' : 'Aucun moteur relié'}
            </span>
          </div>

          <div className="banner info mb8">
            <Icon nom="zap" taille={13} />
            <span className="small">
              Le premier moteur disponible répond ; quand son quota du jour est atteint, <b>le suivant prend
              le relais</b> sans que l’étudiant s’en aperçoive. Cliquer sur un moteur le place en tête.
            </span>
          </div>

          <div className="grid g2">
            {etat.map((moteur, index) => (
              <button
                key={moteur.provider}
                type="button"
                className={`pay-opt ${moteur.principal ? 'sel' : ''}`}
                style={{ margin: 0, textAlign: 'left' }}
                disabled={enCours}
                onClick={() => {
                  setConfig({ ...config, primaryProvider: moteur.provider });
                  void envoyer({ action: 'config', primaryProvider: moteur.provider }, `${moteur.nom} passe en tête de chaîne.`);
                }}
              >
                <span className="wrap">
                  <b style={{ fontSize: 13 }}>
                    {index + 1}. {moteur.nom}
                  </b>
                  <div className="xs muted">{moteur.note}</div>
                  <div className="xs mt4">
                    {!moteur.cle ? (
                      <span className="badge b-grey">clé à poser</span>
                    ) : moteur.principal ? (
                      <span className="badge b-green">en tête</span>
                    ) : (
                      <span className="badge b-grey">en secours</span>
                    )}
                  </div>
                </span>
                {moteur.principal && <Icon nom="checkCircle" taille={17} />}
              </button>
            ))}
          </div>

          <p className="xs faint mt16">
            La clé d’API ne passe jamais par cette page : elle se pose dans l’environnement du serveur
            (variables <code>GROQ_API_KEY</code>, <code>GEMINI_API_KEY</code>, <code>OPENROUTER_API_KEY</code>,{' '}
            <code>HUGGINGFACE_API_KEY</code>). Elle n’est donc jamais visible depuis un navigateur d’étudiant.
          </p>

          <div className="row mt16" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm"
              disabled={enCours}
              onClick={() => void envoyer({ action: 'quota_simuler', provider: config.primaryProvider }, 'Quota marqué atteint : la bascule est vérifiable dès maintenant.')}
            >
              <Icon nom="zap" taille={13} /> Simuler : quota atteint
            </button>
            <span className="xs faint">Pour vérifier la bascule automatique sans attendre demain.</span>
          </div>

          <div className="divider" />

          <div className="eyebrow mb8">Transcription fidèle des avis audio (open source · gratuit · sans serveur à héberger)</div>
          <div className="col" style={{ gap: 8 }}>
            {[
              ['groq-whisper', 'Whisper large-v3 via Groq (recommandé)', 'Modèle open source, API hébergée gratuite : ≈ 2 000 transcriptions/jour, 99 langues, très pointu. Aucun VPS. Aucun téléchargement pour l’étudiant. ⚠ Groq refuse les appels venant d’un serveur : si le campus déployé le voit bloqué, le relais Gemini prend la main tout seul.'],
              ['gemini-audio', 'Gemini — transcription en ligne', 'Lit l’enregistrement et rend le texte, côté serveur : rien à télécharger pour l’étudiant. Utilise la clé Gemini, la même que l’assistant. Prend la main automatiquement quand Groq ne répond pas.'],
              ['browser-whisper', 'Whisper dans le navigateur (transformers.js)', '100 % open source, s’exécute sur l’appareil de l’étudiant : zéro quota, zéro serveur, zéro coût. Un peu plus lent. Le modèle se télécharge une seule fois (≈ 41 Mo). Sert AUSSI de repli si la ligne ne répond pas.'],
            ].map(([valeur, libelle, detail]) => (
              <label key={valeur} className="row small" style={{ gap: 9, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="transcr"
                  checked={config.transcription === valeur}
                  onChange={() => {
                    setConfig({ ...config, transcription: valeur });
                    void envoyer({ action: 'config', transcription: valeur }, 'Moteur de transcription enregistré.');
                  }}
                />
                <span>
                  <b>{libelle}</b>
                  <div className="xs muted">{detail}</div>
                </span>
              </label>
            ))}
          </div>
          {!moteurs.some((moteur) => (moteur.provider === 'groq' || moteur.provider === 'gemini') && moteur.cle) && (
            <p className="xs muted mt8">
              Aucune clé de transcription en ligne n’est posée : l’étudiant dictera sur son appareil, et
              l’enregistrement ne quittera jamais son téléphone. Aucun étudiant n’est jamais bloqué.
            </p>
          )}
          {moteurs.filter((moteur) => (moteur.provider === 'groq' || moteur.provider === 'gemini') && moteur.cle).length >=
            2 && (
            <p className="xs muted mt8">
              Les deux moteurs en ligne sont branchés : <b>Groq</b> est essayé en premier, <b>Gemini</b> prend la main
              s’il ne répond pas (Groq refuse parfois les appels venant d’un serveur). L’étudiant n’a rien à faire.
            </p>
          )}
        </div>

        <div className="col" style={{ gap: 16 }}>
          <div className="card card-pad">
            <div className="eyebrow mb8">Identité affichée dans le Campus</div>
            <div className="field">
              <label>Nom de l’assistant</label>
              <input
                className="inp"
                value={config.displayName}
                placeholder={config.defaultName}
                onChange={(evenement) => setConfig({ ...config, displayName: evenement.target.value })}
                onBlur={() => void envoyer({ action: 'config', displayName: config.displayName }, 'Nom enregistré.')}
              />
              <div className="hint">
                Par défaut, le nom fourni par le système IA est utilisé. Si vous définissez un nom
                personnalisé, il devient le nom affiché partout dans le Campus.
              </div>
            </div>

            <div className="field">
              <label>Langue de réponse</label>
              <select
                className="inp"
                value={config.lang}
                onChange={(evenement) => {
                  setConfig({ ...config, lang: evenement.target.value });
                  void envoyer({ action: 'config', lang: evenement.target.value }, 'Langue enregistrée.');
                }}
              >
                {[
                  ['fr', 'Français'],
                  ['en', 'English'],
                  ['es', 'Español'],
                  ['pt', 'Português'],
                ].map(([valeur, libelle]) => (
                  <option key={valeur} value={valeur}>
                    {libelle}
                  </option>
                ))}
              </select>
              <div className="hint">L’assistant reçoit aussi le nom de chaque étudiant.</div>
            </div>

            <div className="field">
              <label>Température (créativité) — {config.temperature}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.temperature}
                style={{ width: '100%', accentColor: 'var(--violet)' }}
                onChange={(evenement) => setConfig({ ...config, temperature: Number(evenement.target.value) })}
                onMouseUp={() => void envoyer({ action: 'config', temperature: config.temperature }, 'Créativité enregistrée.')}
                onTouchEnd={() => void envoyer({ action: 'config', temperature: config.temperature }, 'Créativité enregistrée.')}
              />
            </div>

            <div className="field">
              <label>Questions par étudiant et par jour — {config.studentDailyCap}</label>
              <input
                className="inp"
                type="number"
                min={1}
                max={500}
                value={config.studentDailyCap}
                onChange={(evenement) => setConfig({ ...config, studentDailyCap: Number(evenement.target.value) })}
                onBlur={() => void envoyer({ action: 'config', studentDailyCap: config.studentDailyCap }, 'Plafond enregistré.')}
              />
              <div className="hint">
                C’est ce plafond qui protège les quotas gratuits : il garantit que la facture reste à zéro
                tant que la charge reste dans les paliers gratuits.
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="eyebrow mb8">Base de connaissances</div>
            <p className="xs muted mb8">
              Associez l’assistant aux contenus de chaque formation. Les connaissances restent <b>séparées
              par formation</b> — aucun mélange entre elles.
            </p>
            {associations.length === 0 && <div className="xs muted">Aucune formation pour l’instant.</div>}
            {associations.map((formation) => (
              <div key={formation.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="small">
                  <b>{formation.titre}</b>
                </span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={formation.associee}
                    disabled={enCours}
                    onChange={(evenement) => {
                      const associee = evenement.target.checked;
                      setAssociations((liste) => liste.map((f) => (f.id === formation.id ? { ...f, associee } : f)));
                      void envoyer(
                        { action: 'kb', formationId: formation.id, associee },
                        associee ? 'Formation associée à l’assistant.' : 'Formation dissociée.'
                      );
                    }}
                  />
                  <i></i>
                </label>
              </div>
            ))}
          </div>

          <div className="card card-pad" style={{ background: 'var(--grad-dark)', border: 'none', color: '#fff' }}>
            <div className="eyebrow" style={{ color: 'var(--gold2)' }}>
              Supervision humaine
            </div>
            <p className="small mt8" style={{ color: '#D9D3E8' }}>
              L’assistant répond en premier niveau. Les coachs voient toutes les conversations et peuvent
              valider, corriger ou répondre à la place de l’IA — sans jamais être bloqués par elle.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
