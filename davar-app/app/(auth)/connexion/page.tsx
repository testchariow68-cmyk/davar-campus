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
      {/* L'anneau de l'animation, sans les écritures, est tout en haut.
          Le slogan reste dessous avec un peu d'air avant la carte. */}
      <div className="lg-bloc">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lg-anneau" src="/campus-anneau.svg" alt="DAVAR ACADÉMIE CAMPUS" />
        <p className="lg-slogan">L’école de l’excellence oratoire</p>
      </div>
      <div className="gcard">
        <h1>DAVAR ACADÉMIE CAMPUS</h1>
        <p>Connectez-vous</p>
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
      </div>
      <div className="lg-pied">
        <div className="gl-foot">© 2026 Davar Académie — Abidjan, Côte d’Ivoire</div>
      </div>
    </div>
  );
}
