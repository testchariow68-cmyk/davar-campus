import Link from 'next/link';
import { getPublishedTrainings } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Formations — Davar Académie Campus' };

/** Catalogue public : aucune session ou vente déduite de cette lecture. */
export default async function Home() {
  let trainings: Awaited<ReturnType<typeof getPublishedTrainings>> | null = null;
  try { trainings = await getPublishedTrainings(); } catch { /* base/schéma non prêts */ }
  return (
    <main className="container" style={{paddingTop: 40, paddingBottom: 48}}>
      <header className="row between" style={{flexWrap:'wrap',gap:16}}>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-structure.png" alt="Davar Académie" className="brand-img" />
        </div>
        <Link href="/connexion" className="btn btn-ghost">Mon campus</Link>
      </header>
      <section className="card card-pad mt16">
        <h1>Formations Davar Académie</h1>
        {trainings === null ? (
          <div className="banner info mt16">Le catalogue n’est pas encore disponible. Aucune inscription ou paiement ne peut être effectué ici.</div>
        ) : trainings.length === 0 ? (
          <p className="muted mt16">Aucune formation publiée pour le moment.</p>
        ) : (
          <div className="grid g2 mt16">
            {trainings.map((training) => (
              <article className="card card-pad" key={training.id}>
                <h2 style={{fontSize:18}}>{training.title}</h2>
                <p className="muted">{training.priceCfa.toLocaleString('fr-FR')} FCFA</p>
                <p className="small">Les inscriptions et les paiements ne sont pas encore ouverts.</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
