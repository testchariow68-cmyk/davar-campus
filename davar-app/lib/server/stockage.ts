/**
 * STOCKAGE DES FICHIERS — livres, audios, documents.
 *
 * Choix : Cloudflare R2 (10 Go gratuits, sans frais de sortie), déjà dans la pile
 * du propriétaire. On n'y accède QUE par des adresses signées à durée courte :
 * le fichier n'est jamais public, et l'application ne le transporte jamais.
 *
 * Deux conséquences, voulues :
 *   - le Worker ne fait que signer, il ne « pousse » pas les fichiers : aucune
 *     limite de temps de calcul à craindre ;
 *   - la clé secrète ne quitte JAMAIS le serveur.
 *
 * Aucune dépendance à Next : la signature est testable en Node.
 */

const ENCODEUR = new TextEncoder();

/* ------------------------------------------------------------- outils bas niveau */

function base64urlOctets(octets: ArrayBuffer | Uint8Array): string {
  const vue = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let binaire = '';
  for (let index = 0; index < vue.length; index += 1) binaire += String.fromCharCode(vue[index]);
  // btoa n'existe pas partout : on passe par Buffer quand il est là.
  const base64 =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(binaire)
      : // eslint-disable-next-line @typescript-eslint/no-var-requires
        (globalThis as unknown as { Buffer: { from: (v: string, e: string) => { toString: (e: string) => string } } }).Buffer.from(
          binaire,
          'binary'
        ).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(donnees: string): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', ENCODEUR.encode(donnees));
  const octets = new Uint8Array(empreinte);
  return [...octets].map((octet) => octet.toString(16).padStart(2, '0')).join('');
}

async function hmac(cle: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cleImportee = await crypto.subtle.importKey('raw', cle as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cleImportee, ENCODEUR.encode(message));
}

/** Signature AWS4-HMAC-SHA256, telle que R2 l'attend. */
async function cleSignature(secret: string, date: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmac(ENCODEUR.encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/** Un segment de chemin ou un paramètre encodé selon la règle AWS (RFC 3986 strict). */
export function encoderAws(valeur: string): string {
  return encodeURIComponent(valeur).replace(/[!'()*]/g, (caractere) => `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`);
}

/* ------------------------------------------------------------------ configuration */

export type ConfigStockage = {
  compte: string;
  cleAcces: string;
  secret: string;
  seau: string;
  region: string;
};

/** Lit la configuration depuis l'environnement du SERVEUR. Renvoie null si incomplète. */
export function configStockage(): ConfigStockage | null {
  const compte = (process.env.R2_ACCOUNT_ID ?? '').trim();
  const cleAcces = (process.env.R2_ACCESS_KEY_ID ?? '').trim();
  const secret = (process.env.R2_SECRET_ACCESS_KEY ?? '').trim();
  const seau = (process.env.R2_BUCKET ?? '').trim();
  if (!compte || !cleAcces || !secret || !seau) return null;
  if (!/^[a-f0-9]{32}$/i.test(compte)) return null;
  return { compte, cleAcces, secret, seau, region: 'auto' };
}

export function stockagePret(): boolean {
  return configStockage() !== null;
}

/**
 * Nettoie la clé d'un fichier. Une clé propre ne peut pas sortir de son dossier :
 * ni `..`, ni chemin absolu, ni caractère de contrôle. C'est la seule barrière
 * entre une faute de frappe et l'accès à un autre fichier.
 */
export function clePropre(cle: string): string | null {
  const brut = (cle ?? '').trim();
  if (brut.length === 0 || brut.length > 400) return null;
  if (brut.startsWith('/') || brut.includes('\\')) return null;
  if (brut.includes('..') || /[\u0000-\u001f]/.test(brut)) return null;
  if (!/^[A-Za-z0-9._\-/]+$/.test(brut)) return null;
  const segments = brut.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.length > 8) return null;
  return segments.join('/');
}

/** L'hôte du service S3 de R2 pour ce compte. */
export function hoteR2(config: ConfigStockage): string {
  return `${config.compte}.r2.cloudflarestorage.com`;
}

/* ---------------------------------------------------------------------- signature */

export type OptionsSignature = {
  methode: 'GET' | 'PUT';
  cle: string;
  expireSecondes?: number;
  maintenant?: number;
};

/**
 * Produit une adresse signée, valable quelques minutes. C'est la seule forme sous
 * laquelle un fichier est accessible : jamais une adresse permanente.
 */
export async function urlSignee(options: OptionsSignature, config = configStockage()): Promise<string | null> {
  if (!config) return null;
  const cle = clePropre(options.cle);
  if (!cle) return null;
  const expire = Math.min(Math.max(options.expireSecondes ?? 300, 30), 3600);
  const maintenant = options.maintenant ?? Date.now();

  const horodatage = new Date(maintenant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = horodatage.slice(0, 8);
  const portee = `${date}/${config.region}/s3/aws4_request`;
  const hote = hoteR2(config);
  const chemin = `/${config.seau}/${cle.split('/').map(encoderAws).join('/')}`;

  const parametres: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.cleAcces}/${portee}`],
    ['X-Amz-Date', horodatage],
    ['X-Amz-Expires', String(expire)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const requeteCanonique = [...parametres]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([nom, valeur]) => `${encoderAws(nom)}=${encoderAws(valeur)}`)
    .join('&');

  const chaineCanonique = [
    options.methode,
    chemin,
    requeteCanonique,
    `host:${hote}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const aSigner = ['AWS4-HMAC-SHA256', horodatage, portee, await sha256Hex(chaineCanonique)].join('\n');
  const signature = base64urlOctets(await hmac(await cleSignature(config.secret, date, config.region, 's3'), aSigner));

  return `https://${hote}${chemin}?${requeteCanonique}&X-Amz-Signature=${signature}`;
}

/** Adresse de dépôt : le navigateur du propriétaire envoie le fichier DIRECTEMENT au stockage. */
export async function urlDepot(cle: string, expireSecondes = 900, maintenant?: number): Promise<string | null> {
  return urlSignee({ methode: 'PUT', cle, expireSecondes, maintenant });
}

/** Adresse de lecture, plus courte encore : quelques minutes suffisent pour ouvrir un fichier. */
export async function urlLecture(cle: string, expireSecondes = 300, maintenant?: number): Promise<string | null> {
  return urlSignee({ methode: 'GET', cle, expireSecondes, maintenant });
}

/* ------------------------------------------------------------------------- tailles */

/**
 * Les plafonds écrits dans les documents du propriétaire. Ils ne changent QUE
 * sur sa validation : une vidéo est plus lourde qu'un document, et un audio se
 * situe entre les deux.
 */
export const PLAFONDS_OCTETS = {
  /** 10 Mo pour un document — le livre, le PDF, la fiche. */
  document: 10 * 1024 * 1024,
  /** 20 Mo pour un audio — la piste, l'avis dicté, le message vocal. */
  audio: 20 * 1024 * 1024,
  /** 128 Mo pour une vidéo. */
  video: 128 * 1024 * 1024,
} as const;

/**
 * Les trois plafonds sont écrits noir sur blanc dans les documents du propriétaire
 * (« 20 Mo audio / 128 Mo vidéo / 10 Mo document ») et NE CHANGENT QUE sur sa
 * validation. Le contrôle est fait ici, côté serveur, pas dans le navigateur.
 */
export function tailleAcceptable(kind: string, octets: number): boolean {
  if (!Number.isFinite(octets) || octets <= 0) return false;
  if (kind === 'audio') return octets <= PLAFONDS_OCTETS.audio;
  if (kind === 'video') return octets <= PLAFONDS_OCTETS.video;
  return octets <= PLAFONDS_OCTETS.document;
}

export function libellePlafond(kind: string): string {
  const octets = kind === 'audio' ? PLAFONDS_OCTETS.audio : kind === 'video' ? PLAFONDS_OCTETS.video : PLAFONDS_OCTETS.document;
  return `${Math.round(octets / (1024 * 1024))} Mo`;
}
