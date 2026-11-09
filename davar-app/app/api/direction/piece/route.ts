import { currentSession } from '@/lib/server/auth';
import { jsonNoStore } from '@/lib/server/http';
import { clePropre, stockagePret, urlLecture } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';

/**
 * OUVRIR UNE PIÈCE JOINTE — la capture envoyée par un étudiant au support.
 *
 * Réservé à l'équipe : un étudiant ne réclame pas l'adresse d'un fichier qui
 * n'est pas le sien. L'adresse est signée et ne vit que cinq minutes.
 */
export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);
  if (session.reel.role === 'student') return jsonNoStore({ error: 'interdit' }, 403);

  let cle = '';
  try {
    const body = (await request.json()) as { cle?: unknown };
    if (typeof body?.cle === 'string') cle = body.cle;
  } catch {
    return jsonNoStore({ error: 'invalid_input' }, 400);
  }
  const propre = clePropre(cle.slice(0, 400));
  if (!propre || !propre.startsWith('support/')) return jsonNoStore({ error: 'cle_invalide' }, 400);
  if (!stockagePret()) return jsonNoStore({ error: 'stockage_non_relie' }, 503);

  const adresse = await urlLecture(propre, 300);
  if (!adresse) return jsonNoStore({ error: 'stockage_non_relie' }, 503);
  return jsonNoStore({ ok: true, url: adresse });
}
