import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { enregistrerEvenement } from '@/lib/server/journal';
import {
  ajouterMotivations,
  envoyerMotivation,
  lireMotivations,
  remplacerListe,
  retirerMotivation,
} from '@/lib/server/motivations';

export const dynamic = 'force-dynamic';

/** MOTIVATIONS — le stock du propriétaire, et l'envoi du dimanche, à la main. */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const texte = typeof body?.texte === 'string' ? body.texte : '';

  try {
    if (action === 'etat') return jsonNoStore({ ok: true, etat: await lireMotivations(db) });

    if (action === 'ajouter') {
      const resultat = await ajouterMotivations(db, texte);
      if (!resultat.ok) {
        const message = resultat.erreur.startsWith('numeros_deja_utilises')
          ? `Numéros déjà utilisés : ${resultat.erreur.split(':')[1]}. Choisissez d’autres numéros.`
          : 'Collez au moins une motivation.';
        return jsonNoStore({ ok: false, erreur: resultat.erreur, message, etat: await lireMotivations(db) }, 400);
      }
      return jsonNoStore({
        ok: true,
        message: `${resultat.ajoutees} motivation(s) ajoutée(s) — stock numéroté jusqu’à ${resultat.total}.`,
        etat: await lireMotivations(db),
      });
    }

    if (action === 'retirer') {
      const numero = Number(body?.numero);
      const reussie = await retirerMotivation(db, Number.isFinite(numero) ? Math.trunc(numero) : 0);
      return jsonNoStore({
        ok: reussie,
        message: reussie ? 'Motivation retirée — la numérotation a été recalée.' : 'Cette motivation n’existe plus.',
        etat: await lireMotivations(db),
      });
    }

    if (action === 'remplacer') {
      const resultat = await remplacerListe(db, texte);
      if (!resultat.ok) return jsonNoStore({ ok: false, erreur: 'liste_vide', message: 'Collez au moins une motivation.' }, 400);
      return jsonNoStore({
        ok: true,
        message: resultat.active
          ? `Nouvelle liste active : ${resultat.total} motivation(s).`
          : `Liste suivante enregistrée (${resultat.total}) — elle prendra le relais quand la liste en cours sera épuisée.`,
        etat: await lireMotivations(db),
      });
    }

    if (action === 'envoyer') {
      const resultat = await envoyerMotivation(db);
      if (resultat.ok)
        await enregistrerEvenement(db, { actorId: reel.id, action: 'motivation-envoyee', detail: resultat.message });
      return jsonNoStore(
        {
          ok: resultat.ok,
          message: resultat.message,
          etat: await lireMotivations(db),
        },
        resultat.ok ? 200 : 400
      );
    }

    return jsonNoStore({ ok: false, erreur: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ ok: false, erreur: 'unavailable' }, 503);
  }
}
