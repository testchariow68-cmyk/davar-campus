'use client';

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AssistantPanel } from './AssistantPanel';
import { Emoji } from './Emoji';
import { Icon } from './Icon';
import { VisionneuseFichier } from './VisionneuseFichier';
import type { Chapitre, Lesson, RessourceCours } from '@/lib/server/campus';
import type { CommentaireCours, SocialCours } from '@/lib/server/social';

/** Formats d'image du lecteur, tels que le prototype les nomme. */
const RATIO_CLS: Record<string, string> = { '16:9': 'r-169', '9:16': 'r-916', '4:3': 'r-43', '1:1': 'r-11' };
const RATIOS = ['16:9', '9:16', '4:3', '1:1'];
const EMOJIS = ['👍', '❤️', '🔥', '👏', '😂', '🤩'] as const;

const LIBELLE_TYPE: Record<RessourceCours['type'], string> = {
  video: 'VIDEO',
  pdf: 'PDF',
  doc: 'DOC',
  audio: 'AUDIO',
  image: 'IMG',
  autre: 'AUTRE',
};

/** Icône d'une ressource, selon la logique exacte du prototype. */
function iconeDe(type: RessourceCours['type']): 'eye' | 'file' | 'download' {
  if (type === 'image') return 'eye';
  if (type === 'doc') return 'file';
  return 'download';
}

/** YouTube ou fichier direct : on joue ce qui est réellement là. */
function idYouTube(url: string): string | null {
  const trouve = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return trouve ? trouve[1] : null;
}

function secondesDuree(duree: string | null): number {
  if (!duree) return 0;
  const morceaux = duree.split(':').map(Number);
  if (morceaux.length === 2 && morceaux.every(Number.isFinite)) return Math.max(1, morceaux[0] * 60 + morceaux[1]);
  const minutes = Number.parseFloat(duree.replace(',', '.'));
  return Number.isFinite(minutes) ? Math.max(1, Math.round(minutes * 60)) : 0;
}

function formatSecondes(secondes: number): string {
  const minutes = Math.floor(secondes / 60);
  const reste = Math.floor(secondes % 60);
  return `${minutes}:${String(reste).padStart(2, '0')}`;
}

function tempsRelatif(atMs: number): string {
  const difference = Math.max(0, Date.now() - atMs);
  const minutes = Math.floor(difference / 60000);
  const heures = Math.floor(difference / 3600000);
  const jours = Math.floor(difference / 86400000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (heures < 24) return `il y a ${heures} h`;
  if (jours === 1) return 'hier';
  if (jours < 30) return `il y a ${jours} j`;
  return new Date(atMs).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * LE LECTEUR — la vidéo principale du cours, ou la vidéo complémentaire choisie.
 * Quand aucune adresse n'est publiée, le prototype montre un « visage » de
 * lecture ; la production le montre avec le même texte, sans inventer une vidéo.
 */
function Lecteur({
  utilisateurId,
  lessonId,
  url,
  ratio,
  titre,
  duree,
  alternative,
  onVisionnageTermine,
}: {
  utilisateurId: string;
  lessonId: string;
  url: string | null;
  ratio: string;
  titre: string;
  duree: string | null;
  alternative: boolean;
  onVisionnageTermine: () => void;
}) {
  const classe = RATIO_CLS[ratio] ?? 'r-169';
  const youtube = url ? idYouTube(url) : null;
  const video = useRef<HTMLVideoElement | null>(null);
  const maximumVu = useRef(0);
  const dernierStockage = useRef(0);
  const cleMemoire = `davar-cours-video-max:${encodeURIComponent(utilisateurId)}:${encodeURIComponent(lessonId)}`;

  useEffect(() => {
    maximumVu.current = 0;
    dernierStockage.current = 0;
    if (alternative || !url || typeof window === 'undefined') return;
    try {
      const memorise = Number(window.localStorage.getItem(cleMemoire));
      if (Number.isFinite(memorise) && memorise > 0) maximumVu.current = memorise;
    } catch {
      // La progression reste fiable pendant cette session si le stockage est bloqué.
    }
  }, [alternative, cleMemoire, url]);

  function sauter(secondes: number) {
    const element = video.current;
    if (!element || alternative) return;
    const position = Math.min(element.currentTime, maximumVu.current);
    const cible = Math.max(0, Math.min(element.duration || Number.MAX_SAFE_INTEGER, position + secondes));
    element.currentTime = Math.min(cible, maximumVu.current);
  }

  function surDoubleClic(event: React.MouseEvent<HTMLDivElement>) {
    if (!url || youtube || alternative) return;
    event.preventDefault();
    const rectangle = event.currentTarget.getBoundingClientRect();
    sauter(event.clientX - rectangle.left <= rectangle.width / 2 ? -5 : 5);
  }

  return (
    <div className="player-stage">
      <div className={`player-box ${classe}`} onDoubleClick={surDoubleClic}>
        {youtube ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtube}`}
            title={titre}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        ) : url ? (
          /* eslint-disable-next-line jsx-a11y/media-has-caption */
          <video
            ref={video}
            src={url}
            controls
            controlsList="nodownload"
            onLoadedMetadata={(event) => {
              const element = event.currentTarget;
              if (alternative) return;
              const memorise = Math.min(
                Number.isFinite(element.duration) ? element.duration : Number.MAX_SAFE_INTEGER,
                maximumVu.current
              );
              maximumVu.current = Math.max(0, memorise);
              if (maximumVu.current > 0 && maximumVu.current < element.duration) {
                element.currentTime = maximumVu.current;
              }
            }}
            onTimeUpdate={(event) => {
              if (alternative) return;
              const element = event.currentTarget;
              const suivant = Math.max(maximumVu.current, element.currentTime);
              if (suivant <= maximumVu.current) return;
              maximumVu.current = suivant;
              if (suivant - dernierStockage.current >= 1) {
                dernierStockage.current = suivant;
                try {
                  window.localStorage.setItem(cleMemoire, String(suivant));
                } catch {
                  // La progression de la session reste disponible en mémoire.
                }
              }
            }}
            onSeeking={(event) => {
              if (alternative) return;
              const element = event.currentTarget;
              if (element.currentTime > maximumVu.current + 0.05) element.currentTime = maximumVu.current;
            }}
            onEnded={(event) => {
              if (alternative) return;
              const dureeReelle = event.currentTarget.duration;
              maximumVu.current = Number.isFinite(dureeReelle) ? dureeReelle : maximumVu.current;
              try {
                window.localStorage.setItem(cleMemoire, String(maximumVu.current));
              } catch {
                // Rien à faire : le bouton est tout de même activé pour la session.
              }
              onVisionnageTermine();
            }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#000' }}
          />
        ) : (
          <div className="player-face">
            <span className="ratio-tag">{ratio}</span>
            <span className="play-btn">
              <Icon nom="play" taille={22} />
            </span>
            <div className="small" style={{ opacity: 0.85 }}>
              {titre}
            </div>
            <div className="xs" style={{ opacity: 0.55 }}>
              {alternative ? 'Vidéo complémentaire · lecture simulée — hors progression' : `${duree ?? 'Durée non renseignée'} · lecture simulée`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type PleinEcranElement = HTMLElement & {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => void;
};

type PleinEcranDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

function repliPleinEcran(actif: boolean) {
  const stage = document.querySelector('.player-stage') as HTMLElement | null;
  if (!stage) return;
  stage.classList.toggle('fs-css', actif);
  const sortie = stage.querySelector<HTMLButtonElement>('.fs-exit');
  if (actif && !sortie) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'fs-exit';
    bouton.title = 'Quitter le plein écran';
    bouton.setAttribute('aria-label', 'Quitter le plein écran');
    bouton.textContent = '×';
    bouton.addEventListener('click', () => repliPleinEcran(false), { once: true });
    stage.appendChild(bouton);
    document.addEventListener('keydown', echapperPleinEcran);
  } else if (!actif) {
    sortie?.remove();
    document.removeEventListener('keydown', echapperPleinEcran);
  }
}

function echapperPleinEcran(event: KeyboardEvent) {
  if (event.key === 'Escape') repliPleinEcran(false);
}

function pleinEcran() {
  const stage = document.querySelector('.player-stage') as HTMLElement | null;
  const element = stage?.querySelector('.player-box') as PleinEcranElement | null;
  if (!stage || !element) return;
  const doc = document as PleinEcranDocument;
  if (document.fullscreenElement || doc.webkitFullscreenElement) {
    (document.exitFullscreen ?? doc.webkitExitFullscreen)?.call(document);
    return;
  }
  if (stage.classList.contains('fs-css')) {
    repliPleinEcran(false);
    return;
  }

  const demande = element.requestFullscreen ?? element.webkitRequestFullscreen;
  if (!demande) {
    repliPleinEcran(true);
    return;
  }
  try {
    const resultat = demande.call(element);
    if (resultat && typeof resultat.catch === 'function') {
      resultat.catch(() => repliPleinEcran(true));
    } else {
      window.setTimeout(() => {
        const doc = document as PleinEcranDocument;
        if (!document.fullscreenElement && !doc.webkitFullscreenElement) repliPleinEcran(true);
      }, 300);
    }
  } catch {
    repliPleinEcran(true);
  }
}

/** Contrôles visibles sous le lecteur, conservés même quand la vidéo est simulée. */
function PlayerUI({
  url,
  titre,
  duree,
  alternative,
  onTermine,
}: {
  url: string | null;
  titre: string;
  duree: string | null;
  alternative: boolean;
  onTermine: () => void;
}) {
  const total = secondesDuree(duree);
  const [pourcent, setPourcent] = useState(0);
  const [maximumPourcent, setMaximumPourcent] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [vitesse, setVitesse] = useState(1);
  const [audio, setAudio] = useState<'fr' | 'en'>('fr');
  const [reglages, setReglages] = useState(false);
  const finEnvoyee = useRef(false);

  useEffect(() => {
    if (!lecture || url) return undefined;
    const timer = window.setInterval(() => {
      setPourcent((actuel) => {
        const suivant = Math.min(100, actuel + 1.6 * vitesse);
        setMaximumPourcent((maximum) => Math.max(maximum, suivant));
        if (suivant >= 100) {
          window.clearInterval(timer);
          setLecture(false);
          if (!alternative && !finEnvoyee.current) {
            finEnvoyee.current = true;
            onTermine();
          }
        }
        return suivant;
      });
    }, 140);
    return () => window.clearInterval(timer);
  }, [alternative, lecture, onTermine, url, vitesse]);

  useEffect(() => {
    setPourcent(0);
    setMaximumPourcent(0);
    setLecture(false);
    finEnvoyee.current = false;
  }, [titre]);

  const simulable = !url;
  const temps = total > 0 ? (pourcent / 100) * total : 0;
  return (
    <div
      className="player-ui"
      onDoubleClick={(event) => {
        if (!simulable || alternative) return;
        const rectangle = event.currentTarget.getBoundingClientRect();
        const delta = event.clientX - rectangle.left <= rectangle.width / 2 ? -5 : 5;
        setPourcent((actuel) => Math.max(0, Math.min(maximumPourcent, actuel + delta)));
      }}
    >
      {simulable && !alternative ? (
        <button
          className="p-seek"
          aria-label="Avancer dans la vidéo"
          onClick={(event) => {
            const rectangle = event.currentTarget.getBoundingClientRect();
            const demandee = ((event.clientX - rectangle.left) / rectangle.width) * 100;
            setPourcent(Math.max(0, Math.min(maximumPourcent, demandee)));
          }}
        >
          <i style={{ width: `${pourcent}%` }} />
        </button>
      ) : null}
      <div className="p-row">
        {simulable && !alternative ? (
          <button
            className="icon-btn"
            style={{ color: '#fff', width: 28, height: 28 }}
            aria-label={lecture ? 'Mettre en pause' : 'Lire'}
            onClick={() => {
              if (pourcent >= 100) setPourcent(0);
              setLecture((actuel) => !actuel);
            }}
          >
            <Icon nom={lecture ? 'pause' : 'play'} taille={15} />
          </button>
        ) : null}
        {(!url || alternative) && (
          <span className="t">
            {alternative ? `${titre} · hors progression` : `${formatSecondes(temps)} / ${duree ?? '—'}`}
          </span>
        )}
        <span className="p-tools">
          <button className="fs-btn" onClick={() => setReglages((ouvert) => !ouvert)} title="Réglages de lecture" aria-label="Réglages de lecture">
            <Icon nom="settings" taille={14} />
            {vitesse !== 1 && <em>{vitesse}×</em>}
          </button>
          {!url && (
            <button className="fs-btn" onClick={pleinEcran} title="Plein écran" aria-label="Plein écran">
              <Icon nom="expand" taille={14} />
            </button>
          )}
        </span>
      </div>
      {reglages && (
        <div className="p-sheet">
          <div>
            <span className="ps-lb">Vitesse de lecture</span>
            <div className="ps-chips">
              {[0.75, 1, 1.25, 1.5, 2].map((valeur) => (
                <button key={valeur} className={`ps-chip ${vitesse === valeur ? 'on' : ''}`} onClick={() => setVitesse(valeur)}>
                  {valeur === 1 ? 'Normale' : `${valeur}×`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="ps-lb">Audio</span>
            <div className="ps-chips">
              <button className={`ps-chip ${audio === 'fr' ? 'on' : ''}`} onClick={() => setAudio('fr')}>Français · original</button>
              <button className={`ps-chip ${audio === 'en' ? 'on' : ''}`} onClick={() => setAudio('en')}>English · doublée</button>
            </div>
            <div className="ps-note">Doublage activé vidéo par vidéo dès qu’une piste doublée est déposée .</div>
          </div>
        </div>
      )}
    </div>
  );
}

function commentaireEnfants(commentaire: CommentaireCours, tous: CommentaireCours[]): CommentaireCours[] {
  return tous.filter((element) => element.parentId === commentaire.id).sort((a, b) => a.atMs - b.atMs);
}

/**
 * LE COURS — le lecteur et sa carte sociale restent dans une seule grille :
 * Leçon/Commentaires, réactions partagées, programme et états verrouillés.
 */
export function CoursDetail({
  lesson,
  utilisateurId,
  formationId,
  formationTitre,
  formationHref,
  chapitres,
  moduleId,
  moduleTitre,
  chapitreTitre,
  rangChapitre,
  progressionPct,
  modulesTermines,
  totalModules,
  suivant,
  chapitreSuivant,
  retourHref,
  social,
  apercu = false,
  assistantNom,
  assistantHue,
}: {
  lesson: Lesson;
  utilisateurId: string;
  formationId: string;
  formationTitre: string;
  formationHref: string;
  chapitres: Chapitre[];
  moduleId: string;
  moduleTitre: string;
  chapitreTitre: string;
  rangChapitre: number;
  progressionPct: number;
  modulesTermines: number;
  totalModules: number;
  suivant: { titre: string; href: string } | null;
  chapitreSuivant: { titre: string; href: string } | null;
  retourHref: string;
  social: SocialCours | null;
  apercu?: boolean;
  assistantNom: string;
  assistantHue: number;
}) {
  const router = useRouter();
  const [illustration, setIllustration] = useState<number | null>(null);
  const [videoRessource, setVideoRessource] = useState<RessourceCours | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [visionneuse, setVisionneuse] = useState<RessourceCours | null>(null);
  const [onglet, setOnglet] = useState<'lesson' | 'comments'>('lesson');
  const [socialEtat, setSocialEtat] = useState<SocialCours | null>(social);
  const [socialOccupe, setSocialOccupe] = useState<string | null>(null);
  const [socialErreur, setSocialErreur] = useState<string | null>(null);
  const [texteCommentaire, setTexteCommentaire] = useState('');
  const [texteReponse, setTexteReponse] = useState('');
  const [repondA, setRepondA] = useState<string | null>(null);
  const [afficherTout, setAfficherTout] = useState(false);
  const [programmeOuvert, setProgrammeOuvert] = useState(false);
  const [visionnageTermine, setVisionnageTermine] = useState(false);

  const illustrations = lesson.assets.filter((asset) => asset.kind === 'illustration');
  const ressources = lesson.assets.filter((asset) => asset.kind === 'ressource');
  const ratioPrincipal = lesson.ratio && RATIOS.includes(lesson.ratio) ? lesson.ratio : '16:9';
  const alternative = videoRessource ?? (illustration === null ? null : illustrations[illustration] ?? null);
  const ratioActuel = alternative?.ratio && RATIOS.includes(alternative.ratio) ? alternative.ratio : alternative ? '16:9' : ratioPrincipal;
  const classeFormat = ratioActuel === '9:16' ? 'fit-916' : ratioActuel === '1:1' ? 'fit-11' : ratioActuel === '4:3' ? 'fit-43' : '';
  const dureePrincipale = lesson.durationMin ? `${lesson.durationMin} min` : null;
  const commentaires = socialEtat?.commentaires ?? [];
  const racines = commentaires.filter((commentaire) => !commentaire.parentId).sort((a, b) => b.atMs - a.atMs);
  const commentairesVisibles = afficherTout ? racines : racines.slice(0, 3);
  const reactions = socialEtat?.reactions ?? EMOJIS.map((emoji) => ({ emoji, total: 0, parMoi: false }));
  const totalReactions = socialEtat?.totalReactions ?? reactions.reduce((total, reaction) => total + reaction.total, 0);
  const pourcentage = Math.max(0, Math.min(100, Math.round(progressionPct)));
  const coursNecessiteVisionnage = lesson.kind === 'video' || Boolean(lesson.resourceUrl);
  const coursVisionnable = Boolean(lesson.resourceUrl);
  const peutMarquer = !coursNecessiteVisionnage || (coursVisionnable && visionnageTermine);

  useEffect(() => {
    setSocialEtat(social);
    setOnglet('lesson');
    setIllustration(null);
    setVideoRessource(null);
    setAfficherTout(false);
    setProgrammeOuvert(false);
    setRepondA(null);
    setVisionnageTermine(false);
  }, [lesson.id, social]);

  useEffect(() => {
    setVisionnageTermine(false);
  }, [alternative?.id]);

  useEffect(() => {
    if (socialEtat || apercu) return undefined;
    const controller = new AbortController();
    void fetch(`/api/campus/social?lessonId=${encodeURIComponent(lesson.id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { social?: SocialCours };
      })
      .then((donnees) => {
        if (donnees?.social) setSocialEtat(donnees.social);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [apercu, lesson.id, socialEtat]);

  async function marquer() {
    setOccupe(true);
    setErreur(null);
    try {
      const reponse = await fetch('/api/campus/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, completed: !lesson.completed }),
      });
      if (!reponse.ok) {
        setErreur(reponse.status === 403 ? 'Cours hors de vos formations autorisées.' : 'Mise à jour impossible.');
        return;
      }
      if (lesson.completed) {
        router.refresh();
      } else if (suivant) {
        router.push(suivant.href);
      } else if (chapitreSuivant) {
        router.push(chapitreSuivant.href);
      } else {
        router.refresh();
      }
    } catch {
      setErreur('Mise à jour impossible.');
    } finally {
      setOccupe(false);
    }
  }

  async function publierSocial(body: Record<string, unknown>, cle: string) {
    if (apercu || socialOccupe) return;
    setSocialOccupe(cle);
    setSocialErreur(null);
    try {
      const reponse = await fetch('/api/campus/social', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { social?: SocialCours; error?: string };
      if (!reponse.ok || !donnees.social) {
        setSocialErreur(
          donnees.error === 'not_enrolled'
            ? 'Cette interaction est réservée aux étudiants inscrits à la formation.'
            : donnees.error === 'invalid_parent'
              ? 'Cette réponse n’est plus disponible.'
              : 'Publication impossible. Réessayez dans un instant.'
        );
        return;
      }
      setSocialEtat(donnees.social);
      if (cle === 'commentaire') setTexteCommentaire('');
      if (cle.startsWith('reponse-')) {
        setTexteReponse('');
        setRepondA(null);
      }
    } catch {
      setSocialErreur('Publication impossible. Réessayez dans un instant.');
    } finally {
      setSocialOccupe(null);
    }
  }

  function envoyerCommentaire(parentId: string | null) {
    const texte = (parentId ? texteReponse : texteCommentaire).trim();
    if (!texte) {
      setSocialErreur('Écrivez d’abord votre commentaire.');
      return;
    }
    void publierSocial(
      { action: 'commentaire', lessonId: lesson.id, text: texte, parentId },
      parentId ? `reponse-${parentId}` : 'commentaire'
    );
  }

  function hrefModule(chapitre: Chapitre, module: Chapitre['modules'][number], cours?: string) {
    const params = new URLSearchParams({ chapitre: chapitre.id, module: module.id });
    if (cours) params.set('cours', cours);
    return `${formationHref}?${params.toString()}`;
  }

  function afficherCommentaire(commentaire: CommentaireCours, profondeur = 0): JSX.Element {
    const reponses = commentaireEnfants(commentaire, commentaires);
    return (
      <div className={`cmt ${profondeur > 0 ? 'cmt-rep' : ''}`} key={commentaire.id}>
        <span className="cmt-ava" style={{ background: commentaire.couleur }}>{commentaire.initiales}</span>
        <div className="wrap">
          <div className="cmt-head">
            <b>{commentaire.auteur}</b>
            <time>{tempsRelatif(commentaire.atMs)}</time>
          </div>
          <div className="cmt-txt">{commentaire.texte}</div>
          {profondeur === 0 && !apercu && (
            <button
              className="xs link"
              onClick={() => {
                setRepondA(repondA === commentaire.id ? null : commentaire.id);
                setTexteReponse('');
              }}
            >
              Répondre
            </button>
          )}
          {repondA === commentaire.id && !apercu && (
            <div className="cmt-form mt8">
              <textarea
                className="inp"
                rows={1}
                maxLength={2000}
                placeholder={`Répondre à ${commentaire.auteur}…`}
                value={texteReponse}
                onChange={(event) => setTexteReponse(event.target.value)}
              />
              <button className="btn btn-primary btn-sm" disabled={socialOccupe === `reponse-${commentaire.id}`} onClick={() => envoyerCommentaire(commentaire.id)}>
                Répondre
              </button>
            </div>
          )}
          {reponses.map((reponse) => afficherCommentaire(reponse, profondeur + 1))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="breadcrumb">
        <Link href={formationHref}>{formationTitre}</Link>
        <Icon nom="chevR" taille={12} />
        <span>Chapitre {rangChapitre} — {chapitreTitre}</span>
      </div>

      <div className="mod-tabs">
        <button className={`mtab ${onglet === 'lesson' ? 'on' : ''}`} onClick={() => setOnglet('lesson')}>
          Leçon
        </button>
        <button className={`mtab ${onglet === 'comments' ? 'on' : ''}`} onClick={() => setOnglet('comments')}>
          Commentaires <span className="cnt">{socialEtat?.totalCommentaires ?? 0}</span>
        </button>
      </div>

      <div className={`mod-grid ${onglet === 'comments' ? 'tab-comments' : ''}`}>
        <div>
          <div className="pane pane-lesson" style={{ display: onglet === 'lesson' ? undefined : 'none' }}>
            <div className="course-program-mobile">
              <button
                className="course-program-toggle"
                type="button"
                aria-expanded={programmeOuvert}
                aria-controls="course-program-mobile-panel"
                onClick={() => setProgrammeOuvert((ouvert) => !ouvert)}
              >
                <span className="course-program-toggle-main">
                  <span className="course-program-toggle-icon"><Icon nom="layers" taille={15} /></span>
                  <span>
                    <b>Programme</b>
                    <small>{moduleTitre}</small>
                  </span>
                </span>
                <span className="course-program-toggle-meta">{totalModules} modules <Icon nom="chevD" taille={13} /></span>
              </button>
              {programmeOuvert && (
                <div className="course-program-panel" id="course-program-mobile-panel">
                  <div className="course-program-panel-head">Parcours de la formation</div>
                  <div className="course-program-scroll">
                    {chapitres.map((chapitre, indexChapitre) => (
                      <div key={chapitre.id}>
                        <div className="course-program-chapter">Chapitre {indexChapitre + 1} · {chapitre.title}</div>
                        {chapitre.modules.map((module) => {
                          const ouvert = chapitre.visible && module.ouvrable;
                          const courant = module.id === moduleId;
                          const href = hrefModule(chapitre, module, courant ? lesson.id : undefined);
                          return ouvert ? (
                            <Link className={`course-program-item ${courant ? 'current' : ''}`} href={href} key={module.id}>
                              <span className={`step-ico ${module.termine ? 's-done' : 's-cur'}`}><Icon nom={module.termine ? 'check' : 'play'} taille={11} /></span>
                              <span className="wrap"><b>{module.title}</b><small>{module.lessons.length} cours</small></span>
                              {courant ? <span className="badge b-violet">En cours</span> : module.termine ? <span className="xs faint">Terminé ✓</span> : null}
                            </Link>
                          ) : (
                            <div className="course-program-item locked" aria-disabled="true" key={module.id}>
                              <span className="step-ico s-lock"><Icon nom="lock" taille={11} /></span>
                              <span className="wrap"><b>{module.title}</b><small>Verrouillé</small></span>
                              <Icon nom="lock" taille={11} />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={`card course-player-card ${classeFormat}`} style={{ overflow: 'hidden' }}>
              <Lecteur
                key={`${lesson.id}-${alternative?.id ?? 'principal'}`}
                utilisateurId={utilisateurId}
                lessonId={lesson.id}
                url={alternative ? alternative.url : lesson.resourceUrl}
                ratio={ratioActuel}
                titre={alternative ? alternative.title : lesson.title}
                duree={alternative ? alternative.duration : dureePrincipale}
                alternative={alternative !== null}
                onVisionnageTermine={() => {
                  if (!alternative) setVisionnageTermine(true);
                }}
              />
              <PlayerUI
                url={alternative ? alternative.url : lesson.resourceUrl}
                titre={alternative ? alternative.title : lesson.title}
                duree={alternative ? alternative.duration : dureePrincipale}
                alternative={alternative !== null}
                onTermine={() => setVisionnageTermine(true)}
              />
              <div className="react-row" aria-label="Réactions au cours">
                {reactions.map((reaction) => (
                  <span className={`react-bub ${reaction.parMoi ? 'on' : ''}`} key={reaction.emoji}>
                    <button
                      className="react-main"
                      disabled={apercu || socialOccupe === `reaction-${reaction.emoji}`}
                      onClick={() => void publierSocial({ action: 'reaction', lessonId: lesson.id, emoji: reaction.emoji }, `reaction-${reaction.emoji}`)}
                      title={reaction.parMoi ? 'Retirer ma réaction' : 'Réagir au cours'}
                      aria-label={reaction.parMoi ? `Retirer ${reaction.emoji}` : `Réagir avec ${reaction.emoji}`}
                    >
                      <Emoji value={reaction.emoji} label={reaction.emoji} />{reaction.total ? <b>{reaction.total}</b> : null}
                    </button>
                    <button
                      className="react-plus"
                      disabled={apercu || socialOccupe === `reaction-${reaction.emoji}`}
                      onClick={() => void publierSocial({ action: 'reaction', lessonId: lesson.id, emoji: reaction.emoji }, `reaction-${reaction.emoji}`)}
                      title={reaction.parMoi ? 'Retirer ma réaction' : 'Ajouter ma réaction'}
                      aria-label={reaction.parMoi ? 'Retirer ma réaction' : 'Ajouter ma réaction'}
                    >
                      {reaction.parMoi ? '−' : '+'}
                    </button>
                  </span>
                ))}
                {totalReactions > 0 && (
                  <span className="xs faint react-help">
                    {`${totalReactions} réaction${totalReactions > 1 ? 's' : ''} des étudiants`}
                  </span>
                )}
              </div>
              <div className="card-pad">
                <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div className="eyebrow">
                      {/chapitre\b/i.test(chapitreTitre.trim()) ? chapitreTitre : `Chapitre ${rangChapitre} — ${chapitreTitre}`}
                    </div>
                    <h2 style={{ fontSize: 18, marginTop: 3 }}>
                      {alternative ? alternative.title : lesson.title}
                      {alternative && <span className="badge b-grey" style={{ marginLeft: 8 }}>hors progression</span>}
                    </h2>
                  </div>
                  {alternative ? (
                    <span className="small muted">Revenez à la vidéo principale pour marquer le cours comme terminé.</span>
                  ) : lesson.completed ? (
                    <span className="badge b-green course-complete-status">
                      <Icon nom="check" taille={12} />
                      <span className="course-complete-label-full">Cours terminé ✓</span>
                      <span className="course-complete-label-short">Terminé ✓</span>
                    </span>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm course-complete-button"
                      disabled={occupe || !peutMarquer}
                      onClick={() => void marquer()}
                      title={
                        !peutMarquer
                          ? coursVisionnable
                            ? 'Terminez la lecture du cours pour activer ce bouton.'
                            : 'La vidéo principale n’est pas encore publiée.'
                          : undefined
                      }
                      aria-label={
                        peutMarquer
                          ? 'Marquer le cours comme terminé'
                          : coursVisionnable
                            ? 'Terminez la lecture du cours pour activer ce bouton'
                            : 'La vidéo principale n’est pas encore publiée'
                      }
                    >
                      <Icon nom="check" taille={14} />
                      <span className="course-complete-label-full">{occupe ? '…' : 'Marquer comme terminé'}</span>
                      <span className="course-complete-label-short">{occupe ? '…' : 'Terminer'}</span>
                    </button>
                  )}
                </div>

                {erreur && <div className="banner err mt16" role="alert"><span>{erreur}</span></div>}

                {chapitreSuivant && (
                  <div className="banner info mt16">
                    <Icon nom="check" taille={16} />
                    <span>
                      <b>Chapitre {rangChapitre} terminé !</b> Le chapitre {rangChapitre + 1} — {chapitreSuivant.titre} — est débloqué.
                    </span>
                    <Link className="btn btn-primary btn-sm" style={{ marginLeft: 'auto', flex: 'none' }} href={chapitreSuivant.href}>
                      Ouvrir le chapitre {rangChapitre + 1}
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {alternative && (
              <div className="alt-back">
                <button className="btn btn-sm" onClick={() => { setIllustration(null); setVideoRessource(null); }}>
                  <Icon nom="chevL" taille={12} /> Revenir à la vidéo principale
                </button>
              </div>
            )}

            {/* Ordre prototype conservé : ressources d'abord, vidéos ensuite. */}
            {ressources.length > 0 && (
              <div className="card mt16">
                <div className="card-head"><h3>Ressources complémentaires</h3><span className="xs faint">{ressources.length} fichier(s)</span></div>
                <div className="res-list">
                  {ressources.map((ressource) => (
                    <div className="res-item" key={ressource.id}>
                      <span className={`res-ico ${ressource.type === 'image' ? 'img' : ressource.type === 'doc' ? 'doc' : ''}`}>
                        <Icon nom={iconeDe(ressource.type)} taille={15} />
                      </span>
                      <div className="wrap">
                        <b style={{ fontSize: 13 }}>{ressource.title}</b>
                        <div className="xs faint">{LIBELLE_TYPE[ressource.type]}{ressource.size ? ` · ${ressource.size}` : ''}</div>
                      </div>
                      {ressource.type === 'video' ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => { setVideoRessource(ressource); setIllustration(null); }}>
                          <Icon nom="play" taille={14} /> Lire
                        </button>
                      ) : ressource.url ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => setVisionneuse(ressource)} title={`Télécharger ${ressource.title}`}>
                          <Icon nom="download" taille={14} /> Télécharger
                        </button>
                      ) : (
                        <span className="xs faint">Adresse pas encore publiée</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {illustrations.length > 0 && (
              <div className="card mt16">
                <div className="card-head"><h3>Vidéos complémentaires</h3><span className="xs faint">Pour aller plus loin</span></div>
                <div className="grid g2" style={{ padding: 14, gap: 10 }}>
                  {illustrations.map((video, index) => (
                    <div
                      key={video.id}
                      className={`vid-card ${illustration === index ? 'on' : ''}`}
                      onClick={() => { setIllustration(illustration === index ? null : index); setVideoRessource(null); }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setIllustration(illustration === index ? null : index);
                          setVideoRessource(null);
                        }
                      }}
                    >
                      <span className={`vid-thumb ${video.ratio === '9:16' ? 'v916' : ''}`}><Icon nom="play" taille={16} /></span>
                      <div className="wrap">
                        <b style={{ fontSize: 12.8 }}>{video.title}</b>
                        <div className="xs faint mt4">{video.ratio ?? '16:9'} · {video.duration ?? 'durée non renseignée'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="course-question-mobile card mt16">
              <div className="card-head"><h3>Une question ?</h3></div>
              <div className="course-question-mobile-body col">
                <AssistantPanel
                  nom={assistantNom}
                  hue={assistantHue}
                  formationId={formationId}
                  formationTitre={formationTitre}
                  moduleId={moduleId}
                  moduleTitre={moduleTitre}
                  messagesIA={[]}
                  messagesCoach={[]}
                  apercu={apercu}
                  compactActions
                />
              </div>
            </div>

            <div className="row between mt16" style={{ flexWrap: 'wrap', gap: 10 }}>
              <Link className="btn" href={retourHref}><Icon nom="chevL" taille={14} /> Retour à la formation</Link>
              {lesson.completed && suivant && (
                <Link className="btn btn-primary" href={suivant.href}>Cours suivant : {suivant.titre} <Icon nom="arrowR" taille={14} /></Link>
              )}
            </div>
          </div>
        </div>

        <div className="mod-side">
          <div className="pane" style={{ display: onglet === 'comments' ? undefined : 'none' }}>
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="card-head"><h3>Commentaires du cours</h3><span className="xs faint">{socialEtat?.totalCommentaires ?? 0} commentaire{socialEtat?.totalCommentaires === 1 ? '' : 's'}</span></div>
              <div className="card-pad">
                {!apercu && (
                  <div className="cmt-form">
                    <textarea
                      className="inp"
                      rows={2}
                      maxLength={2000}
                      placeholder="Écrivez votre commentaire ici"
                      value={texteCommentaire}
                      onChange={(event) => setTexteCommentaire(event.target.value)}
                    />
                    <button className="btn btn-primary btn-sm" disabled={socialOccupe === 'commentaire'} onClick={() => envoyerCommentaire(null)}>Publier</button>
                  </div>
                )}
                <div className="cmt-scroll">
                  {commentairesVisibles.map((commentaire) => afficherCommentaire(commentaire))}
                  {commentairesVisibles.length === 0 && <div className="xs faint mt16">Aucun commentaire pour l’instant — soyez la première personne à réagir au cours !</div>}
                </div>
                {racines.length > 3 && !afficherTout && (
                  <button className="btn btn-sm btn-block mt8" onClick={() => setAfficherTout(true)}>Voir plus de commentaires ({racines.length - 3})</button>
                )}
              </div>
            </div>
          </div>

          <div className="side-extra">
            <div className="card course-question-side">
              <div className="card-head"><h3>Une question ?</h3></div>
              <div style={{ padding: '14px 16px' }} className="col">
                <AssistantPanel
                  nom={assistantNom}
                  hue={assistantHue}
                  formationId={formationId}
                  formationTitre={formationTitre}
                  moduleId={moduleId}
                  moduleTitre={moduleTitre}
                  messagesIA={[]}
                  messagesCoach={[]}
                  apercu={apercu}
                  compactActions
                />
              </div>
            </div>

            <div className="card mt16 course-program-side" style={{ overflow: 'hidden' }}>
              <div className="card-head"><h3>Programme</h3><span className="xs faint">{totalModules} modules</span></div>
              {chapitres.map((chapitre, indexChapitre) => (
                <div key={chapitre.id}>
                  <div style={{ padding: '10px 16px 4px' }}>
                    <span className="xs" style={{ letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 800 }}>
                      Chapitre {indexChapitre + 1} — {chapitre.title}
                    </span>
                  </div>
                  {chapitre.modules.map((module) => {
                    const ouvert = chapitre.visible && module.ouvrable;
                    const courant = module.id === moduleId;
                    const href = hrefModule(chapitre, module, courant ? lesson.id : undefined);
                    return (
                      <div
                        className={`cur-step ${ouvert ? 'click' : 'locked'} ${courant ? 'cur-now' : ''}`}
                        style={{ padding: '9px 16px' }}
                        key={module.id}
                        onClick={() => { if (ouvert) router.push(href); }}
                        role={ouvert ? 'link' : undefined}
                        aria-disabled={!ouvert}
                        title={!ouvert ? 'Terminez les étapes précédentes pour accéder à ce contenu.' : undefined}
                      >
                        <span className={`step-ico ${module.termine ? 's-done' : ouvert ? 's-cur' : 's-lock'}`} style={{ width: 24, height: 24, borderRadius: 7 }}>
                          <Icon nom={module.termine ? 'check' : ouvert ? 'play' : 'lock'} taille={11} />
                        </span>
                        <div className="wrap"><div className="st-title" style={{ fontSize: 12.5 }}>{module.title}</div></div>
                        {courant ? <span className="badge b-violet">En cours</span> : module.termine ? <span className="xs faint">Terminée ✓</span> : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="card mt16 card-pad">
              <div className="eyebrow">Votre progression</div>
              <div className="mt8" style={{ fontSize: 22, fontWeight: 800 }}>{pourcentage}%</div>
              <div className={`mt8 pbar${pourcentage === 100 ? ' gold' : ''}`}><i style={{ width: `${pourcentage}%` }} /></div>
              <div className="xs muted mt8">{modulesTermines} module(s) terminé(s) sur {totalModules} · progression personnelle et privée</div>
            </div>
          </div>
        </div>
      </div>

      {socialErreur && <div className="banner err mt16" role="alert"><span>{socialErreur}</span></div>}

      {visionneuse?.url && (
        <VisionneuseFichier
          titre={visionneuse.title}
          url={visionneuse.url}
          type={visionneuse.type}
          taille={visionneuse.size}
          onClose={() => setVisionneuse(null)}
        />
      )}
    </div>
  );
}
