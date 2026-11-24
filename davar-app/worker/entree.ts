/**
 * L'ENTRÉE DU WORKER — les requêtes, et le robot du dimanche.
 *
 * Toutes les requêtes passent par le gestionnaire du cadre (vinext). S'y
 * ajoute une seule chose : `scheduled`, la fonction que Cloudflare appelle
 * toute seule à l'heure dite. C'est elle qui rend la motivation du dimanche
 * réellement automatique, et qui pousse les notifications en attente.
 *
 * Rien n'est importé ici qui dépende de Next.js : le robot tourne sans requête,
 * sans cookie et sans session.
 */
import vinext from 'vinext/server/fetch-handler';
import { openDb } from '../lib/server/turso.ts';
import { tachesPlanifiees } from '../lib/server/planificateur.ts';

type Environnement = Record<string, string | undefined>;
/** Le minimum du contrat Workers, écrit ici : ce fichier est compilé sans les types Cloudflare. */
type ExecutionContext = { waitUntil(promesse: Promise<unknown>): void };

async function robot(): Promise<void> {
  try {
    const db = await openDb();
    const rapport = await tachesPlanifiees(db);
    console.log(
      `[robot] motivation ${rapport.motivation ? `n° ${rapport.motivation.numero} à ${rapport.motivation.envoyees} étudiant(s)` : 'pas dimanche'} · push ${rapport.push.envoyees} envoyée(s), ${rapport.push.abonnementsRetires} appareil(s) retiré(s)`
    );
  } catch (erreur) {
    // Une panne du robot ne doit jamais empêcher le campus de répondre : elle
    // est simplement consignée, et la passe suivante recommencera.
    console.error('[robot] passe interrompue :', erreur instanceof Error ? erreur.message : 'erreur inconnue');
  }
}

export default {
  fetch(request: Request, env: Environnement, ctx: ExecutionContext) {
    return vinext.fetch(request, env, ctx);
  },
  async scheduled(controleur: { cron: string; scheduledTime: number }, _env: Environnement, ctx: ExecutionContext) {
    ctx.waitUntil(robot());
  },
};
