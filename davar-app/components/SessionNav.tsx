'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Barre de navigation adaptée à la session, calculée CÔTÉ CLIENT pour que la
 * page qui la contient reste statique. Sans session, l'état par défaut est
 * celui d'un visiteur : aucune information n'est présumée.
 */
export function SessionNav() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/auth/session', { headers: { accept: 'application/json' } });
        const payload = (await response.json().catch(() => null)) as { authenticated?: boolean } | null;
        if (!cancelled) setAuthenticated(Boolean(payload?.authenticated));
      } catch {
        /* visiteur par défaut */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authenticated)
    return (
      <nav className="row" style={{ gap: 8 }}>
        <Link href="/campus" className="btn btn-primary">Mon campus</Link>
      </nav>
    );

  return (
    <nav className="row" style={{ gap: 8 }}>
      <Link href="/connexion" className="btn">Se connecter</Link>
      <Link href="/inscription" className="btn btn-primary">Créer mon accès</Link>
    </nav>
  );
}
