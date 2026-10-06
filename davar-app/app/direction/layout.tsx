import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { NavDirection } from '@/components/direction/NavDirection';
import { currentSession } from '@/lib/server/auth';
import { sessionProprietaire } from '@/lib/server/direction-access';

export const dynamic = 'force-dynamic';

/**
 * L'Espace Direction est réservé au propriétaire. Le contrôle est fait ici, côté
 * serveur : un membre du staff qui taperait l'adresse ne verrait rien.
 */
export default async function DirectionLayout({ children }: { children: React.ReactNode }) {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) {
    const quelquun = await currentSession();
    if (!quelquun) redirect('/connexion');
    return (
      <div className="container" style={{ paddingTop: 40, paddingBottom: 56, maxWidth: 720 }}>
        <div className="card card-pad">
          <h2 className="mb8">Espace réservé au propriétaire</h2>
          <p className="small muted mb16">
            Votre compte est bien connecté, mais la direction de la plateforme est réservée au propriétaire unique de DAVAR
            ACADÉMIE. Si c&apos;est vous et que ce message vous surprend, demandez la vérification du rôle de votre compte.
          </p>
          <Link href="/campus" className="btn btn-primary">
            Revenir à mon campus
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 56 }}>
      <header className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <Link href="/direction" style={{ textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-structure.png" alt="Davar Académie" className="brand-img" />
          </Link>
          <span className="badge" style={{ background: 'var(--violet-soft)', color: 'var(--violet-deep)' }}>
            Direction
          </span>
        </div>
        <nav className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="small muted">{proprietaire.user.displayName}</span>
          <Link href="/campus" className="btn btn-ghost">
            Mon campus
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <div className="mt16 mb16">
        <NavDirection />
      </div>

      <main>{children}</main>
    </div>
  );
}
