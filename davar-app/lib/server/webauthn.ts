/**
 * LECTURE DES RÉPONSES DE L'APPAREIL — CBOR, COSE, et rien de plus.
 *
 * Quand un téléphone ou un ordinateur enregistre une empreinte (ou un visage),
 * il répond deux blocs d'octets : `clientDataJSON` (du JSON) et
 * `attestationObject` ou `authenticatorData` (du CBOR). Il faut savoir les lire
 * pour vérifier que la réponse vient bien de l'appareil attendu, et pour en
 * tirer la clé publique — la SEULE chose que la plateforme garde.
 *
 * Ce fichier ne dépend d'aucune bibliothèque : un décodeur CBOR restreint aux
 * types que produisent les appareils (entiers, octets, textes, tableaux,
 * objets, étiquettes), et l'extraction de la clé publique.
 */

export function base64urlVersOctets(valeur: string): Uint8Array {
  const normalisee = valeur.replace(/-/g, '+').replace(/_/g, '/');
  const bourrage = normalisee.length % 4 === 0 ? '' : '='.repeat(4 - (normalisee.length % 4));
  const binaire = atob(normalisee + bourrage);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

export function octetsVersBase64url(octets: Uint8Array): string {
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type Lecture = { valeur: unknown; position: number };

function lireEntier(octets: Uint8Array, position: number, infos: number): { valeur: number; position: number } {
  if (infos < 24) return { valeur: infos, position };
  if (infos === 24) return { valeur: octets[position], position: position + 1 };
  if (infos === 25) {
    return { valeur: (octets[position] << 8) | octets[position + 1], position: position + 2 };
  }
  if (infos === 26) {
    const vue = new DataView(octets.buffer, octets.byteOffset + position, 4);
    return { valeur: vue.getUint32(0), position: position + 4 };
  }
  if (infos === 27) {
    const vue = new DataView(octets.buffer, octets.byteOffset + position, 8);
    const haut = vue.getUint32(0);
    const bas = vue.getUint32(4);
    return { valeur: haut * 2 ** 32 + bas, position: position + 8 };
  }
  throw new Error('cbor_illisible');
}

function lire(octets: Uint8Array, position: number): Lecture {
  if (position >= octets.length) throw new Error('cbor_tronque');
  const premier = octets[position];
  const type = premier >> 5;
  const infos = premier & 0x1f;
  let curseur = position + 1;

  if (type === 7) {
    // Réels et booléens : aucun ne nous sert. On avance, et on rend null.
    if (infos === 25) return { valeur: null, position: curseur + 2 };
    if (infos === 26) return { valeur: null, position: curseur + 4 };
    if (infos === 27) return { valeur: null, position: curseur + 8 };
    return { valeur: null, position: curseur };
  }

  const entier = lireEntier(octets, curseur, infos);
  const longueur = entier.valeur;
  curseur = entier.position;

  switch (type) {
    case 0:
      return { valeur: longueur, position: curseur };
    case 1:
      return { valeur: -1 - longueur, position: curseur };
    case 2:
      return { valeur: octets.slice(curseur, curseur + longueur), position: curseur + longueur };
    case 3:
      return {
        valeur: new TextDecoder().decode(octets.slice(curseur, curseur + longueur)),
        position: curseur + longueur,
      };
    case 4: {
      const liste: unknown[] = [];
      let p = curseur;
      for (let i = 0; i < longueur; i += 1) {
        const lu = lire(octets, p);
        liste.push(lu.valeur);
        p = lu.position;
      }
      return { valeur: liste, position: p };
    }
    case 5: {
      const objet = new Map<unknown, unknown>();
      let p = curseur;
      for (let i = 0; i < longueur; i += 1) {
        const cle = lire(octets, p);
        const valeur = lire(octets, cle.position);
        objet.set(cle.valeur, valeur.valeur);
        p = valeur.position;
      }
      return { valeur: objet, position: p };
    }
    case 6: {
      // Étiquette : on garde la valeur étiquetée, l'étiquette ne nous sert pas.
      return lire(octets, curseur);
    }
    default:
      throw new Error('cbor_illisible');
  }
}

/** Décode un bloc CBOR. `null` si le bloc est illisible. */
export function decoderCbor(octets: Uint8Array): unknown {
  try {
    const lu = lire(octets, 0);
    return lu.valeur;
  } catch {
    return null;
  }
}

export type ClePublique = { algorithme: number; x: Uint8Array; y: Uint8Array };

/**
 * Extrait la clé publique d'un bloc COSE (la courbe P-256, algorithme ES256).
 * C'est la seule courbe acceptée : tous les téléphones et ordinateurs récents
 * la parlent, et elle est vérifiable sans dépendance.
 */
export function extraireClePublique(cose: Uint8Array): ClePublique | null {
  const decode = decoderCbor(cose);
  if (!(decode instanceof Map)) return null;
  const kty = decode.get(1);
  const algorithme = decode.get(3);
  const courbe = decode.get(-1);
  const x = decode.get(-2);
  const y = decode.get(-3);
  if (kty !== 2 || courbe !== 1 || algorithme !== -7) return null;
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) return null;
  if (x.length !== 32 || y.length !== 32) return null;
  return { algorithme: -7, x, y };
}

/** Importe une clé publique P-256 pour vérification (jamais pour signer). */
export async function cleDeVerification(cle: ClePublique): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: octetsVersBase64url(cle.x),
      y: octetsVersBase64url(cle.y),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
}

export type DonneesAuthentifiant = {
  /** L'empreinte de l'adresse du site : prouve que la clé a été créée ICI. */
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  /** Présent uniquement à l'enregistrement : la clé que l'appareil propose. */
  attestation?: { credentialId: Uint8Array; clePubliqueCose: Uint8Array };
};

export function lireAuthenticatorData(octets: Uint8Array): DonneesAuthentifiant | null {
  if (octets.length < 37) return null;
  const rpIdHash = octets.slice(0, 32);
  const flags = octets[32];
  const vue = new DataView(octets.buffer, octets.byteOffset + 33, 4);
  const signCount = vue.getUint32(0);
  const donnees: DonneesAuthentifiant = { rpIdHash, flags, signCount };

  // Bit 0x40 : des données d'attestation suivent (une clé vient d'être créée).
  if (flags & 0x40) {
    if (octets.length < 55) return null;
    let p = 37 + 16; // aaguid
    const longueurId = (octets[p] << 8) | octets[p + 1];
    p += 2;
    if (octets.length < p + longueurId) return null;
    const credentialId = octets.slice(p, p + longueurId);
    p += longueurId;
    const clePubliqueCose = octets.slice(p);
    donnees.attestation = { credentialId, clePubliqueCose };
  }
  return donnees;
}

/** Bit 0x01 : une personne a bien posé le doigt (ou le regard). */
export function presenceConfirmee(flags: number): boolean {
  return (flags & 0x01) === 0x01;
}

/** Bit 0x04 : l'appareil a VÉRIFIÉ l'identité, il ne s'agit pas d'un simple contact. */
export function identiteVerifiee(flags: number): boolean {
  return (flags & 0x04) === 0x04;
}

export async function empreinteSha256(octets: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', octets as unknown as ArrayBuffer);
  return new Uint8Array(digest);
}

export function concatener(...morceaux: Uint8Array[]): Uint8Array {
  const total = morceaux.reduce((somme, morceau) => somme + morceau.length, 0);
  const resultat = new Uint8Array(total);
  let p = 0;
  for (const morceau of morceaux) {
    resultat.set(morceau, p);
    p += morceau.length;
  }
  return resultat;
}

/**
 * Vérifie la signature d'une réponse : les données signées sont
 * `authenticatorData` suivies de l'empreinte de `clientDataJSON`. C'est cette
 * vérification — et elle seule — qui prouve que l'appareil est bien celui qui
 * a été enregistré.
 */
export async function verifierSignature(
  cle: ClePublique,
  signature: Uint8Array,
  authenticatorData: Uint8Array,
  clientDataJSON: Uint8Array
): Promise<boolean> {
  const donnees = concatener(authenticatorData, await empreinteSha256(clientDataJSON));
  const cleCrypto = await cleDeVerification(cle);
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    cleCrypto,
    signature as unknown as ArrayBuffer,
    donnees as unknown as ArrayBuffer
  );
}

/** compare deux blocs d'octets sans fuir leur contenu par le temps d'exécution. */
export function octetsEgaux(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i += 1) ecart |= a[i] ^ b[i];
  return ecart === 0;
}
