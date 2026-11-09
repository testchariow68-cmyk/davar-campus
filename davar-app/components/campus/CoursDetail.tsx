'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { VisionneuseFichier } from './VisionneuseFichier';
import type { Lesson, RessourceCours } from '@/lib/server/campus';

/** Formats d'image du lecteur, tels que le prototype les nomme. */
const RATIO_CLS: Record<string, string> = { '16:9': 'r-169', '9:16': 'r-916', '4:3': 'r-43', '1:1': 'r-11' };
const RATIOS = ['16:9', '9:16', '4:3', '1:1'];

const LIBELLE_TYPE: Record<RessourceCours['type'], string> = {
  video: 'Vidéo',
  pdf: 'PDF',
  doc: 'Document',
  audio: 'Audio',
  image: 'Image',
  autre: 'Fichier',
};

/** Icône d'une ressource, selon son type — la même logique que le prototype. */
function iconeDe(type: RessourceCours['type']): 'eye' | 'file' | 'download' | 'mic' {
  if (type === 'image') return 'eye';
  if (type === 'doc') return 'file';
  if (type === 'audio') return 'mic';
  return 'download';
}

/** YouTube, Vimeo ou fichier direct : on joue ce qui est réellement là. */
function idYouTube(url: string): string | null {
  const trouve = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return trouve ? trouve[1] : null;
}

/**
 * LE LECTEUR — la vidéo principale du cours, ou la vidéo d'illustration que
 * l'élève a choisie. Quand aucune adresse n'est publiée, on ne fait pas
 * semblant : le prototype montre un « visage » de lecture, on fait pareil.
 */
function Lecteur({
  url,
  ratio,
  titre,
  duree,
  illustration,
}: {
  url: string | null;
  ratio: string;
  titre: string;
  duree: string | null;
  illustration: boolean;
}) {
  const classe = RATIO_CLS[ratio] ?? 'r-169';
  const youtube = url ? idYouTube(url) : null;
  return (
    <div className="player-stage">
      <div className={`player-box ${classe}`}>
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
            src={url}
            controls
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
              {illustration
                ? 'Vidéo d’illustration · adresse pas encore publiée'
                : duree
                  ? `${duree} · vidéo pas encore publiée`
                  : 'Vidéo pas encore publiée'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * LE COURS — ce qu'il porte, exactement comme le prototype : une vidéo
 * principale, des vidéos d'illustration qui se jouent dans le même lecteur, et
 * des ressources à télécharger (PDF, document, audio, image).
 *
 * Une illustration ne compte JAMAIS dans la progression : elle éclaire, elle ne
 * fait pas avancer. Seul « Marquer comme terminé » fait avancer.
 */
export function CoursDetail({
  lesson,
  chapitreTitre,
  rangChapitre,
  suivant,
  chapitreSuivant,
  retourHref,
}: {
  lesson: Lesson;
  chapitreTitre: string;
  rangChapitre: number;
  suivant: { titre: string; href: string } | null;
  chapitreSuivant: { titre: string; href: string } | null;
  retourHref: string;
}) {
  const router = useRouter();
  const [illustration, setIllustration] = useState<number | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Le document ouvert en plein écran — jamais téléchargé sans qu'on le demande. */
  const [visionneuse, setVisionneuse] = useState<RessourceCours | null>(null);

  const illustrations = lesson.assets.filter((a) => a.kind === 'illustration');
  const ressources = lesson.assets.filter((a) => a.kind === 'ressource');
  const ratio = lesson.ratio && RATIOS.includes(lesson.ratio) ? lesson.ratio : '16:9';
  const enCours = illustration === null ? null : (illustrations[illustration] ?? null);
  const dureePrincipale = lesson.durationMin ? `${lesson.durationMin} min` : null;

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
      router.refresh();
    } catch {
      setErreur('Mise à jour impossible.');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <Lecteur
          url={enCours ? enCours.url : lesson.resourceUrl}
          ratio={enCours ? (enCours.ratio && RATIOS.includes(enCours.ratio) ? enCours.ratio : '16:9') : ratio}
          titre={enCours ? enCours.title : lesson.title}
          duree={enCours ? enCours.duration : dureePrincipale}
          illustration={enCours !== null}
        />
        <div className="card-pad">
          <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="eyebrow">
                {/* Un chapitre titré « Chapitre 1 — … » ne doit pas répéter son numéro. */}
                {/^chapitre\b/i.test(chapitreTitre.trim())
                  ? chapitreTitre
                  : `Chapitre ${rangChapitre} — ${chapitreTitre}`}
              </div>
              <h2 style={{ fontSize: 18, marginTop: 3 }}>
                {enCours ? enCours.title : lesson.title}
                {enCours && <span className="badge b-grey" style={{ marginLeft: 8 }}>hors progression</span>}
              </h2>
            </div>
            {enCours ? (
              /* Une vidéo complémentaire éclaire : elle ne fait pas avancer. */
              <span className="small muted">
                Revenez à la vidéo principale pour marquer le cours comme terminé.
              </span>
            ) : lesson.completed ? (
              <span className="badge b-green">
                <Icon nom="check" taille={12} /> Cours terminé
              </span>
            ) : (
              <button className="btn btn-primary btn-sm" disabled={occupe} onClick={() => void marquer()}>
                <Icon nom="check" taille={14} /> {occupe ? '…' : 'Marquer comme terminé'}
              </button>
            )}
          </div>

          {erreur && (
            <div className="banner err mt16" role="alert">
              <span>{erreur}</span>
            </div>
          )}

          {chapitreSuivant && (
            <div className="banner info mt16">
              <Icon nom="check" taille={16} />
              <span>
                <b>Chapitre {rangChapitre} terminé !</b> Le chapitre {rangChapitre + 1} — {chapitreSuivant.titre} — est
                débloqué.
              </span>
              <Link className="btn btn-primary btn-sm" style={{ marginLeft: 'auto', flex: 'none' }} href={chapitreSuivant.href}>
                Ouvrir le chapitre {rangChapitre + 1}
              </Link>
            </div>
          )}
        </div>
      </div>

      {enCours && (
        <div className="mt16">
          <button className="btn btn-sm" onClick={() => setIllustration(null)}>
            <Icon nom="chevL" taille={12} /> Revenir à la vidéo principale
          </button>
        </div>
      )}

      {ressources.length > 0 && (
        <div className="card mt16">
          <div className="card-head">
            <h3>Ressources complémentaires</h3>
            <span className="xs faint">{ressources.length} fichier(s)</span>
          </div>
          <div className="res-list">
            {ressources.map((ressource) => (
              <div
                className="res-item"
                key={ressource.id}
                onClick={() => {
                  if (ressource.url && ressource.type !== 'audio') setVisionneuse(ressource);
                }}
                style={{ cursor: ressource.url && ressource.type !== 'audio' ? 'pointer' : undefined }}
              >
                <span
                  className={`res-ico ${ressource.type === 'image' ? 'img' : ressource.type === 'doc' ? 'doc' : ''}`}
                >
                  <Icon nom={iconeDe(ressource.type)} taille={15} />
                </span>
                <div className="wrap">
                  <b style={{ fontSize: 13 }}>{ressource.title}</b>
                  <div className="xs faint">
                    {LIBELLE_TYPE[ressource.type]}
                    {ressource.size ? ` · ${ressource.size}` : ''}
                  </div>
                </div>
                {ressource.type === 'audio' && ressource.url ? (
                  /* Un audio se JOUE là, tout de suite : ce n'est pas un fichier qu'on range. */
                  <audio controls src={ressource.url} style={{ height: 34, maxWidth: 300, flex: '1 1 220px' }}>
                    Votre navigateur ne sait pas lire cet audio.
                  </audio>
                ) : ressource.url ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setVisionneuse(ressource)}
                    title={`Ouvrir ${ressource.title}`}
                  >
                    <Icon nom={ressource.type === 'image' ? 'eye' : 'file'} taille={14} /> Ouvrir
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
          <div className="card-head">
            <h3>Vidéos complémentaires</h3>
            <span className="xs faint">Pour aller plus loin</span>
          </div>
          <div className="grid g2" style={{ padding: 14, gap: 10 }}>
            {illustrations.map((video, index) => (
              <div
                key={video.id}
                className={`vid-card ${illustration === index ? 'on' : ''}`}
                onClick={() => setIllustration(illustration === index ? null : index)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setIllustration(illustration === index ? null : index);
                }}
              >
                <span className={`vid-thumb ${video.ratio === '9:16' ? 'v916' : ''}`}>
                  <Icon nom="play" taille={16} />
                </span>
                <div className="wrap">
                  <b style={{ fontSize: 12.8 }}>{video.title}</b>
                  <div className="xs faint mt4">
                    {video.ratio ?? '16:9'} · {video.duration ?? 'durée non renseignée'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {visionneuse?.url && (
        <VisionneuseFichier
          titre={visionneuse.title}
          url={visionneuse.url}
          type={visionneuse.type}
          taille={visionneuse.size}
          onClose={() => setVisionneuse(null)}
        />
      )}

      <div className="row between mt16" style={{ flexWrap: 'wrap', gap: 10 }}>
        <Link className="btn" href={retourHref}>
          <Icon nom="chevL" taille={14} /> Retour au chapitre
        </Link>
        {lesson.completed && suivant && (
          <Link className="btn btn-primary" href={suivant.href}>
            Cours suivant : {suivant.titre} <Icon nom="arrowR" taille={14} />
          </Link>
        )}
      </div>
    </div>
  );
}
