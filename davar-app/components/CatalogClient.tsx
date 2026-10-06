'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Training = {
  id: string;
  title: string;
  priceCfa: number;
  description: string | null;
  buyUrl: string | null;
};

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; trainings: Training[] }
  | { status: 'unavailable' };

/**
 * Catalogue rendu CÔTÉ CLIENT : la page est servie en coquille statique
 * (assets gratuits et illimités chez Cloudflare) et n'invoque le serveur que
 * pour une petite réponse JSON — le quota de requêtes dynamiques est protégé.
 */
export function CatalogClient() {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' });
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/trainings', { headers: { accept: 'application/json' } });
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; trainings?: Training[] } | null;
        if (cancelled) return;
        if (!response.ok || !payload?.ok) setCatalog({ status: 'unavailable' });
        else setCatalog({ status: 'ready', trainings: payload.trainings ?? [] });
      } catch {
        if (!cancelled) setCatalog({ status: 'unavailable' });
      }
    })();
    (async () => {
      try {
        const response = await fetch('/api/auth/session', { headers: { accept: 'application/json' } });
        const payload = (await response.json().catch(() => null)) as { authenticated?: boolean } | null;
        if (!cancelled) setAuthenticated(Boolean(payload?.authenticated));
      } catch {
        if (!cancelled) setAuthenticated(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="card card-pad mt16">
      <h1>Formations Davar Académie</h1>
      <p className="muted small">
        L’achat se fait sur notre boutique Chariow. L’accès au campus est ensuite ouvert
        automatiquement, dès que l’adresse e-mail du compte est confirmée — utilisez la même
        adresse que pour l’achat.
      </p>

      {catalog.status === 'loading' && (
        <p className="muted mt16" role="status">Chargement du catalogue…</p>
      )}

      {catalog.status === 'unavailable' && (
        <div className="banner warn mt16" role="status">
          <span>
            Le catalogue n’est pas disponible sur ce serveur : la base Turso n’est pas encore
            reliée. Aucune inscription ni paiement ne peut aboutir ici.
          </span>
        </div>
      )}

      {catalog.status === 'ready' && catalog.trainings.length === 0 && (
        <p className="muted mt16">Aucune formation publiée pour le moment.</p>
      )}

      {catalog.status === 'ready' && catalog.trainings.length > 0 && (
        <div className="grid g2 mt16">
          {catalog.trainings.map((training) => (
            <article className="card card-pad" key={training.id}>
              <h2 style={{ fontSize: 18 }}>{training.title}</h2>
              {training.description && <p className="muted small">{training.description}</p>}
              <p style={{ fontWeight: 700 }}>{training.priceCfa.toLocaleString('fr-FR')} FCFA</p>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {training.buyUrl ? (
                  <a className="btn btn-primary" href={training.buyUrl} target="_blank" rel="noreferrer">
                    Acheter sur Chariow
                  </a>
                ) : (
                  <Link className="btn" href={`/formation/${training.id}`}>
                    Acheter cette formation
                  </Link>
                )}
                <Link className="btn btn-ghost" href="/inscription">J’ai déjà acheté</Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="banner info mt16">
        <span>
          Les paiements directement dans l’application (Flutterwave, MoneyFusion) ne sont pas
          encore activés : aucun encaissement n’est possible depuis ce site.
        </span>
      </div>

      {authenticated && (
        <div className="mt16">
          <Link href="/campus" className="btn btn-primary">Ouvrir mon campus</Link>
        </div>
      )}
    </section>
  );
}
