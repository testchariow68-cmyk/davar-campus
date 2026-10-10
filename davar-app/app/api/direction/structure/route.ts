import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { enregistrerEvenement } from '@/lib/server/journal';
import {
  ajouterLecon,
  ajouterModule,
  deplacerLecon,
  deplacerModule,
  modifierLecon,
  modifierModule,
  supprimerLecon,
  supprimerModule,
  type Resultat,
} from '@/lib/server/direction';

export const dynamic = 'force-dynamic';

/** Construire la structure d'une formation : modules et leçons. Propriétaire uniquement. */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const id = typeof body?.id === 'string' ? body.id : '';
  const duree = body?.duree === '' || body?.duree === undefined || body?.duree === null ? null : Number(body.duree);

  try {
    let resultat: Resultat;
    switch (action) {
      case 'add-module':
        resultat = await ajouterModule(db, id, String(body?.titre ?? ''), String(body?.resume ?? ''));
        break;
      case 'update-module':
        resultat = await modifierModule(db, id, String(body?.titre ?? ''), String(body?.resume ?? ''));
        break;
      case 'delete-module':
        resultat = await supprimerModule(db, id);
        break;
      case 'move-module':
        resultat = await deplacerModule(db, id, body?.sens === 'bas' ? 'bas' : 'haut');
        break;
      case 'add-lesson':
        resultat = await ajouterLecon(db, id, String(body?.titre ?? ''), String(body?.type ?? 'video'), duree, String(body?.ressource ?? ''), String(body?.contenu ?? ''));
        break;
      case 'update-lesson':
        resultat = await modifierLecon(db, id, String(body?.titre ?? ''), String(body?.type ?? 'video'), duree, String(body?.ressource ?? ''), String(body?.contenu ?? ''));
        break;
      case 'delete-lesson':
        resultat = await supprimerLecon(db, id);
        break;
      case 'move-lesson':
        resultat = await deplacerLecon(db, id, body?.sens === 'bas' ? 'bas' : 'haut');
        break;
      default:
        return jsonNoStore({ ok: false, erreur: 'action_inconnue' }, 400);
    }
    if (resultat.ok)
      await enregistrerEvenement(db, {
        actorId: reel.id,
        action: 'contenu-structure',
        detail: `${action} · ${id}`,
      });
    return jsonNoStore(resultat, resultat.ok ? 200 : 400);
  } catch {
    return jsonNoStore({ ok: false, erreur: 'unavailable' }, 503);
  }
}
