import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { cibleAutorisee } from '@/lib/server/vue-test';
import { fermerVueTest, ouvrirVueTest } from '@/lib/server/vue-test-cookie';

export const dynamic = 'force-dynamic';

/**
 * Ouvrir / quitter une vue test — propriétaire uniquement.
 *
 * Le prototype refusait déjà toute cible qui n'est pas un compte test :
 *   « La vue test n'ouvre que des comptes test — jamais le fondateur ni une vraie personne. »
 * Ici la même règle est vérifiée EN BASE, à chaque ouverture : impossible de viser un
 * vrai étudiant même en fabriquant la requête à la main.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const cibleId = typeof body?.id === 'string' ? body.id : '';

  try {
    if (action === 'quitter') {
      await fermerVueTest();
      return jsonNoStore({ ok: true, vue: null });
    }
    if (action !== 'entrer') return jsonNoStore({ error: 'action_inconnue' }, 400);

    const cible = await cibleAutorisee(db, reel, cibleId);
    if (!cible) return jsonNoStore({ error: 'vue_test_refusee' }, 403);

    await ouvrirVueTest(cible.id);
    return jsonNoStore({ ok: true, vue: { id: cible.id, nom: cible.displayName } });
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
