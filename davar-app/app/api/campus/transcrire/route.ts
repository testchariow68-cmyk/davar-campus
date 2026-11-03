import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore } from '@/lib/server/http';
import { recordOpEvent, trackApiRequest } from '@/lib/server/quota';
import { PLAFOND_AUDIO_OCTETS, transcrireAudio } from '@/lib/server/transcription';

export const dynamic = 'force-dynamic';

/**
 * TRANSCRIRE UN AVIS DICTÉ — Plan A, « Whisper large-v3 via Groq ».
 *
 * Le corps de la requête EST l'audio (aucun formulaire multipart à construire
 * côté navigateur) ; le type vient de l'en-tête `content-type`, la durée de
 * `x-duree-secondes`, et la formation de la chaîne de requête.
 *
 * Trois règles, dans cet ordre :
 *   1. même origine, session valide, vue test en lecture seule ;
 *   2. l'étudiant doit être RÉELLEMENT inscrit à la formation visée ;
 *   3. taille bornée AVANT de lire le corps — la mémoire d'un Worker gratuit est
 *      limitée, et une requête trop lourde ne doit pas passer.
 *
 * Ce qui ne se passe jamais ici : l'audio n'est ni écrit, ni journalisé, ni
 * conservé. Il est transmis, transcrit, et oublié — seul le texte revient.
 *
 * En cas d'empêchement (clé absente, quota du jour atteint, moteur muet), la
 * réponse dit à l'étudiant de basculer sur son appareil : `repli: 'navigateur'`.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  if (session.vueTest) return jsonNoStore({ error: 'vue_test_lecture_seule' }, 403);

  const formationId = new URL(request.url).searchParams.get('formation')?.trim() ?? '';
  if (!formationId) return jsonNoStore({ error: 'invalid_input' }, 400);

  const annonce = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(annonce) && annonce > PLAFOND_AUDIO_OCTETS)
    return jsonNoStore(
      {
        error: 'trop_lourd',
        message: 'L’enregistrement est trop long pour la transcription en ligne. Dictez en deux fois, ou sur votre appareil.',
        repli: 'navigateur',
      },
      413
    );

  const { db, user } = session;
  let inscription;
  try {
    inscription = await db.execute({
      sql: 'SELECT 1 AS ok FROM enrollments WHERE user_id = ? AND training_id = ?',
      args: [user.id, formationId],
    });
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
  if (inscription.rows.length === 0) return jsonNoStore({ error: 'not_enrolled' }, 403);

  let audio: Uint8Array;
  try {
    audio = new Uint8Array(await request.arrayBuffer());
  } catch {
    return jsonNoStore({ error: 'invalid_input' }, 400);
  }
  if (audio.byteLength > PLAFOND_AUDIO_OCTETS)
    return jsonNoStore(
      {
        error: 'trop_lourd',
        message: 'L’enregistrement est trop long pour la transcription en ligne. Dictez en deux fois, ou sur votre appareil.',
        repli: 'navigateur',
      },
      413
    );

  const secondes = Number(request.headers.get('x-duree-secondes') ?? '0');
  const resultat = await transcrireAudio({
    audio,
    typeMime: request.headers.get('content-type') ?? 'audio/webm',
    langue: 'fr',
    secondes: Number.isFinite(secondes) ? secondes : 0,
  });

  if (resultat.ok) {
    await recordOpEvent(db, 'transcription_sent', Date.now());
    return jsonNoStore({ ok: true, texte: resultat.texte, moteur: resultat.moteur });
  }

  await recordOpEvent(db, 'transcription_refused', Date.now());
  const messages: Record<string, string> = {
    sans_cle: 'La transcription en ligne n’est pas encore branchée. Dictez votre avis sur votre appareil : cela marche tout de suite.',
    quota: 'Trop de transcriptions aujourd’hui. Dictez votre avis sur votre appareil : la transcription y est immédiate.',
    trop_lourd: 'L’enregistrement est trop long pour la transcription en ligne. Dictez en deux fois, ou sur votre appareil.',
    vide: 'Aucun son n’a été enregistré. Réessayez en parlant plus près du micro.',
    erreur: 'La transcription en ligne n’a pas répondu. Réessayez, ou dictez sur votre appareil.',
  };
  const statut = resultat.raison === 'sans_cle' ? 503 : resultat.raison === 'quota' ? 429 : resultat.raison === 'vide' ? 400 : 502;
  return jsonNoStore(
    { error: resultat.raison, message: messages[resultat.raison] ?? messages.erreur, repli: resultat.repli },
    statut
  );
}
