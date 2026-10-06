import { type NextRequest, NextResponse } from 'next/server';

/**
 * Protection temporaire du nouveau parcours Turso. Tant que l'auth serveur
 * n'est pas implémentée et auditée, l'accès campus est REFUSÉ par défaut.
 * Ne pas réactiver le proxy Supabase obsolète pour contourner ce verrou.
 */
export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/campus')) {
    const dest = request.nextUrl.clone();
    dest.pathname = '/connexion';
    return NextResponse.redirect(dest);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/campus/:path*'] };
