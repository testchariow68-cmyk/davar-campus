import { redirect } from 'next/navigation';

/**
 * Verrou serveur en plus du proxy. Le campus ne sera ouvert qu'après
 * authentification Turso, contrôle des rôles et tests end-to-end.
 */
export default function CampusLayout({children}: {children: React.ReactNode}) {
  void children;
  redirect('/connexion');
}
