import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import {
  accorderAcces,
  definirRole,
  definirStatut,
  purgerContenu,
  retirerAcces,
  type Resultat,
} from '@/lib/server/direction';

export const dynamic = 'force-dynamic';

/** Équipe, étudiants et purge du contenu d'essai. Propriétaire uniquement. */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const email = typeof body?.email === 'string' ? body.email : '';
  const formation = typeof body?.formation === 'string' ? body.formation : '';

  try {
    let resultat: Resultat;
    switch (action) {
      case 'set-role':
        resultat = await definirRole(db, email, String(body?.role ?? ''));
        break;
      case 'grant-access':
        resultat = await accorderAcces(db, email, formation);
        break;
      case 'revoke-access':
        resultat = await retirerAcces(db, email, formation);
        break;
      case 'set-status':
        resultat = await definirStatut(db, email, String(body?.statut ?? ''));
        break;
      case 'purge-content':
        resultat = await purgerContenu(db, String(body?.confirmation ?? ''));
        break;
      default:
        return jsonNoStore({ ok: false, erreur: 'action_inconnue' }, 400);
    }
    return jsonNoStore(resultat, resultat.ok ? 200 : 400);
  } catch {
    return jsonNoStore({ ok: false, erreur: 'unavailable' }, 503);
  }
}
