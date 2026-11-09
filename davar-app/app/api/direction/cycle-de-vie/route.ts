import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { enregistrerEvenement } from '@/lib/server/journal';
import { motDePasseProprietaireValide } from '@/lib/server/exports';
import {
  CLE_CYCLE_ACTIF,
  deciderQuarantaine,
  etatCycleDeVie,
  executerCycleDeVie,
  journalDePurge,
} from '@/lib/server/cycle-de-vie';
import { ecrireReglages } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/** La phrase exacte, comme pour les scripts de production : on ne purge pas par accident. */
export const PHRASE_PURGE = 'PURGER';

/**
 * CYCLE DE VIE — l'état se consulte librement ; l'exécution exige le mot de passe
 * du propriétaire ET la phrase de confirmation. Aucune purge ne part jamais
 * toute seule : c'est une décision du propriétaire, prise à la main.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const motDePasse = typeof body?.motDePasse === 'string' ? body.motDePasse : '';

  try {
    if (action === 'etat') {
      return jsonNoStore({ ok: true, rapport: await etatCycleDeVie(db), journal: await journalDePurge(db) });
    }

    if (action === 'actif') {
      const valeur = body?.actif === true ? '1' : '0';
      await ecrireReglages(db, { [CLE_CYCLE_ACTIF]: valeur });
      return jsonNoStore({
        ok: true,
        message:
          valeur === '1'
            ? 'Le passage périodique est autorisé. Rien ne partira sans votre geste.'
            : 'Passage périodique en pause : rien ne se déclenche tout seul.',
      });
    }

    const gestes = action === 'passage' || action === 'quarantaine';
    if (gestes) {
      const valide = await motDePasseProprietaireValide(db, reel.id, motDePasse).catch(() => false);
      if (!valide)
        return jsonNoStore({ error: 'mot_de_passe_requis', message: 'Mot de passe incorrect : rien n’a été purgé.' }, 403);
    }

    if (action === 'passage') {
      const phrase = typeof body?.phrase === 'string' ? body.phrase.trim() : '';
      if (phrase !== PHRASE_PURGE)
        return jsonNoStore(
          { error: 'phrase_absente', message: `Recopiez exactement « ${PHRASE_PURGE} » pour confirmer. Rien n’a été purgé.` },
          400
        );
      const resultat = await executerCycleDeVie(db, { appliquer: true, acteur: reel.id });
      await enregistrerEvenement(db, { actorId: reel.id, action: 'cycle-de-vie', detail: 'passage appliqué' });
      return jsonNoStore({
        ok: true,
        rapport: resultat.rapport,
        journal: resultat.journal,
        message: 'Passage effectué. Chaque geste est inscrit au journal ci-dessous.',
      });
    }

    if (action === 'quarantaine') {
      const userId = String(body?.userId ?? '');
      const decision = String(body?.decision ?? '') as 'suspendre' | 'reprendre' | 'annuler';
      if (!['suspendre', 'reprendre', 'annuler'].includes(decision)) return jsonNoStore({ error: 'decision_inconnue' }, 400);
      const reussie = await deciderQuarantaine(db, userId, decision);
      return jsonNoStore({
        ok: reussie,
        rapport: await etatCycleDeVie(db),
        journal: await journalDePurge(db),
        message: reussie ? 'Décision enregistrée.' : 'Aucune quarantaine ouverte pour ce compte.',
      });
    }

    return jsonNoStore({ error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
