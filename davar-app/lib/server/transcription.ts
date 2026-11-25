/**
 * TRANSCRIPTION VOCALE DES AVIS — les DEUX moteurs que le propriétaire garde.
 *
 *   Plan A — « Whisper large-v3 via Groq »  : le défaut, recommandé par le
 *            prototype. La voix part vers un moteur gratuit, le texte revient en
 *            quelques secondes. Plafond du palier gratuit : 20 requêtes/minute,
 *            2 000 requêtes/jour, 28 800 secondes d'audio/jour, 25 Mo par
 *            fichier. C'est la MÊME clé Groq que l'assistant : un seul secret.
 *
 *   Plan A bis — « Gemini »                 : AJOUTÉ LE 8 OCTOBRE 2026. Groq
 *            REFUSE les appels venant d'un centre de données — serveurs, VPN, et
 *            donc le Worker qui héberge le campus — en renvoyant « Access denied.
 *            Please check your network settings. », même avec une clé parfaite.
 *            Sans remplaçant, la dictée serait retombée sur le navigateur, c'est-
 *            à-dire 41 Mo à télécharger pour l'étudiant — ruineux en données
 *            mobiles. Gemini lit l'audio et rend le texte : même service rendu,
 *            côté serveur, avec la clé que le propriétaire possède déjà, et rien
 *            à télécharger pour l'étudiant.
 *
 *            L'ordre reste celui du prototype : Groq d'abord, le navigateur en
 *            dernier recours. Gemini s'intercale entre les deux, et la chaîne
 *            est AUTOMATIQUE — on ne demande rien à l'étudiant.
 *
 *   Plan B — « Whisper dans le navigateur » : la transcription se fait SUR
 *            l'appareil de l'étudiant. Rien ne sort du téléphone, aucun quota
 *            n'est consommé — mais le modèle doit être téléchargé une fois
 *            (côté navigateur, jamais côté serveur : voir `DicteeVocale.tsx`).
 *
 * Décisions de conception, et pourquoi :
 *   - L'audio n'est JAMAIS écrit sur le disque ni dans la base : il transite, il
 *     est transcrit, il est oublié. Seul le texte est conservé — c'est la règle
 *     écrite du propriétaire (« le propriétaire ne reçoit que l'écrit »).
 *   - Le plafond de 8 Mo est VOLONTAIREMENT plus bas que les 25 Mo de Groq :
 *     8 Mo ≈ 15 minutes de parole, bien au-delà d'un avis de 1 000 mots, et cela
 *     évite qu'une seule requête mange la mémoire d'un Worker gratuit.
 *   - Les compteurs du palier gratuit sont protégés AVANT l'appel (règle du
 *     projet : « nous protégeons les quotas, nous ne les dépensons pas ») : quand
 *     le plafond du jour est atteint, l'étudiant bascule sur son appareil au lieu
 *     de voir une erreur.
 */
import { budgetFor, countOp } from './quota.ts';
import { urlGroq } from './http.ts';

export type MoteurTranscription = 'groq-whisper' | 'gemini-audio' | 'browser-whisper';

/** Ceux qui tournent côté serveur — le navigateur tourne chez l'étudiant. */
export type MoteurEnLigne = Exclude<MoteurTranscription, 'browser-whisper'>;

/** L'ordre d'essai sur le serveur : celui du prototype, Gemini en relais. */
export const MOTEURS_EN_LIGNE: MoteurEnLigne[] = ['groq-whisper', 'gemini-audio'];

/** Quelle clé d'environnement pour quel moteur. */
export function cleDuMoteur(moteur: MoteurEnLigne): string {
  return (process.env[moteur === 'gemini-audio' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY'] ?? '').trim();
}

/**
 * Les deux choix de l'écran Direction, dans l'ordre du prototype : Groq d'abord.
 * `repli: true` signale le moteur utilisé quand la transcription en ligne ne peut
 * pas répondre (clé absente, quota du jour atteint, service muet).
 */
export const MOTEURS_TRANSCRIPTION: Array<{
  valeur: MoteurTranscription;
  libelle: string;
  detail: string;
  repli: boolean;
}> = [
  {
    valeur: 'groq-whisper',
    libelle: 'Whisper large-v3 via Groq (recommandé)',
    detail:
      'Modèle open source, API hébergée gratuite : ≈ 2 000 transcriptions/jour, 99 langues, très pointu. Aucun VPS. L’enregistrement est effacé aussitôt, seul le texte est conservé.',
    repli: false,
  },
  {
    valeur: 'gemini-audio',
    libelle: 'Gemini — transcription en ligne',
    detail:
      'Lit l’enregistrement et rend le texte, côté serveur : rien à télécharger pour l’étudiant. Prend la main AUTOMATIQUEMENT si Groq est injoignable (il refuse les appels venant d’un serveur). Utilise la clé Gemini, la même que l’assistant.',
    repli: false,
  },
  {
    valeur: 'browser-whisper',
    libelle: 'Whisper dans le navigateur',
    detail:
      '100 % open source, s’exécute sur l’appareil de l’étudiant : zéro quota, zéro serveur, zéro coût. Le modèle se télécharge une seule fois (≈ 41 Mo), puis la transcription marche même sans réseau. Un peu plus lent.',
    repli: true,
  },
];

export const MODELE_GROQ = 'whisper-large-v3';
/** Modèle Gemini utilisé pour la transcription : il lit l'audio et rend le texte. */
export const MODELE_GEMINI = 'gemini-2.5-flash';
/**
 * Adresse d'appel à Whisper chez Groq. Passe par GROQ_BASE_URL si elle est
 * déclarée (voir `urlGroq`) : sans elle, c'est l'API officielle. Calculée à
 * l'appel, jamais à l'import : l'environnement peut changer entre-temps.
 */
export function urlTranscriptionGroq(): string {
  return urlGroq('audio/transcriptions');
}

/** Sous les 25 Mo de Groq, et ≈ 15 minutes de parole. */
export const PLAFOND_AUDIO_OCTETS = 8 * 1024 * 1024;
/** Au-delà, on arrête l'enregistrement : un avis de 1 000 mots tient en 10 minutes. */
export const DUREE_MAX_SECONDES = 600;
/** Groq facture au minimum 10 secondes par requête : on compte au plus juste. */
const MINIMUM_FACTURE_SECONDES = 10;

/** La valeur enregistrée par le propriétaire, ou le défaut du prototype. */
export function moteurTranscription(valeur: string | null | undefined): MoteurTranscription {
  if (valeur === 'browser-whisper') return 'browser-whisper';
  if (valeur === 'gemini-audio') return 'gemini-audio';
  return 'groq-whisper';
}

/** Au moins un moteur en ligne est-il branché ? Sert à l'écran et à la recette. */
export function transcriptionEnLigneDisponible(): boolean {
  return MOTEURS_EN_LIGNE.some((moteur) => cleDuMoteur(moteur).length > 0);
}

export type ResultatTranscription =
  | { ok: true; texte: string; moteur: MoteurTranscription }
  | {
      ok: false;
      raison: 'sans_cle' | 'quota' | 'trop_lourd' | 'vide' | 'erreur' | 'langue_inconnue';
      detail?: string;
      /** Que proposer à l'étudiant : le repli sur son appareil. */
      repli: 'navigateur';
    };

/** L'extension attendue par le moteur, déduite du type d'enregistrement. */
export function nomFichierPour(typeMime: string): string {
  const type = (typeMime.split(';')[0] ?? '').trim().toLowerCase();
  if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) return 'avis.m4a';
  if (type.includes('ogg')) return 'avis.ogg';
  if (type.includes('wav')) return 'avis.wav';
  if (type.includes('mpeg') || type.includes('mp3')) return 'avis.mp3';
  if (type.includes('webm')) return 'avis.webm';
  return 'avis.webm';
}

function refus(
  raison: Extract<ResultatTranscription, { ok: false }>['raison'],
  detail?: string
): ResultatTranscription {
  return { ok: false, raison, detail, repli: 'navigateur' };
}

/**
 * Transcrit un enregistrement avec Whisper large-v3 (Groq).
 *
 * L'audio arrive en mémoire, part chez Groq, revient en texte, et n'est écrit
 * nulle part. Les deux compteurs du palier gratuit sont consommés AVANT l'appel :
 * une requête refusée ne coûte rien au propriétaire.
 */
async function transcrireAvecGroq(options: {
  audio: Uint8Array;
  typeMime: string;
  langue: string;
  secondes: number;
  fetchImpl?: typeof fetch;
}): Promise<ResultatTranscription> {
  const audio = options.audio;
  const langue = options.langue;
  const secondes = options.secondes;
  const cle = cleDuMoteur('groq-whisper');

  // Protection des quotas gratuits, dans l'ordre : requêtes, puis secondes.
  if (!countOp('transcription.requests')) return refus('quota', 'plafond du jour atteint (requêtes)');
  if (!countOp('transcription.seconds', secondes)) return refus('quota', 'plafond du jour atteint (durée)');

  // La copie bornée (`slice`) évite d'envoyer à Groq plus d'octets que ceux de
  // l'enregistrement : un tampon peut être plus grand que la vue qui le lit.
  const octets = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
  const forme = new FormData();
  forme.append('file', new Blob([octets], { type: options.typeMime || 'audio/webm' }), nomFichierPour(options.typeMime));
  forme.append('model', MODELE_GROQ);
  forme.append('language', langue);
  forme.append('response_format', 'json');
  forme.append('temperature', '0');

  const envoyer = options.fetchImpl ?? fetch;
  try {
    const reponse = await envoyer(urlTranscriptionGroq(), {
      method: 'POST',
      headers: { authorization: `Bearer ${cle}` },
      body: forme,
      signal: AbortSignal.timeout(120_000),
    });

    if (reponse.status === 429) {
      // Le palier gratuit est réellement atteint : on épuise le compteur du jour
      // pour que cette instance arrête d'essayer, et l'étudiant bascule sur son
      // appareil au lieu d'attendre.
      countOp('transcription.requests', budgetFor('transcription.requests').limit);
      return refus('quota', 'le moteur a refusé : plafond atteint');
    }
    if (!reponse.ok) return refus('erreur', `réponse ${reponse.status} du moteur`);

    const corps = (await reponse.json().catch(() => null)) as { text?: unknown } | null;
    const texte = typeof corps?.text === 'string' ? corps.text.trim() : '';
    if (texte.length === 0) return refus('erreur', 'transcription vide');
    return { ok: true, texte, moteur: 'groq-whisper' };
  } catch (erreur) {
    const nom = (erreur as { name?: string })?.name ?? 'erreur';
    return refus('erreur', nom === 'TimeoutError' ? 'le moteur n’a pas répondu à temps' : 'échec réseau');
  }
}

/**
 * Encode des octets en base64 sans dépendance : `btoa` existe dans le navigateur
 * ET dans les Workers, mais il refuse les gros tableaux d'un coup — on y va par
 * morceaux, ce qui évite aussi de faire exploser la pile.
 */
function base64DepuisOctets(octets: Uint8Array): string {
  let binaire = '';
  const MORCEAU = 0x8000;
  for (let index = 0; index < octets.length; index += MORCEAU) {
    binaire += String.fromCharCode(...octets.subarray(index, index + MORCEAU));
  }
  return btoa(binaire);
}

/**
 * La consigne envoyée à Gemini pour qu'il TRANSCRIVE au lieu de commenter.
 * Sans cette mise au point, un modèle de langage a tendance à résumer, corriger
 * ou mettre en forme — or un avis doit rester les mots exacts de l'étudiant.
 */
function consigneTranscription(langue: string): string {
  return (
    `Transcris fidèlement cet enregistrement audio en ${langue === 'fr' ? 'français' : langue}. ` +
    'Rends uniquement les mots réellement prononcés, mot pour mot, dans leur ordre. ' +
    "N'ajoute aucun titre, aucun commentaire, aucune ponctuation de ton choix, aucune note, " +
    "aucune mention de ton travail. Ne traduis pas. N'invente rien pour combler un passage " +
    'inaudible : si tu ne comprends pas, laisse ce passage de côté. Réponds par le texte seul.'
  );
}

/**
 * Transcrit un enregistrement avec Gemini (Plan A bis).
 *
 * Même discipline que Groq : l'audio n'est écrit nulle part, il transite, il est
 * transcrit, il est oublié. Les compteurs du palier gratuit sont consommés AVANT
 * l'appel, pour qu'une requête refusée ne coûte rien.
 */
async function transcrireAvecGemini(options: {
  audio: Uint8Array;
  typeMime: string;
  langue: string;
  secondes: number;
  fetchImpl?: typeof fetch;
}): Promise<ResultatTranscription> {
  const { audio, langue, secondes } = options;

  if (!countOp('transcription.requests')) return refus('quota', 'plafond du jour atteint (requêtes)');
  if (!countOp('transcription.seconds', secondes)) return refus('quota', 'plafond du jour atteint (durée)');

  const octets = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
  const corps = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: consigneTranscription(langue) },
          {
            inline_data: {
              mime_type: (options.typeMime.split(';')[0] ?? '').trim() || 'audio/webm',
              data: base64DepuisOctets(new Uint8Array(octets)),
            },
          },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELE_GEMINI}:generateContent?key=${encodeURIComponent(cleDuMoteur('gemini-audio'))}`;
  const envoyer = options.fetchImpl ?? fetch;
  try {
    const reponse = await envoyer(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(120_000),
    });

    if (reponse.status === 429) {
      countOp('transcription.requests', budgetFor('transcription.requests').limit);
      return refus('quota', 'le moteur a refusé : plafond atteint');
    }
    if (reponse.status === 403) {
      // Même cause que Groq, ou une clé sans accès au modèle : dans les deux cas
      // on ne peut rien y faire ici, et l'étudiant a encore son appareil.
      return refus('sans_cle', 'le moteur refuse cet appel (accès ou réseau)');
    }
    if (!reponse.ok) return refus('erreur', `réponse ${reponse.status} du moteur`);

    const donnees = (await reponse.json().catch(() => null)) as
      | { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> }
      | null;
    const parties = donnees?.candidates?.[0]?.content?.parts ?? [];
    const texte = parties
      .map((partie) => (typeof partie?.text === 'string' ? partie.text : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (texte.length === 0) return refus('erreur', 'transcription vide');
    return { ok: true, texte, moteur: 'gemini-audio' };
  } catch (erreur) {
    const nom = (erreur as { name?: string })?.name ?? 'erreur';
    return refus('erreur', nom === 'TimeoutError' ? 'le moteur n’a pas répondu à temps' : 'échec réseau');
  }
}

/**
 * Transcrit un avis dicté — la CHAÎNE, dans l'ordre du prototype.
 *
 * Le moteur réglé par le propriétaire est essayé le premier ; s'il ne peut pas
 * répondre (clé absente, quota du jour, service injoignable), le suivant prend la
 * main sans rien demander à l'étudiant. C'est ce qui rend supportable le blocage
 * de Groq depuis un centre de données : le campus continue de transcrire en
 * ligne, et l'étudiant n'a toujours rien à télécharger.
 *
 * Si plus aucun moteur en ligne ne répond, on ne renvoie pas d'erreur sèche : on
 * renvoie `repli: 'navigateur'`, et l'étudiant dicte sur son téléphone.
 */
export async function transcrireAudio(options: {
  audio: Uint8Array;
  typeMime: string;
  langue?: string;
  secondes?: number;
  moteur?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<ResultatTranscription> {
  const audio = options.audio;
  if (!audio || audio.byteLength === 0) return refus('vide', 'enregistrement vide');
  if (audio.byteLength > PLAFOND_AUDIO_OCTETS)
    return refus('trop_lourd', `au-delà de ${Math.round(PLAFOND_AUDIO_OCTETS / (1024 * 1024))} Mo`);

  const choix = moteurTranscription(options.moteur);
  // Le propriétaire a choisi l'appareil : le serveur n'envoie rien en ligne.
  if (choix === 'browser-whisper') return refus('sans_cle', 'transcription sur l’appareil demandée');

  const langue = (options.langue ?? 'fr').trim().slice(0, 8) || 'fr';
  const secondes = Math.max(MINIMUM_FACTURE_SECONDES, Math.round(options.secondes ?? 0));

  // Le moteur choisi d'abord, puis les autres : on ne réessaie jamais deux fois
  // le même, et l'ordre du prototype est respecté.
  const ordre = [choix, ...MOTEURS_EN_LIGNE.filter((moteur) => moteur !== choix)] as MoteurEnLigne[];
  const disponibles = ordre.filter((moteur) => cleDuMoteur(moteur).length > 0);
  if (disponibles.length === 0)
    return refus('sans_cle', 'la transcription en ligne n’est pas encore branchée');

  let dernier = refus('sans_cle', 'la transcription en ligne n’est pas encore branchée');
  for (const moteur of disponibles) {
    const commun = { audio, typeMime: options.typeMime, langue, secondes, fetchImpl: options.fetchImpl };
    dernier = moteur === 'gemini-audio' ? await transcrireAvecGemini(commun) : await transcrireAvecGroq(commun);
    if (dernier.ok) return dernier;
  }
  return dernier;
}
