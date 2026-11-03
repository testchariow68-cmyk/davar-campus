/**
 * LA CONNEXION PAR EMPREINTE — `toggleWebauthn()` du prototype, mais vérifiable.
 *
 * Le prototype se contentait de retenir, sur l'appareil, qu'une empreinte avait
 * été enregistrée. En ligne, cela voudrait dire ouvrir une porte sur un simple
 * identifiant : n'importe qui pourrait se faire passer pour n'importe qui. On
 * garde donc le même geste, le même interrupteur et les mêmes phrases, mais la
 * vérification est réelle :
 *
 *   - le serveur tire un DÉFI aléatoire à usage unique, qui périt en cinq
 *     minutes et ne sert qu'une fois ;
 *   - l'appareil signe ce défi avec une clé qu'il ne laisse jamais partir ;
 *   - le serveur vérifie la signature avec la clé PUBLIQUE, et seulement alors
 *     il ouvre la session.
 *
 * Ce que la plateforme conserve : une clé publique et un compteur. Jamais
 * l'empreinte, jamais le visage — ils ne quittent pas l'appareil, et cette
 * plateforme ne saurait pas quoi en faire.
 */
import type { Db } from './auth-core.ts';
import {
  base64urlVersOctets,
  decoderCbor,
  empreinteSha256,
  extraireClePublique,
  identiteVerifiee,
  lireAuthenticatorData,
  octetsEgaux,
  octetsVersBase64url,
  presenceConfirmee,
  verifierSignature,
} from './webauthn.ts';

const DUREE_DEFI_MS = 5 * 60 * 1000;
const GENRE_ENREGISTREMENT = 'enregistrement';
const GENRE_CONNEXION = 'connexion';

export type EtatEmpreinte = { active: boolean; appareils: number };

export type OptionsCreation = {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  authenticatorSelection: { authenticatorAttachment: 'platform'; userVerification: 'required'; residentKey: 'preferred' };
  timeout: number;
  excludeCredentials: Array<{ type: 'public-key'; id: string }>;
};

export type OptionsConnexion = {
  challenge: string;
  timeout: number;
  userVerification: 'required';
  rpId: string;
};

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : '';
}

function nombre(valeur: unknown): number {
  if (typeof valeur === 'bigint') return Number(valeur);
  const n = Number(valeur ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

async function defiAleatoire(): Promise<string> {
  const octets = new Uint8Array(32);
  crypto.getRandomValues(octets);
  return octetsVersBase64url(octets);
}

async function nouveauDefi(db: Db, userId: string | null, genre: string): Promise<{ id: string; challenge: string }> {
  await db.execute({ sql: 'DELETE FROM passkey_challenges WHERE expire_le_ms < ?', args: [Date.now()] });
  const id = `pkd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const challenge = await defiAleatoire();
  await db.execute({
    sql: 'INSERT INTO passkey_challenges(id, user_id, challenge, genre, expire_le_ms) VALUES (?, ?, ?, ?, ?)',
    args: [id, userId, challenge, genre, Date.now() + DUREE_DEFI_MS],
  });
  return { id, challenge };
}

async function consommerDefi(
  db: Db,
  id: string,
  genre: string,
  userId?: string
): Promise<string | null> {
  const lignes = await db.execute({
    sql: 'SELECT challenge, genre, user_id, expire_le_ms FROM passkey_challenges WHERE id = ?',
    args: [id],
  });
  const ligne = lignes.rows[0];
  if (!ligne) return null;
  // Un défi ne sert qu'une fois : on l'efface avant même de le vérifier.
  await db.execute({ sql: 'DELETE FROM passkey_challenges WHERE id = ?', args: [id] });
  if (texte(ligne.genre) !== genre) return null;
  if (nombre(ligne.expire_le_ms) < Date.now()) return null;
  if (userId && texte(ligne.user_id) !== userId) return null;
  return texte(ligne.challenge);
}

/** Lit `clientDataJSON` et vérifie qu'il répond bien au défi envoyé, depuis ce site. */
async function clientDataValide(
  clientDataJSONbase64: string,
  challengeAttendu: string,
  typeAttendu: string,
  origineAttendue: string
): Promise<boolean> {
  let json: { type?: string; challenge?: string; origin?: string };
  try {
    json = JSON.parse(new TextDecoder().decode(base64urlVersOctets(clientDataJSONbase64)));
  } catch {
    return false;
  }
  if (json.type !== typeAttendu) return false;
  if (!json.challenge || json.challenge !== challengeAttendu) return false;
  if (!json.origin || json.origin !== origineAttendue) return false;
  return true;
}

/** Les clés déjà enregistrées, pour qu'un appareil ne s'enregistre pas deux fois. */
async function identifiantsConnus(db: Db, userId: string): Promise<string[]> {
  const lignes = await db.execute({
    sql: 'SELECT credential_id FROM passkeys WHERE user_id = ?',
    args: [userId],
  });
  return lignes.rows.map((ligne) => texte(ligne.credential_id));
}

/** Prépare l'enregistrement : le défi, et ce que l'appareil doit recevoir. */
export async function preparerEnregistrement(
  db: Db,
  utilisateur: { id: string; email: string; displayName: string },
  rpId: string,
  rpName = 'DAVAR ACADÉMIE'
): Promise<{ defiId: string; options: OptionsCreation }> {
  const { id, challenge } = await nouveauDefi(db, utilisateur.id, GENRE_ENREGISTREMENT);
  return {
    defiId: id,
    options: {
      challenge,
      rp: { id: rpId, name: rpName },
      user: {
        id: octetsVersBase64url(new TextEncoder().encode(utilisateur.id)),
        name: utilisateur.email,
        displayName: utilisateur.displayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      excludeCredentials: (await identifiantsConnus(db, utilisateur.id)).map((id) => ({
        type: 'public-key' as const,
        id,
      })),
    },
  };
}

export type ResultatEnregistrement = { ok: true; appareils: number } | { ok: false; erreur: string };

/** Vérifie la réponse de l'appareil et garde la clé publique. */
export async function enregistrer(
  db: Db,
  utilisateur: { id: string },
  defiId: string,
  reponse: { id?: string; response?: { clientDataJSON?: string; attestationObject?: string } },
  rpId: string,
  origine: string
): Promise<ResultatEnregistrement> {
  const clientDataJSON = texte(reponse?.response?.clientDataJSON);
  const attestation = texte(reponse?.response?.attestationObject);
  const credentialId = texte(reponse?.id);
  if (!clientDataJSON || !attestation || !credentialId)
    return { ok: false, erreur: 'reponse_incomplete' };

  const challenge = await consommerDefi(db, defiId, GENRE_ENREGISTREMENT, utilisateur.id);
  if (!challenge) return { ok: false, erreur: 'defi_invalide' };

  if (!(await clientDataValide(clientDataJSON, challenge, 'webauthn.create', origine)))
    return { ok: false, erreur: 'origine_refusee' };

  const objet = decoderCbor(base64urlVersOctets(attestation));
  if (!(objet instanceof Map)) return { ok: false, erreur: 'attestation_illisible' };
  const authData = objet.get('authData');
  if (!(authData instanceof Uint8Array)) return { ok: false, erreur: 'attestation_illisible' };

  const donnees = lireAuthenticatorData(authData);
  if (!donnees?.attestation) return { ok: false, erreur: 'attestation_incomplete' };
  if (!(await rpIdConcordant(rpId, donnees.rpIdHash))) return { ok: false, erreur: 'origine_refusee' };
  if (!presenceConfirmee(donnees.flags) || !identiteVerifiee(donnees.flags))
    return { ok: false, erreur: 'verification_absente' };

  const cle = extraireClePublique(donnees.attestation.clePubliqueCose);
  if (!cle) return { ok: false, erreur: 'cle_illisible' };

  const id = `pk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await db.execute({
    sql: `INSERT INTO passkeys(id, user_id, credential_id, public_key, algorithm, sign_count, cree_le_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      utilisateur.id,
      octetsVersBase64url(donnees.attestation.credentialId),
      octetsVersBase64url(donnees.attestation.clePubliqueCose),
      cle.algorithme,
      donnees.signCount,
      Date.now(),
    ],
  });
  return { ok: true, appareils: (await etatEmpreinte(db, utilisateur.id)).appareils };
}

/** Prépare une connexion : un défi à signer, sans dire qui on est. */
export async function preparerConnexion(db: Db, rpId: string): Promise<{ defiId: string; options: OptionsConnexion }> {
  const { id, challenge } = await nouveauDefi(db, null, GENRE_CONNEXION);
  return { defiId: id, options: { challenge, timeout: 60000, userVerification: 'required', rpId } };
}

/**
 * Vérifie la signature et rend l'identifiant de la personne — ou null.
 * C'est la seule porte qui ouvre une session sans mot de passe : elle ne
 * s'ouvre que si l'appareil prouve qu'il garde la clé privée.
 */
export async function verifierConnexion(
  db: Db,
  defiId: string,
  reponse: { id?: string; response?: { clientDataJSON?: string; authenticatorData?: string; signature?: string; userHandle?: string | null } },
  rpId: string,
  origine: string
): Promise<string | null> {
  const clientDataJSON = texte(reponse?.response?.clientDataJSON);
  const authenticatorData = texte(reponse?.response?.authenticatorData);
  const signature = texte(reponse?.response?.signature);
  const credentialId = texte(reponse?.id);
  if (!clientDataJSON || !authenticatorData || !signature || !credentialId) return null;

  const challenge = await consommerDefi(db, defiId, GENRE_CONNEXION);
  if (!challenge) return null;
  if (!(await clientDataValide(clientDataJSON, challenge, 'webauthn.get', origine))) return null;

  const lignes = await db.execute({
    sql: 'SELECT id, user_id, public_key, algorithm, sign_count FROM passkeys WHERE credential_id = ?',
    args: [credentialId],
  });
  const ligne = lignes.rows[0];
  if (!ligne) return null;

  const cle = extraireClePublique(base64urlVersOctets(texte(ligne.public_key)));
  if (!cle) return null;

  const authData = base64urlVersOctets(authenticatorData);
  const donnees = lireAuthenticatorData(authData);
  if (!donnees) return null;
  if (!(await rpIdConcordant(rpId, donnees.rpIdHash))) return null;
  if (!presenceConfirmee(donnees.flags) || !identiteVerifiee(donnees.flags)) return null;

  const valide = await verifierSignature(
    cle,
    base64urlVersOctets(signature),
    authData,
    base64urlVersOctets(clientDataJSON)
  );
  if (!valide) return null;

  // Un compteur qui recule trahit une clé copiée : on refuse.
  const precedent = nombre(ligne.sign_count);
  if (precedent > 0 && donnees.signCount <= precedent) return null;

  await db.execute({
    sql: 'UPDATE passkeys SET sign_count = ? WHERE id = ?',
    args: [donnees.signCount, texte(ligne.id)],
  });
  return texte(ligne.user_id);
}

async function rpIdConcordant(rpId: string, hash: Uint8Array): Promise<boolean> {
  const attendu = await empreinteSha256(new TextEncoder().encode(rpId));
  return octetsEgaux(attendu, hash);
}

/** L'état de l'interrupteur : activé ou non, et combien d'appareils. */
export async function etatEmpreinte(db: Db, userId: string): Promise<EtatEmpreinte> {
  const lignes = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?',
    args: [userId],
  });
  const appareils = nombre(lignes.rows[0]?.n);
  return { active: appareils > 0, appareils };
}

/** Retire toutes les clés de la personne : l'empreinte ne reconnecte plus. */
export async function desactiver(db: Db, userId: string): Promise<boolean> {
  const resultat = await db.execute({ sql: 'DELETE FROM passkeys WHERE user_id = ?', args: [userId] });
  return nombre(resultat.rowsAffected) > 0;
}
