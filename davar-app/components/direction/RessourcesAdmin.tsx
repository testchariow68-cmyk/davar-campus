'use client';

import { useState } from 'react';
import { Icon } from '@/components/campus/Icon';

export type RessourceAdmin = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  formationTitre: string | null;
  fileKey: string | null;
  pages: number;
  pistes: number;
  attribueeA: string[];
  publiee: boolean;
};

/**
 * RESSOURCES — livres, audios, documents.
 *
 * Le fichier ne traverse JAMAIS l'application : le serveur signe une adresse de
 * dépôt valable quinze minutes, et le navigateur envoie le fichier directement
 * au stockage. Les plafonds du propriétaire (10 Mo document / 20 Mo audio /
 * 128 Mo vidéo) sont vérifiés côté serveur, avant la signature.
 */
export function RessourcesAdmin({
  initiales,
  formations,
  plafonds,
  stockagePret,
}: {
  initiales: RessourceAdmin[];
  formations: Array<{ id: string; titre: string }>;
  plafonds: { document: string; audio: string; video: string };
  stockagePret: boolean;
}) {
  const [ressources, setRessources] = useState(initiales);
  const [note, setNote] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [nouvelle, setNouvelle] = useState({ kind: 'book', title: '', description: '', formationId: '' });
  const [pageTexte, setPageTexte] = useState<Record<string, { title: string; body: string }>>({});
  const [pisteTitre, setPisteTitre] = useState<Record<string, string>>({});
  const [courriel, setCourriel] = useState<Record<string, string>>({});
  const [progression, setProgression] = useState<Record<string, number>>({});

  type ReponseApi = { ok?: boolean; message?: string; id?: string; error?: string; url?: string; cle?: string };

  async function appeler(corps: Record<string, unknown>): Promise<ReponseApi> {
    const reponse = await fetch('/api/direction/ressource', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    return (await reponse.json().catch(() => ({}))) as ReponseApi;
  }

  async function creer() {
    if (nouvelle.title.trim().length < 2) {
      setNote('Donnez un titre à la ressource.');
      return;
    }
    setEnCours('creer');
    const donnees = await appeler({ action: 'creer', ...nouvelle });
    if (donnees.ok) {
      setRessources((liste) => [
        ...liste,
        {
          id: donnees.id ?? '',
          kind: nouvelle.kind,
          title: nouvelle.title,
          description: nouvelle.description || null,
          formationTitre: formations.find((formation) => formation.id === nouvelle.formationId)?.titre ?? null,
          fileKey: null,
          pages: 0,
          pistes: 0,
          attribueeA: [],
          publiee: true,
        },
      ]);
      setNouvelle({ kind: nouvelle.kind, title: '', description: '', formationId: '' });
    }
    setNote(donnees.message ?? "La création n'a pas abouti.");
    setEnCours(null);
  }

  function cleDe(ressource: RessourceAdmin, fichier: File): string {
    const extension = (fichier.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';
    const titre = ressource.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    return `ressources/${ressource.id}/${titre}-${Date.now().toString(36)}.${extension}`;
  }

  /** Dépôt en trois temps : signature → envoi direct au stockage → confirmation. */
  async function deposer(ressource: RessourceAdmin, fichier: File, pisteId?: string, kindPiste?: string) {
    const genre = kindPiste ?? (ressource.kind === 'audio' ? 'audio' : ressource.kind === 'book' ? 'document' : 'document');
    setEnCours(ressource.id);
    setNote(null);
    try {
      const cle = cleDe(ressource, fichier);
      const signature = await appeler({ action: 'depot', kind: genre, octets: fichier.size, cle });
      if (!signature.ok || !signature.url) {
        setNote(signature.message ?? 'Le dépôt n’a pas pu être préparé.');
        setEnCours(null);
        return;
      }
      const envoi = await fetch(signature.url, { method: 'PUT', body: fichier });
      if (!envoi.ok) {
        setNote(`L’envoi a échoué (HTTP ${envoi.status}).`);
        setEnCours(null);
        return;
      }
      const confirmation = await appeler({
        action: 'confirmer',
        resourceId: ressource.id,
        pisteId: pisteId ?? null,
        cle: signature.cle ?? cle,
      });
      setNote(confirmation.message ?? 'Fichier déposé.');
      if (confirmation.ok) {
        setRessources((liste) =>
          liste.map((element) =>
            element.id === ressource.id
              ? { ...element, fileKey: pisteId ? element.fileKey : (signature.cle ?? cle), pistes: pisteId ? element.pistes + 0 : element.pistes }
              : element
          )
        );
      }
    } catch {
      setNote('Le réseau n’a pas répondu pendant l’envoi.');
    }
    setEnCours(null);
  }

  async function envoyer(corps: Record<string, unknown>, message: string, apres?: () => void) {
    setEnCours('action');
    const donnees = await appeler(corps);
    setNote(donnees.message ?? message);
    if (donnees.ok) apres?.();
    setEnCours(null);
  }

  return (
    <>
      {!stockagePret && (
        <div className="banner err mb16">
          <Icon nom="alert" taille={14} />
          <span className="small">
            Le <b>stockage des fichiers n’est pas encore relié</b>. Vous pouvez créer vos livres et vos audios, écrire
            leurs pages et leurs pistes — mais le dépôt des fichiers attendra les clés R2 côté serveur.
          </span>
        </div>
      )}
      {note && (
        <div className="banner info mb16">
          <Icon nom="checkCircle" taille={14} />
          <span>{note}</span>
        </div>
      )}

      <div className="card card-pad mb16">
        <h3 className="mb8">Nouvelle ressource</h3>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr 1.4fr 1fr', gap: 10 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Type</label>
            <select className="inp" value={nouvelle.kind} onChange={(evenement) => setNouvelle({ ...nouvelle, kind: evenement.target.value })}>
              <option value="book">Livre</option>
              <option value="audio">Audio</option>
              <option value="file">Document</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Titre</label>
            <input className="inp" value={nouvelle.title} onChange={(evenement) => setNouvelle({ ...nouvelle, title: evenement.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Formation (facultatif)</label>
            <select className="inp" value={nouvelle.formationId} onChange={(evenement) => setNouvelle({ ...nouvelle, formationId: evenement.target.value })}>
              <option value="">Tous les étudiants</option>
              {formations.map((formation) => (
                <option key={formation.id} value={formation.id}>
                  {formation.titre}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>&nbsp;</label>
            <button className="btn btn-primary" disabled={enCours === 'creer'} onClick={() => void creer()}>
              <Icon nom="plus" taille={14} /> Créer
            </button>
          </div>
        </div>
        <div className="field">
          <label>Description (facultatif)</label>
          <input className="inp" value={nouvelle.description} onChange={(evenement) => setNouvelle({ ...nouvelle, description: evenement.target.value })} />
        </div>
        <p className="xs faint">
          Plafonds en vigueur, écrits dans vos documents : document <b>{plafonds.document}</b>, audio{' '}
          <b>{plafonds.audio}</b>, vidéo <b>{plafonds.video}</b>. Ils ne changent que sur votre validation.
        </p>
      </div>

      {ressources.length === 0 && <div className="xs muted">Aucune ressource pour l’instant.</div>}

      <div className="col" style={{ gap: 10 }}>
        {ressources.map((ressource) => (
          <div className="card card-pad" key={ressource.id}>
            <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Icon nom={ressource.kind === 'book' ? 'book' : ressource.kind === 'audio' ? 'headset' : 'doc'} taille={16} />
                <b>{ressource.title}</b>
                <span className="badge b-grey">{ressource.kind === 'book' ? 'livre' : ressource.kind === 'audio' ? 'audio' : 'document'}</span>
                {ressource.formationTitre && <span className="badge b-violet">{ressource.formationTitre}</span>}
                {!ressource.publiee && <span className="badge b-red">retirée</span>}
              </span>
              <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {progression[ressource.id] !== undefined && <span className="xs muted">{progression[ressource.id]} %</span>}
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={enCours === 'action'}
                  onClick={() =>
                    void envoyer({ action: 'publier', resourceId: ressource.id, publiee: !ressource.publiee }, '', () =>
                      setRessources((liste) => liste.map((element) => (element.id === ressource.id ? { ...element, publiee: !element.publiee } : element)))
                    )
                  }
                >
                  {ressource.publiee ? 'Retirer' : 'Publier'}
                </button>
              </span>
            </div>

            {ressource.description && <p className="small muted mt8">{ressource.description}</p>}

            {/* ── Livre : les pages s'écrivent ici, une par une ── */}
            {ressource.kind === 'book' && (
              <div className="mt16">
                <div className="xs muted mb8">{ressource.pages} page(s) écrite(s).</div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Titre de la page (facultatif)</label>
                  <input
                    className="inp"
                    value={pageTexte[ressource.id]?.title ?? ''}
                    onChange={(evenement) =>
                      setPageTexte((actuel) => ({ ...actuel, [ressource.id]: { title: evenement.target.value, body: actuel[ressource.id]?.body ?? '' } }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Texte de la page</label>
                  <textarea
                    className="inp"
                    rows={4}
                    value={pageTexte[ressource.id]?.body ?? ''}
                    onChange={(evenement) =>
                      setPageTexte((actuel) => ({ ...actuel, [ressource.id]: { title: actuel[ressource.id]?.title ?? '', body: evenement.target.value } }))
                    }
                  />
                </div>
                <button
                  className="btn btn-sm"
                  disabled={enCours === 'action' || (pageTexte[ressource.id]?.body ?? '').trim().length < 10}
                  onClick={() =>
                    void envoyer({ action: 'page', resourceId: ressource.id, title: pageTexte[ressource.id]?.title ?? '', body: pageTexte[ressource.id]?.body ?? '' }, '', () => {
                      setPageTexte((actuel) => ({ ...actuel, [ressource.id]: { title: '', body: '' } }));
                      setRessources((liste) => liste.map((element) => (element.id === ressource.id ? { ...element, pages: element.pages + 1 } : element)));
                    })
                  }
                >
                  <Icon nom="plus" taille={14} /> Ajouter la page
                </button>
                <div className="mt8">
                  <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
                    <Icon nom="upload" taille={14} /> Ou déposer le livre en PDF ({plafonds.document} max)
                    <input
                      type="file"
                      accept="application/pdf"
                      style={{ display: 'none' }}
                      onChange={(evenement) => {
                        const fichier = evenement.target.files?.[0];
                        if (fichier) {
                          setProgression((actuel) => ({ ...actuel, [ressource.id]: 0 }));
                          void deposer(ressource, fichier, undefined, 'document');
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* ── Audio : les pistes, puis leurs fichiers ── */}
            {ressource.kind === 'audio' && (
              <div className="mt16">
                <div className="xs muted mb8">{ressource.pistes} piste(s).</div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <input
                    className="inp"
                    style={{ maxWidth: 320 }}
                    placeholder="Titre de la piste"
                    value={pisteTitre[ressource.id] ?? ''}
                    onChange={(evenement) => setPisteTitre((actuel) => ({ ...actuel, [ressource.id]: evenement.target.value }))}
                  />
                  <button
                    className="btn btn-sm"
                    disabled={enCours === 'action'}
                    onClick={() =>
                      void envoyer({ action: 'piste', resourceId: ressource.id, title: pisteTitre[ressource.id] ?? '' }, '', () => {
                        setPisteTitre((actuel) => ({ ...actuel, [ressource.id]: '' }));
                        setRessources((liste) => liste.map((element) => (element.id === ressource.id ? { ...element, pistes: element.pistes + 1 } : element)));
                      })
                    }
                  >
                    <Icon nom="plus" taille={14} /> Ajouter la piste
                  </button>
                </div>
                <p className="xs faint mt8">
                  Déposez ensuite chaque fichier audio depuis la vue de la piste (après enregistrement, rechargez cette
                  page pour voir les pistes).
                </p>
              </div>
            )}

            {/* ── Document : un fichier, c'est tout ── */}
            {ressource.kind === 'file' && (
              <div className="mt16">
                <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
                  <Icon nom="upload" taille={14} /> {ressource.fileKey ? 'Remplacer le fichier' : 'Déposer le fichier'} ({plafonds.document} max)
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(evenement) => {
                      const fichier = evenement.target.files?.[0];
                      if (fichier) void deposer(ressource, fichier, undefined, 'document');
                    }}
                  />
                </label>
                {ressource.fileKey && <div className="xs muted mt4">Fichier en place.</div>}
              </div>
            )}

            {/* ── Attribution nominative ── */}
            <div className="mt16" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <div className="xs muted mb8">
                {ressource.attribueeA.length === 0
                  ? 'Offerte à tous les étudiants de la formation.'
                  : `Réservée à : ${ressource.attribueeA.join(', ')}`}
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="inp"
                  style={{ maxWidth: 280 }}
                  placeholder="adresse e-mail de l’étudiant"
                  value={courriel[ressource.id] ?? ''}
                  onChange={(evenement) => setCourriel((actuel) => ({ ...actuel, [ressource.id]: evenement.target.value }))}
                />
                <button
                  className="btn btn-sm"
                  disabled={enCours === 'action'}
                  onClick={() =>
                    void envoyer({ action: 'attribuer', resourceId: ressource.id, email: courriel[ressource.id] ?? '' }, '', () => {
                      setRessources((liste) =>
                        liste.map((element) =>
                          element.id === ressource.id ? { ...element, attribueeA: [...element.attribueeA, courriel[ressource.id] ?? ''] } : element
                        )
                      );
                      setCourriel((actuel) => ({ ...actuel, [ressource.id]: '' }));
                    })
                  }
                >
                  Attribuer
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={enCours === 'action'}
                  onClick={() =>
                    void envoyer({ action: 'retirer', resourceId: ressource.id, email: courriel[ressource.id] ?? '' }, '', () => {
                      setRessources((liste) =>
                        liste.map((element) =>
                          element.id === ressource.id
                            ? { ...element, attribueeA: element.attribueeA.filter((adresse) => adresse !== (courriel[ressource.id] ?? '')) }
                            : element
                        )
                      );
                    })
                  }
                >
                  Retirer
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
