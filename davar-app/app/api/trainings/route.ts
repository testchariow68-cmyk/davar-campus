import { getPublishedTrainings } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';

/**
 * Catalogue public en JSON, destiné au chargement CÔTÉ CLIENT.
 * La page qui l'affiche est ainsi servie en coquille statique (gratuite et
 * illimitée chez Cloudflare) au lieu d'engendrer un rendu serveur complet.
 * Cache 60 s par instance : une seule lecture Turso par minute et par instance.
 */
export async function GET() {
  try {
    const trainings = await getPublishedTrainings();
    return Response.json(
      { ok: true, trainings },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    );
  } catch {
    // Base non reliée : on le dit sans inventer de contenu.
    return Response.json({ ok: false, trainings: [] }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
