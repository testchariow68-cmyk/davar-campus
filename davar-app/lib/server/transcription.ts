/**
 * TRANSCRIPTION VOCALE DES AVIS — les DEUX moteurs que le propriétaire garde.
 *
 *   Plan A — « Whisper large-v3 via Groq »  : le défaut, recommandé par le
 *            prototype. La voix part vers un moteur gratuit, le texte revient en
 *            quelques secondes. Plafond du palier gratuit : 20 requêtes/minute,
 *            2 000 requêtes/jour, 28 800 secondes d'audio/jour, 25 Mo par
 *            fichier. C'est la MÊME clé Groq que l'assistant : un seul secret.
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

export type MoteurTranscription = 'groq-whisper' | 'browser-whisper';

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
    valeur: 'browser-whisper',
    libelle: 'Whisper dans le navigateur',
    detail:
      '100 % open source, s’exécute sur l’appareil de l’étudiant : zéro quota, zéro serveur, zéro coût. Le modèle se télécharge une seule fois (≈ 41 Mo), puis la transcription marche même sans réseau. Un peu plus lent.',
    repli: true,
  },
];

export const MODELE_GROQ = 'whisper-large-v3';
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
  return valeur === 'browser-whisper' ? 'browser-whisper' : 'groq-whisper';
}

/** La clé est-elle posée ? Sert à l'écran de configuration et à la recette. */
export function transcriptionEnLigneDisponible(): boolean {
  return (process.env.GROQ_API_KEY ?? '').trim().length > 0;
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
export async function transcrireAudio(options: {
  audio: Uint8Array;
  typeMime: string;
  langue?: string;
  secondes?: number;
  fetchImpl?: typeof fetch;
}): Promise<ResultatTranscription> {
  const audio = options.audio;
  if (!audio || audio.byteLength === 0) return refus('vide', 'enregistrement vide');
  if (audio.byteLength > PLAFOND_AUDIO_OCTETS)
    return refus('trop_lourd', `au-delà de ${Math.round(PLAFOND_AUDIO_OCTETS / (1024 * 1024))} Mo`);

  const cle = (process.env.GROQ_API_KEY ?? '').trim();
  if (cle.length === 0) return refus('sans_cle', 'la transcription en ligne n’est pas encore branchée');

  const langue = (options.langue ?? 'fr').trim().slice(0, 8) || 'fr';
  const secondes = Math.max(MINIMUM_FACTURE_SECONDES, Math.round(options.secondes ?? 0));

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
