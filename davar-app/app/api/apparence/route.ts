import { apparenceChoisie } from '@/lib/server/apparence';
import { jsonNoStore } from '@/lib/server/http';
import { openDb } from '@/lib/server/turso';
import { PALETTES } from '@/lib/palette';

export const dynamic = 'force-dynamic';

/**
 * LA PALETTE DU CAMPUS — une seule information, sans aucun secret.
 *
 * Elle est demandée par le navigateur (jamais au rendu de la page) : la page
 * d'accueil reste donc statique, sans requête base pour un simple visiteur.
 * Le résultat peut être mis en cache quelques minutes sans inconvénient.
 */
export async function GET() {
  try {
    const db = await openDb();
    const apparence = await apparenceChoisie(db);
    return new Response(JSON.stringify({ palette: apparence.palette, couleurs: apparence.couleurs, palettes: PALETTES }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300',
      },
    });
  } catch {
    // Aucune base joignable (ou aucune configuration) : la signature DAVAR suffit.
    return jsonNoStore({ palette: 'violet', couleurs: null, palettes: PALETTES });
  }
}
