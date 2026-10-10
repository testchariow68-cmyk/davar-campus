import { type NextRequest, NextResponse } from 'next/server';

/**
 * Verrou d'entrée à coût nul pour /campus et /direction : sans cookie de session,
 * inutile d'ouvrir une connexion base. La validation réelle du jeton (haché,
 * expirant) et du rôle reste faite côté serveur dans les layouts et les routes API.
 */
export default function proxy(request: NextRequest) {
  const protege = request.nextUrl.pathname.startsWith('/campus') || request.nextUrl.pathname.startsWith('/direction');
  if (protege) {
    const hasSessionCookie = Boolean(request.cookies.get('davar_session')?.value);
    if (!hasSessionCookie) {
      const dest = request.nextUrl.clone();
      dest.pathname = '/connexion';
      dest.search = '';
      return NextResponse.redirect(dest);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ['/campus/:path*', '/direction/:path*'] };
