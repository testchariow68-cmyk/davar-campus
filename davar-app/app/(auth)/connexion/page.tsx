import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { currentUser } from '@/lib/server/auth';
import { openDb } from '@/lib/server/turso';

export const metadata = { title: 'Connexion — Davar Académie Campus' };
export const dynamic = 'force-dynamic';

export default async function ConnexionPage() {
  if (await currentUser()) redirect('/campus');

  let configured = true;
  try {
    await openDb();
  } catch {
    configured = false;
  }

  return (
    <div className="login-glass">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lg-logo" src="/campus-icon.png" alt="DAVAR ACADÉMIE CAMPUS" />
      <div className="gcard">
        <h1>DAVAR ACADÉMIE CAMPUS</h1>
        <p>Connectez-vous pour retrouver vos formations.</p>
        {configured ? (
          <LoginForm />
        ) : (
          <div className="banner warn mt16" role="status">
            <span>
              Le campus n’est pas encore relié à sa base : la connexion est fermée sur ce serveur.
              Renseignez les variables Turso (voir <strong>MISE-EN-SERVICE.md</strong>).
            </span>
          </div>
        )}
        <Link href="/" className="btn btn-ghost mt16">Retour au catalogue</Link>
      </div>
      <div className="gl-foot">© 2026 Davar Académie — Abidjan, Côte d’Ivoire</div>
    </div>
  );
}
