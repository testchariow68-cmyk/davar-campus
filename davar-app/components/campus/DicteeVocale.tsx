'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * DICTÉE VOCALE D'UN AVIS — les deux moteurs, gardés par le propriétaire.
 *
 * PLAN A, « en ligne » (moteur `groq-whisper`, le défaut) : l'enregistrement part
 * au campus, qui le fait transcrire et renvoie le texte. Rien à télécharger.
 * L'enregistrement est effacé aussitôt : seul le texte est conservé.
 *
 * PLAN B, « sur votre appareil » (moteur `browser-whisper`) : le modèle de
 * reconnaissance vocale est téléchargé UNE SEULE FOIS par le navigateur (≈ 41 Mo),
 * puis la transcription se fait sur le téléphone — l'enregistrement ne quitte
 * jamais l'appareil, et cela marche ensuite même sans réseau.
 *
 * Le plan B sert aussi de REPLI : si la transcription en ligne refuse (service
 * pas encore branché, plafond du jour atteint, moteur muet), l'étudiant ne reste
 * jamais bloqué — on lui propose la transcription sur son appareil.
 *
 * Aucun nom de fournisseur n'apparaît ici : côté étudiant, on parle de ce qu'il
 * vit, jamais de nos outils internes.
 */
const MODELE_NAVIGATEUR = 'Xenova/whisper-tiny';
const TAILLE_MODELE_MO = 41;
const BIBLIOTHEQUE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';

const DUREE_MAX_SECONDES = 600;

type Etape = 'repos' | 'enregistre' | 'transcription' | 'telechargement' | 'propose_repli' | 'erreur';

function supporteLenregistrement(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined';
}

/** Le meilleur format que ce navigateur sait produire. */
function choisirTypeMime(): string {
  const candidats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const type of candidats) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}

/**
 * Charge la bibliothèque de transcription depuis son hébergeur, AU MOMENT où
 * l'étudiant la demande — jamais au chargement de la page. On passe par une
 * balise de script plutôt que par un `import` classique : ainsi l'outil de
 * construction n'essaie pas d'embarquer une adresse distante dans le paquet
 * livré aux étudiants.
 */
function chargerBibliotheque(): Promise<{ pipeline: unknown }> {
  const fenetre = window as unknown as { __davarTranscription?: { pipeline: unknown } };
  if (fenetre.__davarTranscription) return Promise.resolve(fenetre.__davarTranscription);

  return new Promise((resoudre, rejeter) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent =
      `import * as T from '${BIBLIOTHEQUE}';` +
      `window.__davarTranscription = T;` +
      `window.dispatchEvent(new Event('davar-transcription-prete'));`;
    script.onerror = () => rejeter(new Error('bibliothèque injoignable'));
    const delai = window.setTimeout(() => rejeter(new Error('délai dépassé')), 60_000);
    window.addEventListener(
      'davar-transcription-prete',
      () => {
        window.clearTimeout(delai);
        resoudre(fenetre.__davarTranscription as { pipeline: unknown });
      },
      { once: true }
    );
    document.head.appendChild(script);
  });
}

/** Décode l'enregistrement en échantillons mono 16 kHz, sur l'appareil. */
async function decoderAudio(fichier: Blob): Promise<Float32Array> {
  const contexte = new AudioContext({ sampleRate: 16_000 });
  try {
    const tampon = await contexte.decodeAudioData(await fichier.arrayBuffer());
    if (tampon.numberOfChannels === 1) return tampon.getChannelData(0);
    const melange = new Float32Array(tampon.length);
    for (let canal = 0; canal < tampon.numberOfChannels; canal += 1) {
      const donnees = tampon.getChannelData(canal);
      for (let index = 0; index < donnees.length; index += 1) melange[index] += donnees[index] / tampon.numberOfChannels;
    }
    return melange;
  } finally {
    void contexte.close();
  }
}

export function DicteeVocale({
  formationId,
  moteur,
  onTexte,
  desactive = false,
}: {
  formationId: string;
  /** Le moteur choisi par le propriétaire : `groq-whisper` ou `browser-whisper`. */
  moteur: string;
  /** Le texte transcrit, et d'où il vient — l'avis le dira honnêtement. */
  onTexte: (texte: string, origine: 'en-ligne' | 'appareil') => void;
  desactive?: boolean;
}) {
  const [monte, setMonte] = useState(false);
  const [etape, setEtape] = useState<Etape>('repos');
  const [secondes, setSecondes] = useState(0);
  const [avancement, setAvancement] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [proposition, setProposition] = useState<string | null>(null);

  const enregistreur = useRef<MediaRecorder | null>(null);
  const morceaux = useRef<Blob[]>([]);
  const dernierFichier = useRef<Blob | null>(null);
  const duree = useRef(0);
  const chronometre = useRef<number | null>(null);

  // La disponibilité du micro se lit APRÈS le montage : le serveur ne peut pas
  // la connaître, et l'annoncer trop tôt ferait clignoter un message faux.
  useEffect(() => setMonte(true), []);

  useEffect(() => {
    return () => {
      if (chronometre.current !== null) window.clearInterval(chronometre.current);
      enregistreur.current?.stream.getTracks().forEach((piste) => piste.stop());
    };
  }, []);

  function arreterChronometre() {
    if (chronometre.current !== null) {
      window.clearInterval(chronometre.current);
      chronometre.current = null;
    }
  }

  /* ------------------------------------------------------- 1. l'enregistrement */

  async function demarrer() {
    setMessage(null);
    setProposition(null);
    morceaux.current = [];
    dernierFichier.current = null;
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = choisirTypeMime();
      const rec = new MediaRecorder(flux, type ? { mimeType: type } : undefined);
      enregistreur.current = rec;
      rec.ondataavailable = (evenement) => {
        if (evenement.data.size > 0) morceaux.current.push(evenement.data);
      };
      rec.onstop = () => {
        flux.getTracks().forEach((piste) => piste.stop());
        arreterChronometre();
        const fichier = new Blob(morceaux.current, { type: rec.mimeType || 'audio/webm' });
        dernierFichier.current = fichier;
        void traiter(fichier, duree.current);
      };
      rec.start();
      duree.current = 0;
      setSecondes(0);
      setEtape('enregistre');
      chronometre.current = window.setInterval(() => {
        duree.current += 1;
        setSecondes(duree.current);
        if (duree.current >= DUREE_MAX_SECONDES) arreter();
      }, 1000);
    } catch {
      setEtape('erreur');
      setMessage('Le micro n’a pas pu être ouvert. Autorisez le microphone dans votre navigateur, puis réessayez.');
    }
  }

  function arreter() {
    if (enregistreur.current?.state === 'recording') enregistreur.current.stop();
  }

  /* ------------------------------------------- 2. Plan A : transcription en ligne */

  async function traiter(fichier: Blob, secondesEnregistrees: number) {
    if (fichier.size === 0) {
      setEtape('erreur');
      setMessage('Aucun son n’a été enregistré. Réessayez en parlant plus près du micro.');
      return;
    }
    if (moteur === 'browser-whisper') {
      setEtape('propose_repli');
      setProposition('Votre campus est réglé pour transcrire sur l’appareil.');
      return;
    }
    setEtape('transcription');
    setMessage('Transcription en cours…');
    try {
      const reponse = await fetch(`/api/campus/transcrire?formation=${encodeURIComponent(formationId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': fichier.type || 'audio/webm',
          'x-duree-secondes': String(Math.max(1, Math.min(secondesEnregistrees, DUREE_MAX_SECONDES))),
        },
        body: fichier,
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; texte?: string; message?: string };
      if (reponse.ok && donnees.ok && donnees.texte) {
        onTexte(donnees.texte, 'en-ligne');
        setEtape('repos');
        setMessage('Transcription ajoutée : relisez-la et corrigez si besoin.');
        return;
      }
      setEtape('propose_repli');
      setMessage(null);
      setProposition(donnees.message ?? 'La transcription en ligne n’a pas répondu.');
    } catch {
      setEtape('propose_repli');
      setMessage(null);
      setProposition('Le réseau n’a pas répondu.');
    }
  }

  /* --------------------------------------- 3. Plan B : transcription sur l'appareil */

  async function transcrireSurLAppareil(fichier: Blob) {
    setEtape('telechargement');
    setAvancement(0);
    setMessage(`Téléchargement du modèle de reconnaissance vocale (≈ ${TAILLE_MODELE_MO} Mo, une seule fois)…`);
    try {
      const bibliotheque = await chargerBibliotheque();
      const creer = bibliotheque.pipeline as (
        tache: string,
        modele: string,
        options: Record<string, unknown>
      ) => Promise<(audio: Float32Array, options: Record<string, unknown>) => Promise<{ text?: string }>>;
      const transcrire = await creer('automatic-speech-recognition', MODELE_NAVIGATEUR, {
        dtype: 'q8',
        progress_callback: (progres: { status?: string; progress?: number }) => {
          if (progres?.status === 'progress' && typeof progres.progress === 'number')
            setAvancement(Math.round(progres.progress));
        },
      });
      setEtape('transcription');
      setMessage('Transcription sur votre appareil…');
      const echantillons = await decoderAudio(fichier);
      const sortie = await transcrire(echantillons, {
        language: 'fr',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const texte = (sortie?.text ?? '').trim();
      if (texte.length === 0) {
        setEtape('erreur');
        setMessage('Rien n’a pu être transcrit. Réessayez en parlant plus distinctement.');
        return;
      }
      onTexte(texte, 'appareil');
      setEtape('repos');
      setMessage('Transcription ajoutée : relisez-la et corrigez si besoin.');
    } catch {
      setEtape('erreur');
      setMessage(
        'La transcription sur votre appareil n’a pas pu aboutir. Vérifiez votre connexion, ou écrivez votre avis à la main.'
      );
    }
  }

  /* ------------------------------------------------------------------ rendu */

  if (!monte) return null;

  if (!supporteLenregistrement()) {
    return (
      <p className="xs faint mt8">
        <Icon nom="mic" taille={12} /> La dictée n’est pas disponible sur ce navigateur : écrivez votre avis, ou utilisez
        la dictée de votre téléphone.
      </p>
    );
  }

  const enCours = etape === 'enregistre';
  const occupe = etape === 'transcription' || etape === 'telechargement';

  return (
    <div className="mt8" style={{ flexBasis: '100%' }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!enCours && (
          <button type="button" className="btn btn-sm" disabled={desactive || occupe} onClick={() => void demarrer()}>
            <Icon nom="mic" taille={14} /> {etape === 'propose_repli' || etape === 'erreur' ? 'Recommencer' : 'Dicter mon avis'}
          </button>
        )}
        {enCours && (
          <>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => arreter()}>
              <Icon nom="check" taille={14} /> Terminer ({Math.floor(secondes / 60)}:
              {String(secondes % 60).padStart(2, '0')})
            </button>
            <span className="xs faint">Parlez normalement : la transcription s’ajoutera à la fin, et vous pourrez la corriger.</span>
          </>
        )}
        {occupe && (
          <span className="xs muted">
            {etape === 'telechargement' && avancement > 0 ? `${message} ${avancement} %` : message}
          </span>
        )}
      </div>

      {etape === 'propose_repli' && (
        <div className="col mt8" style={{ gap: 6 }}>
          {proposition && <span className="xs muted">{proposition}</span>}
          <span className="xs faint">
            La transcription peut se faire sur votre appareil : le modèle se télécharge une seule fois (≈{' '}
            {TAILLE_MODELE_MO} Mo), et l’enregistrement ne quitte jamais votre téléphone.
          </span>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const fichier = dernierFichier.current;
                if (fichier) void transcrireSurLAppareil(fichier);
              }}
            >
              <Icon nom="mic" taille={14} /> Transcrire sur mon appareil
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setEtape('repos')}>
              Écrire plutôt
            </button>
          </div>
        </div>
      )}

      {etape === 'repos' && message && <p className="xs faint mt8">{message}</p>}
      {etape === 'erreur' && message && <p className="xs muted mt8">{message}</p>}

      {enCours && (
        <p className="xs faint mt8">
          <Icon nom="lock" taille={12} /> Seule la transcription est conservée : l’enregistrement est effacé aussitôt.
        </p>
      )}
    </div>
  );
}
