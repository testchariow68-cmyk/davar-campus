import Link from 'next/link';

export const metadata = { title: 'Inscription — Davar Académie Campus' };

/** Verrou provisoire : pas d'inscription sans preuve d'achat et auth Turso. */
export default function InscriptionPage() {
  return (
    <div className="login-glass">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lg-logo" src="/campus-icon.png" alt="DAVAR ACADÉMIE CAMPUS" />
      <div className="gcard">
        <h1>Créer mon compte</h1>
        <p>L’inscription sera disponible après vérification sécurisée de l’achat
          et mise en service de l’authentification Turso.</p>
        <div className="banner info mt16">Aucun paiement ni accès à une formation n’est activé pour l’instant.</div>
        <Link href="/connexion" className="btn btn-ghost mt16">Retour à la connexion</Link>
      </div>
    </div>
  );
}
