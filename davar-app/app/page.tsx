import PageConnexion from './(auth)/connexion/page';

/**
 * ACCUEIL = PAGE DE CONNEXION.
 *
 * Le prototype n'a PAS de page d'accueil. Son routeur (js/app.js, lignes 17 a
 * 20) envoie tout visiteur non connecte directement sur la page de connexion,
 * quelle que soit l'adresse demandee. Une page « Campus prive » avait ete
 * ajoutee ici : elle n'existe nulle part dans le prototype, elle est donc
 * supprimee. Le campus en ligne est le jumeau du prototype, sans ajout.
 */
export const metadata = { title: 'Connexion — Davar Académie Campus' };
export const dynamic = 'force-dynamic';

export default PageConnexion;
