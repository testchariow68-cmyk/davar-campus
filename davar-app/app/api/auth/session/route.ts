import { currentUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * État de session minimal, pour que les coquilles statiques puissent adapter
 * leur barre de navigation sans rendu serveur. Aucune donnée de cours ici.
 * Sans cookie de session, aucune requête base n'est effectuée.
 */
export async function GET(request: Request) {
  const hasCookie = (request.headers.get('cookie') ?? '').includes('davar_session=');
  if (!hasCookie) return Response.json({ authenticated: false }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const user = await currentUser();
    return Response.json(
      user ? { authenticated: true, displayName: user.displayName } : { authenticated: false },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return Response.json({ authenticated: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
