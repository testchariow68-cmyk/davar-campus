import { type NextRequest, NextResponse } from 'next/server';

/**
 * Verrou d'entrée à coût nul pour /campus : sans cookie de session, inutile
 * d'ouvrir une connexion base. La validation réelle du jeton (haché, expirant)
 * reste faite côté serveur dans app/campus/layout.tsx et dans les routes API.
 */
export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/campus')) {
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

export const config = { matcher: ['/campus/:path*'] };
