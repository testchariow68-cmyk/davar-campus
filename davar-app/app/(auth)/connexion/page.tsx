import Link from 'next/link';

export const metadata = { title: 'Connexion — Davar Académie Campus' };

/** Verrou provisoire : aucun compte Supabase ni session factice n'est accepté. */
export default function ConnexionPage() {
  return (
    <div className="login-glass">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lg-logo" src="/campus-icon.png" alt="DAVAR ACADÉMIE CAMPUS" />
      <div className="gcard">
        <h1>DAVAR ACADÉMIE CAMPUS</h1>
        <p>Connexion en cours de mise en service sur Turso.</p>
        <div className="banner info mt16">
          Aucun compte réel ne peut encore être créé ou utilisé dans cette version.
          Le parcours sécurisé sera activé après les tests et la validation du lancement.
        </div>
        <Link href="/" className="btn btn-ghost mt16">Retour</Link>
      </div>
      <div className="gl-foot">© 2026 Davar Académie — Abidjan, Côte d’Ivoire</div>
    </div>
  );
}
