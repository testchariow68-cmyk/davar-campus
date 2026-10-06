/** Appels de l'Espace Direction depuis le navigateur. Aucun secret, aucune donnée en cache. */

export type Reponse = { ok: boolean; message?: string; erreur?: string };

const LISIBLES: Record<string, string> = {
  origin_refused: "Requête refusée : origine inconnue.",
  unauthenticated: 'Votre session a expiré : reconnectez-vous.',
  reserve_au_proprietaire: 'Cette action est réservée au propriétaire de la plateforme.',
  action_inconnue: 'Action inconnue.',
  identifiant_manquant: 'Identifiant manquant.',
  titre_invalide: 'Titre invalide (2 à 120 caractères).',
  prix_invalide: 'Prix invalide : un nombre entier de FCFA, sans décimale.',
  lien_non_https: "Un lien d'achat doit obligatoirement commencer par https://",
  ressource_non_https: "Une adresse de ressource doit obligatoirement commencer par https://",
  duree_invalide: 'Durée invalide : un nombre entier de minutes, entre 1 et 600.',
  identifiant_deja_pris: 'Une formation porte déjà ce nom : choisissez un titre légèrement différent.',
  formation_introuvable: 'Formation introuvable.',
  module_introuvable: 'Module introuvable.',
  lecon_introuvable: 'Leçon introuvable.',
  compte_introuvable: 'Aucun compte ne correspond à cette adresse.',
  role_inconnu: 'Rôle inconnu.',
  statut_inconnu: 'Statut inconnu.',
  aucun_acces: 'Cette personne n’a pas cet accès.',
  unavailable: 'La base a refusé l’opération pour le moment. Réessayez dans un instant.',
};

/** Transforme le code d'erreur en phrase lisible ; les messages explicatifs passent tels quels. */
export function messageDe(reponse: Reponse): string {
  if (reponse.ok) return reponse.message ?? 'Fait.';
  const brut = reponse.erreur ?? '';
  if (brut.includes(' : ')) return brut.charAt(0).toUpperCase() + brut.slice(1);
  return LISIBLES[brut] ?? `Opération impossible (${brut || 'raison inconnue'}).`;
}

export async function poster(url: string, corps: Record<string, unknown>): Promise<Reponse> {
  try {
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const donnees = (await reponse.json().catch(() => null)) as Reponse | null;
    return donnees ?? { ok: false, erreur: 'unavailable' };
  } catch {
    return { ok: false, erreur: 'unavailable' };
  }
}
