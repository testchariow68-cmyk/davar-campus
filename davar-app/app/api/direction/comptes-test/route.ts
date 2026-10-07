import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { enregistrerEvenement } from '@/lib/server/journal';
import { COMPTES_TEST, creerComptesTest, listerComptesTest, supprimerComptesTest } from '@/lib/server/vue-test';

export const dynamic = 'force-dynamic';

/**
 * LES COMPTES DE TEST — réservés au propriétaire, jamais visibles ailleurs.
 *
 * Deux gestes, et deux seulement : préparer les huit comptes du prototype (un
 * étudiant, un par rôle d'équipe), ou les retirer entièrement. Aucun de ces
 * comptes ne peut se connecter : leur code secret est calculé sur un secret
 * aléatoire jetable.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';

  try {
    if (action === 'etat') {
      return jsonNoStore({ ok: true, comptes: await listerComptesTest(db), modeles: COMPTES_TEST });
    }

    if (action === 'creer') {
      const resultat = await creerComptesTest(db);
      await enregistrerEvenement(db, { actorId: reel.id, action: 'compte-test', detail: `${resultat.crees} compte(s) créé(s)` });
      return jsonNoStore({
        ok: true,
        comptes: resultat.comptes,
        modeles: COMPTES_TEST,
        message:
          resultat.crees === 0
            ? 'Les comptes de test étaient déjà en place.'
            : `${resultat.crees} compte(s) de test préparé(s) — ils ne comptent dans aucun chiffre et ne peuvent pas se connecter.`,
      });
    }

    if (action === 'retirer') {
      const resultat = await supprimerComptesTest(db);
      await enregistrerEvenement(db, { actorId: reel.id, action: 'compte-test', detail: `${resultat.supprimes} compte(s) retiré(s)` });
      return jsonNoStore({
        ok: true,
        comptes: await listerComptesTest(db),
        modeles: COMPTES_TEST,
        message: resultat.supprimes === 0 ? 'Aucun compte de test à retirer.' : `${resultat.supprimes} compte(s) de test retiré(s).`,
      });
    }

    return jsonNoStore({ error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 500);
  }
}
