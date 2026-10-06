import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { currentSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * Verrou serveur : la session est validée en base (jeton haché) à chaque requête.
 * Aucune donnée de formation n'est rendue avant cette vérification.
 */
export default async function CampusLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect('/connexion');

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 56 }}>
      <header className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <Link href="/campus" className="brand" style={{ textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-structure.png" alt="Davar Académie" className="brand-img" />
        </Link>
        <nav className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="small muted">{session.user.displayName}</span>
          <Link href="/" className="btn btn-ghost">Catalogue</Link>
          <LogoutButton />
        </nav>
      </header>
      <main className="mt16">{children}</main>
    </div>
  );
}
