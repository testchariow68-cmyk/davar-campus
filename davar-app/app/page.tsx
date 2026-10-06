import Link from 'next/link';
import { currentUser } from '@/lib/server/auth';
import { getPublishedTrainings } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Formations — Davar Académie Campus' };

/** Catalogue public : aucune session ni vente déduite de cette lecture. */
export default async function Home() {
  let trainings: Awaited<ReturnType<typeof getPublishedTrainings>> | null = null;
  try {
    trainings = await getPublishedTrainings();
  } catch {
    /* base/schéma non prêts : on le dit sans inventer de contenu */
  }
  const user = await currentUser();

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 48 }}>
      <header className="row between" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-structure.png" alt="Davar Académie" className="brand-img" />
        </div>
        <nav className="row" style={{ gap: 8 }}>
          {user ? (
            <Link href="/campus" className="btn btn-primary">Mon campus</Link>
          ) : (
            <>
              <Link href="/connexion" className="btn">Se connecter</Link>
              <Link href="/inscription" className="btn btn-primary">Créer mon accès</Link>
            </>
          )}
        </nav>
      </header>

      <section className="card card-pad mt16">
        <h1>Formations Davar Académie</h1>
        <p className="muted small">
          L’achat se fait sur notre boutique Chariow. L’accès au campus est ensuite ouvert
          automatiquement, dès que l’adresse e-mail du compte est confirmée — utilisez la même
          adresse que pour l’achat.
        </p>

        {trainings === null ? (
          <div className="banner warn mt16" role="status">
            <span>
              Le catalogue n’est pas disponible sur ce serveur : la base Turso n’est pas encore
              reliée. Aucune inscription ni paiement ne peut aboutir ici.
            </span>
          </div>
        ) : trainings.length === 0 ? (
          <p className="muted mt16">Aucune formation publiée pour le moment.</p>
        ) : (
          <div className="grid g2 mt16">
            {trainings.map((training) => (
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
      </section>
    </main>
  );
}
