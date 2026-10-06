import { CatalogClient } from '@/components/CatalogClient';
import { SessionNav } from '@/components/SessionNav';

export const metadata = { title: 'Formations — Davar Académie Campus' };

/**
 * Coquille STATIQUE : aucun accès base ni cookie au rendu, donc aucune
 * invocation de Worker pour l'affichage (assets statiques gratuits et
 * illimités). Le catalogue et l'état de session arrivent par de petites
 * réponses JSON, demandées par le navigateur de l'étudiant.
 */
export default function Home() {
  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 48 }}>
      <header className="row between" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-structure.png" alt="Davar Académie" className="brand-img" />
        </div>
        <SessionNav />
      </header>
      <CatalogClient />
    </main>
  );
}
