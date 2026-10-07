import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { enregistrerEvenement } from '@/lib/server/journal';
import {
  creerFormation,
  modifierFormation,
  publierFormation,
  supprimerFormation,
} from '@/lib/server/direction';

export const dynamic = 'force-dynamic';

/** Créer, modifier, ouvrir/fermer ou supprimer une formation. Propriétaire uniquement. */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const id = typeof body?.id === 'string' ? body.id : '';

  try {
    if (action === 'create') {
      const resultat = await creerFormation(db, {
        titre: String(body?.titre ?? ''),
        description: String(body?.description ?? ''),
        prixCfa: Number(body?.prixCfa ?? 0),
        chariowProductId: String(body?.chariowProductId ?? ''),
        buyUrl: String(body?.buyUrl ?? ''),
      });
      if (resultat.ok)
        await enregistrerEvenement(db, {
          actorId: reel.id,
          action: 'formation-creation',
          detail: String(body?.titre ?? ''),
        });
      return jsonNoStore(resultat, resultat.ok ? 200 : 400);
    }
    if (action === 'update') {
      if (!id) return jsonNoStore({ ok: false, erreur: 'identifiant_manquant' }, 400);
      const resultat = await modifierFormation(db, id, {
        titre: String(body?.titre ?? ''),
        description: String(body?.description ?? ''),
        prixCfa: Number(body?.prixCfa ?? 0),
        chariowProductId: String(body?.chariowProductId ?? ''),
        buyUrl: String(body?.buyUrl ?? ''),
      });
      if (resultat.ok)
        await enregistrerEvenement(db, { actorId: reel.id, action: 'formation-modification', detail: id });
      return jsonNoStore(resultat, resultat.ok ? 200 : 400);
    }
    if (action === 'publish') {
      if (!id) return jsonNoStore({ ok: false, erreur: 'identifiant_manquant' }, 400);
      const resultat = await publierFormation(db, id, body?.publie !== false);
      if (resultat.ok)
        await enregistrerEvenement(db, {
          actorId: reel.id,
          action: 'formation-publication',
          detail: `${id} · ${body?.publie !== false ? 'publiée' : 'retirée'}`,
        });
      return jsonNoStore(resultat, resultat.ok ? 200 : 400);
    }
    if (action === 'delete') {
      if (!id) return jsonNoStore({ ok: false, erreur: 'identifiant_manquant' }, 400);
      const resultat = await supprimerFormation(db, id);
      if (resultat.ok) await enregistrerEvenement(db, { actorId: reel.id, action: 'formation-suppression', detail: id });
      return jsonNoStore(resultat, resultat.ok ? 200 : 400);
    }
    return jsonNoStore({ ok: false, erreur: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ ok: false, erreur: 'unavailable' }, 503);
  }
}
