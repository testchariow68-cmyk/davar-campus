/**
 * CÔTÉ APPAREIL — ce que le téléphone ou l'ordinateur sait faire, et rien d'autre.
 *
 * Ce fichier ne manipule AUCUNE donnée biométrique : il demande simplement à
 * l'appareil s'il sait vérifier une identité, et il convertit les octets en
 * texte pour les envoyer au serveur. L'empreinte et le visage restent dans
 * l'appareil, où le système les garde déjà.
 */

export function base64urlVersOctets(valeur: string): Uint8Array<ArrayBuffer> {
  const normalisee = valeur.replace(/-/g, '+').replace(/_/g, '/');
  const bourrage = normalisee.length % 4 === 0 ? '' : '='.repeat(4 - (normalisee.length % 4));
  const binaire = atob(normalisee + bourrage);
  const octets = new Uint8Array(new ArrayBuffer(binaire.length));
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

export function octetsVersBase64url(octets: ArrayBuffer | Uint8Array): string {
  const vue = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let binaire = '';
  for (const octet of vue) binaire += String.fromCharCode(octet);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Le nom de l'appareil, tel que le prototype l'annonce à la personne. */
export function nomAppareil(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone/iPad (iOS)';
  if (/Android/i.test(ua)) return /Tablet|SM-T|GT-P/i.test(ua) ? 'tablette Android' : 'téléphone Android';
  if (/Windows/i.test(ua)) return 'PC Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'Mac (Apple)';
  if (/Linux/i.test(ua)) return 'machine Linux';
  return 'cet appareil';
}

export type Capacite = { api: boolean; authentifie: boolean };

/**
 * Détection en deux temps, comme le prototype : d'abord le navigateur expose-t-il
 * la porte biométrique, ensuite l'appareil a-t-il une empreinte ou un visage
 * réellement inscrit.
 */
export async function capacite(): Promise<Capacite> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials)
    return { api: false, authentifie: false };
  let authentifie = false;
  try {
    authentifie = !!(await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    authentifie = false;
  }
  return { api: true, authentifie };
}

/**
 * Les comptes dont CET appareil garde une empreinte. Le prototype retient
 * cette liste sur l'appareil : c'est ce qui permet d'afficher le bouton de
 * connexion sans demander qui l'on est.
 */
export function comptesDeCetAppareil(): string[] {
  try {
    const brut = localStorage.getItem('davar_fp') ?? '[]';
    const liste = JSON.parse(brut);
    return Array.isArray(liste) ? liste.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function retenirCompte(userId: string, actif: boolean): void {
  try {
    const liste = comptesDeCetAppareil().filter((id) => id !== userId);
    if (actif) liste.push(userId);
    localStorage.setItem('davar_fp', JSON.stringify(liste));
  } catch {
    /* stockage refusé : le bouton ne s'affichera pas au prochain passage */
  }
}
