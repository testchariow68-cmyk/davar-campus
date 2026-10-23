/**
 * NOTIFICATIONS POUSSÉES — ce que le prototype faisait semblant de faire.
 *
 * Dans le prototype, `togglePush()` posait `pushEnabled = true` et affichait
 * « Notifications activées ✓ ». Personne ne recevait jamais rien : c'était un
 * décor. Ici, l'interrupteur abonne réellement l'appareil, et chaque
 * notification du campus part vers lui.
 *
 * Le chiffrement est fait ici, côté serveur, puisque c'est le serveur qui
 * envoie : VAPID (ECDSA P-256) pour prouver qui nous sommes auprès du
 * service de push, puis aes128gcm pour que le message reste illisible pour
 * lui. Aucune dépendance : WebCrypto suffit, et c'est exactement ce dont
 * dispose un Worker Cloudflare.
 *
 * Deux règles du projet sont respectées :
 *   - le serveur ne garde que ce dont il a besoin (une adresse de push et une
 *     clé publique d'appareil — jamais de quoi se faire passer pour lui) ;
 *   - un envoi de masse ne se fait jamais d'un coup : `pousserNotifications`
 *     traite un petit lot, parce qu'un Worker gratuit ne peut pas ouvrir
 *     cinquante connexions dans la même seconde.
 */
import type { Db } from './auth-core.ts';

/** Le propriétaire est joignable à cette adresse : c'est la règle du VAPID. */
export const SUJET_VAPID = 'mailto:support@davarcampus.co';
/** Combien de notifications poussées par passage du robot. Un Worker gratuit tient 50 requêtes. */
export const LOT_ENVOI = 40;
/** Une notification plus vieille que cela n'est plus poussée : elle reste dans la cloche. */
const FRAICHEUR_MS = 24 * 60 * 60 * 1000;
const DUREE_JETON_S = 12 * 60 * 60;

const CLE_PUBLIQUE = 'push.vapid.publique';
const CLE_PRIVEE = 'push.vapid.privee';

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null;
}

export function octetsVersBase64url(octets: Uint8Array): string {
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlVersOctets(valeur: string): Uint8Array<ArrayBuffer> {
  const normalisee = valeur.replace(/-/g, '+').replace(/_/g, '/');
  const binaire = atob(normalisee + '='.repeat((4 - (normalisee.length % 4)) % 4));
  const octets = new Uint8Array(binaire.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

function encoder(texteClair: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(texteClair) as Uint8Array<ArrayBuffer>;
}

function concatener(...morceaux: Uint8Array<ArrayBufferLike>[]): Uint8Array<ArrayBuffer> {
  const taille = morceaux.reduce((total, morceau) => total + morceau.length, 0);
  const resultat = new Uint8Array(taille) as Uint8Array<ArrayBuffer>;
  let position = 0;
  for (const morceau of morceaux) {
    resultat.set(morceau, position);
    position += morceau.length;
  }
  return resultat;
}

/* ------------------------------------------------------------------ VAPID -- */

export type CleVapid = { publique: string; priveePkcs8: Uint8Array<ArrayBuffer> };

/** La paire de clés du campus. Elle est fabriquée une fois, puis relue. */
export async function cleVapid(db: Db): Promise<CleVapid> {
  const lues = await db.execute({
    sql: 'SELECT key, value FROM app_settings WHERE key IN (?, ?)',
    args: [CLE_PUBLIQUE, CLE_PRIVEE],
  });
  const valeurs = new Map<string, string>();
  for (const ligne of lues.rows) {
    const cle = texte(ligne.key);
    const valeur = texte(ligne.value);
    if (cle && valeur) valeurs.set(cle, valeur);
  }
  const publique = valeurs.get(CLE_PUBLIQUE);
  const privee = valeurs.get(CLE_PRIVEE);
  if (publique && privee) return { publique, priveePkcs8: base64urlVersOctets(privee) };

  const paire = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publiqueBrute = new Uint8Array(
    await crypto.subtle.exportKey('raw', paire.publicKey)
  ) as Uint8Array<ArrayBuffer>;
  const priveePkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', paire.privateKey)
  ) as Uint8Array<ArrayBuffer>;
  const maintenant = Date.now();
  await db.batch(
    [
      { sql: 'INSERT INTO app_settings(key, value, updated_at_ms) VALUES (?,?,?)', args: [CLE_PUBLIQUE, octetsVersBase64url(publiqueBrute), maintenant] },
      { sql: 'INSERT INTO app_settings(key, value, updated_at_ms) VALUES (?,?,?)', args: [CLE_PRIVEE, octetsVersBase64url(priveePkcs8), maintenant] },
    ],
    'write'
  );
  return { publique: octetsVersBase64url(publiqueBrute), priveePkcs8 };
}

/** La clé publique seule, celle que le navigateur réclame pour s'abonner. */
export async function clePubliqueVapid(db: Db): Promise<string> {
  const { publique } = await cleVapid(db);
  return publique;
}

async function signer(priveePkcs8: Uint8Array<ArrayBuffer>, donnees: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const cle = await crypto.subtle.importKey(
    'pkcs8',
    priveePkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cle, donnees);
  return new Uint8Array(signature) as Uint8Array<ArrayBuffer>;
}

/**
 * Le jeton VAPID : un JWT ES256 signé avec notre clé, qui prouve au service de
 * push que l'envoi vient bien du campus. L'audience est l'ORIGINE du service
 * (Google, Mozilla…) et non l'adresse complète.
 */
export async function jetonVapid(
  endpoint: string,
  cle: CleVapid,
  maintenant = Date.now()
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const entete = { typ: 'JWT', alg: 'ES256' };
  const charge = { aud: audience, exp: Math.floor(maintenant / 1000) + DUREE_JETON_S, sub: SUJET_VAPID };
  const partie = (valeur: unknown) => octetsVersBase64url(encoder(JSON.stringify(valeur)));
  const aSigner = encoder(`${partie(entete)}.${partie(charge)}`);
  const signature = await signer(cle.priveePkcs8, aSigner);
  return `${partie(entete)}.${partie(charge)}.${octetsVersBase64url(signature)}`;
}

/* --------------------------------------------------------- CHIFFREMENT ----- */

/**
 * aes128gcm, la seule variante que les navigateurs acceptent aujourd'hui.
 * L'en-tête (sel, taille d'enregistrement, clé publique éphémère) précède le
 * message chiffré ; le navigateur sait le lire et le déchiffrer seul.
 */
export async function chiffrer(
  abonnement: { p256dh: string; auth: string },
  message: string,
  /**
   * Injecter le sel et la paire éphémère sert une seule chose : éprouver le
   * chiffrement contre un vecteur connu, fabriqué par l'implémentation de
   * référence. En production, les deux sont tirés au hasard à chaque envoi.
   */
  fourni?: { sel?: Uint8Array<ArrayBuffer>; ephemere?: CryptoKeyPair }
): Promise<{ corps: Uint8Array<ArrayBuffer> }> {
  const cleAppareil = await crypto.subtle.importKey(
    'raw',
    base64urlVersOctets(abonnement.p256dh),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const ephemere =
    fourni?.ephemere ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);
  const clePubliqueEphemere = new Uint8Array(
    await crypto.subtle.exportKey('raw', ephemere.publicKey)
  ) as Uint8Array<ArrayBuffer>;
  const cleAppareilBrute = base64urlVersOctets(abonnement.p256dh);

  const secretPartage = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: cleAppareil }, ephemere.privateKey, 256)
  ) as Uint8Array<ArrayBuffer>;

  const secret = await hkdf(
    base64urlVersOctets(abonnement.auth),
    secretPartage,
    concatener(encoder('WebPush: info\0'), cleAppareilBrute, clePubliqueEphemere),
    32
  );

  const sel = fourni?.sel ?? crypto.getRandomValues(new Uint8Array(16) as Uint8Array<ArrayBuffer>);
  const prk = await hmac(sel, secret);
  const cleChiffrement = await hkdf(sel, secret, encoder('Content-Encoding: aes128gcm\0'), 16, prk);
  const nonce = await hkdf(sel, secret, encoder('Content-Encoding: nonce\0'), 12, prk);

  const cleAes = await crypto.subtle.importKey('raw', cleChiffrement, { name: 'AES-GCM' }, false, ['encrypt']);
  const contenu = concatener(encoder(message), new Uint8Array([2]));
  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cleAes, contenu)
  ) as Uint8Array<ArrayBuffer>;

  const tailleEnregistrement = 4096;
  const entete = new Uint8Array(21 + clePubliqueEphemere.length) as Uint8Array<ArrayBuffer>;
  entete.set(sel, 0);
  new DataView(entete.buffer).setUint32(16, tailleEnregistrement, false);
  entete[20] = clePubliqueEphemere.length;
  entete.set(clePubliqueEphemere, 21);

  return { corps: concatener(entete, chiffre) };
}

/** HKDF (RFC 5869) avec SHA-256. `prkFourni` permet d'enchaîner les deux étapes. */
async function hkdf(
  sel: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  longueur: number,
  prkFourni?: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const prk = prkFourni ?? (await hmac(sel, ikm));
  const octets = new Uint8Array(longueur) as Uint8Array<ArrayBuffer>;
  let precedent = new Uint8Array(0) as Uint8Array<ArrayBuffer>;
  let compteur = 0;
  let remplis = 0;
  while (remplis < longueur) {
    compteur += 1;
    const morceau = await hmac(prk, concatener(precedent, info, new Uint8Array([compteur])));
    precedent = morceau;
    const aCopier = Math.min(morceau.length, longueur - remplis);
    octets.set(morceau.subarray(0, aCopier), remplis);
    remplis += aCopier;
  }
  return octets;
}

async function hmac(cle: Uint8Array<ArrayBuffer>, donnees: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const cleHmac = await crypto.subtle.importKey('raw', cle, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const resultat = await crypto.subtle.sign('HMAC', cleHmac, donnees);
  return new Uint8Array(resultat) as Uint8Array<ArrayBuffer>;
}

/* -------------------------------------------------------- Abonnements ------ */

export type Abonnement = { id: string; userId: string; endpoint: string; p256dh: string; auth: string };

export async function abonner(
  db: Db,
  options: { userId: string; endpoint: string; p256dh: string; auth: string },
  maintenant = Date.now()
): Promise<void> {
  const id = `psh_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  await db.execute({
    sql: `INSERT INTO push_subscriptions(id, user_id, endpoint, p256dh, auth, created_at_ms)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    args: [
      id,
      options.userId,
      options.endpoint.slice(0, 500),
      options.p256dh.slice(0, 200),
      options.auth.slice(0, 100),
      maintenant,
    ],
  });
}

export async function desabonner(db: Db, userId: string, endpoint: string): Promise<void> {
  await db.execute({
    sql: 'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
    args: [userId, endpoint.slice(0, 500)],
  });
}

export async function abonnementsDe(db: Db, userId: string): Promise<Abonnement[]> {
  const lignes = await db.execute({
    sql: 'SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    args: [userId],
  });
  return lignes.rows.map((ligne) => ({
    id: texte(ligne.id) ?? '',
    userId: texte(ligne.user_id) ?? '',
    endpoint: texte(ligne.endpoint) ?? '',
    p256dh: texte(ligne.p256dh) ?? '',
    auth: texte(ligne.auth) ?? '',
  }));
}

/* ------------------------------------------------------------- Envoi ------- */

export type ResultatEnvoi = { envoyees: number; echecs: number; abonnementsRetires: number };

/**
 * POUSSER UN LOT — les notifications créées depuis peu et pas encore poussées.
 * Un abonnement qui n'existe plus (404 ou 410 du service) est retiré : garder
 * des adresses mortes ferait dépenser du quota pour rien.
 */
export async function pousserNotifications(
  db: Db,
  limite = LOT_ENVOI,
  maintenant = Date.now()
): Promise<ResultatEnvoi> {
  const cle = await cleVapid(db);
  const lignes = await db.execute({
    sql: `SELECT n.id, n.title, n.body, n.route, s.endpoint, s.p256dh, s.auth
          FROM notifications n
          JOIN push_subscriptions s ON s.user_id = n.user_id
          WHERE n.pushed_at_ms IS NULL AND n.created_at_ms > ?
          ORDER BY n.created_at_ms
          LIMIT ?`,
    args: [maintenant - FRAICHEUR_MS, Math.min(Math.max(limite, 1), 40)],
  });

  let envoyees = 0;
  let echecs = 0;
  let abonnementsRetires = 0;
  const traites = new Set<string>();

  for (const ligne of lignes.rows) {
    const id = texte(ligne.id);
    const endpoint = texte(ligne.endpoint);
    const p256dh = texte(ligne.p256dh);
    const auth = texte(ligne.auth);
    if (!id || !endpoint || !p256dh || !auth) continue;
    const charge = JSON.stringify({
      titre: texte(ligne.title) ?? '',
      corps: texte(ligne.body) ?? '',
      route: texte(ligne.route) ?? '',
    });
    try {
      const { corps } = await chiffrer({ p256dh, auth }, charge);
      const jeton = await jetonVapid(endpoint, cle, maintenant);
      const reponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `vapid t=${jeton}, k=${cle.publique}`,
          'content-encoding': 'aes128gcm',
          'content-type': 'application/octet-stream',
          ttl: '86400',
          urgency: 'normal',
        },
        body: corps,
      });
      if (reponse.status === 404 || reponse.status === 410) {
        await db.execute({
          sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?',
          args: [endpoint],
        });
        abonnementsRetires += 1;
      } else if (reponse.ok) {
        envoyees += 1;
      } else {
        echecs += 1;
      }
    } catch {
      echecs += 1;
    }
    traites.add(id);
  }

  for (const id of traites) {
    await db.execute({
      sql: 'UPDATE notifications SET pushed_at_ms = ? WHERE id = ?',
      args: [maintenant, id],
    });
  }

  return { envoyees, echecs, abonnementsRetires };
}
