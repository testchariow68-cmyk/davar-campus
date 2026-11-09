import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { enregistrerEvenement } from '@/lib/server/journal';
import {
  ajouterChapitre,
  ajouterLecon,
  ajouterModule,
  ajouterRessource,
  deplacerChapitre,
  deplacerLecon,
  deplacerModule,
  modifierChapitre,
  modifierLecon,
  modifierModule,
  modifierRessource,
  supprimerChapitre,
  supprimerLecon,
  supprimerModule,
  supprimerRessource,
  type Resultat,
} from '@/lib/server/direction';

export const dynamic = 'force-dynamic';

/** Construire la structure d'une formation : chapitres, modules et leçons. Propriétaire uniquement. */
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
      case 'add-chapter':
        resultat = await ajouterChapitre(db, id, String(body?.titre ?? ''), String(body?.resume ?? ''));
        break;
      case 'update-chapter':
        resultat = await modifierChapitre(db, id, String(body?.titre ?? ''), String(body?.resume ?? ''));
        break;
      case 'delete-chapter':
        resultat = await supprimerChapitre(db, id);
        break;
      case 'move-chapter':
        resultat = await deplacerChapitre(db, id, body?.sens === 'bas' ? 'bas' : 'haut');
        break;
      case 'add-module':
        // `id` est la formation ; `chapitre` désigne le chapitre qui reçoit le module.
        resultat = await ajouterModule(
          db,
          id,
          String(body?.titre ?? ''),
          String(body?.resume ?? ''),
          typeof body?.chapitre === 'string' ? body.chapitre : null
        );
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
        resultat = await ajouterLecon(db, id, String(body?.titre ?? ''), String(body?.type ?? 'video'), duree, String(body?.ressource ?? ''), String(body?.contenu ?? ''), String(body?.ratio ?? ''));
        break;
      case 'update-lesson':
        resultat = await modifierLecon(db, id, String(body?.titre ?? ''), String(body?.type ?? 'video'), duree, String(body?.ressource ?? ''), String(body?.contenu ?? ''), String(body?.ratio ?? ''));
        break;
      case 'add-asset':
        resultat = await ajouterRessource(db, id, {
          kind: String(body?.genre ?? 'ressource'),
          title: String(body?.titre ?? ''),
          type: String(body?.type ?? 'autre'),
          url: String(body?.url ?? ''),
          duration: String(body?.duree ?? ''),
          ratio: String(body?.ratio ?? '16:9'),
          size: String(body?.taille ?? ''),
        });
        break;
      case 'update-asset':
        resultat = await modifierRessource(db, id, {
          title: String(body?.titre ?? ''),
          type: String(body?.type ?? 'autre'),
          url: String(body?.url ?? ''),
          duration: String(body?.duree ?? ''),
          ratio: String(body?.ratio ?? '16:9'),
          size: String(body?.taille ?? ''),
        });
        break;
      case 'delete-asset':
        resultat = await supprimerRessource(db, id);
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
