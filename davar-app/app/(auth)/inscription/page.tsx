import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/SignupForm';
import { currentUser } from '@/lib/server/auth';
import { mailerConfigured } from '@/lib/server/mailer';
import { openDb } from '@/lib/server/turso';
import { isDevelopment } from '@/lib/server/auth';

export const metadata = { title: 'Inscription — Davar Académie Campus' };
export const dynamic = 'force-dynamic';

export default async function InscriptionPage() {
  if (await currentUser()) redirect('/campus');

  let configured = true;
  try {
    await openDb();
  } catch {
    configured = false;
  }
  const emailFlowReady = mailerConfigured() || isDevelopment();

  return (
    <div className="login-glass">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lg-logo" src="/campus-icon.png" alt="DAVAR ACADÉMIE CAMPUS" />
      <div className="gcard">
        <h1>Créer mon accès</h1>
        <p>
          Utilisez l’adresse e-mail de votre achat Chariow : la formation achetée est
          rattachée automatiquement au compte après confirmation de l’adresse.
        </p>
        {!configured ? (
          <div className="banner warn" role="status">
            <span>Base non reliée sur ce serveur : l’inscription est fermée (voir <strong>MISE-EN-SERVICE.md</strong>).</span>
          </div>
        ) : !emailFlowReady ? (
          <div className="banner warn" role="status">
            <span>
              Inscriptions momentanément fermées : l’envoi des e-mails de confirmation n’est pas encore
              configuré. Aucun compte ne sera créé tant que cette étape n’est pas prête.
            </span>
          </div>
        ) : (
          <SignupForm />
        )}
        <Link href="/connexion" className="btn btn-ghost mt16">J’ai déjà un compte</Link>
      </div>
      <div className="gl-foot">© 2026 Davar Académie — Abidjan, Côte d’Ivoire</div>
    </div>
  );
}
