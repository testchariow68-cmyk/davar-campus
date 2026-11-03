import { currentSession } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { demanderCertificat } from '@/lib/server/certificats';
import { notifierEquipe } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

/** Demander son certificat. Il ne se télécharge pas : il se demande, puis se valide à la main. */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  if (session.vueTest) return jsonNoStore({ error: 'vue_test_lecture_seule' }, 403);

  const body = await readJsonBody(request);
  const formationId = typeof body?.formationId === 'string' ? body.formationId.trim() : '';
  if (!formationId) return jsonNoStore({ error: 'invalid_input' }, 400);
  const maintenant = Date.now();

  try {
    const resultat = await demanderCertificat(
      session.db,
      { userId: session.user.id, formationId, holderName: session.user.displayName },
      maintenant
    );
    if (!resultat.ok) {
      const messages: Record<string, string> = {
        nom_invalide: 'Le nom de votre profil est incomplet : demandez sa correction à la direction.',
        non_inscrit: 'Vous n’êtes pas inscrit à cette formation.',
        demande_deja_en_cours: 'Votre demande est déjà enregistrée : la direction la traite.',
      };
      return jsonNoStore({ error: resultat.erreur, message: messages[resultat.erreur ?? ''] ?? 'La demande n’a pas abouti.' }, 400);
    }
    await notifierEquipe(
      session.db,
      { titre: 'Demande de certificat', corps: `${session.user.displayName} demande son certificat.`, route: '/direction/certificats', kind: 'certificat' },
      maintenant
    );
    return jsonNoStore({ ok: true, message: 'Demande transmise. La direction la valide, puis votre certificat reçoit son code de vérification.' });
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
