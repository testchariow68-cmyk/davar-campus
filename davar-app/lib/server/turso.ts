/**
 * Accès Turso/libSQL — SERVEUR UNIQUEMENT (jamais importé par un composant client).
 *
 * Trois environnements, un seul code applicatif :
 *  - development : base locale (`file:…`) ou serveur libSQL local. Aucun secret requis.
 *  - staging     : Turso hébergé, hôte dont le nom contient « staging », jeton requis.
 *  - production  : Turso hébergé, hôte attendu explicite, jamais un hôte staging.
 *
 * Toutes les vérifications échouent en mode fermé : une configuration ambiguë
 * lève une erreur, elle ne retombe jamais silencieusement sur un autre mode.
 */

export type DbRow = Record<string, unknown>;
export type DbResult = { rows: DbRow[] };
export type DbStatement = { sql: string; args?: unknown[] };
/** Interface minimale commune au client web (Workers/Node) et au client local. */
export type Db = {
  execute(statement: DbStatement | string): Promise<DbResult>;
  batch(statements: DbStatement[], mode?: string): Promise<unknown>;
};

export type Environment = 'development' | 'staging' | 'production';

export class DbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbConfigError';
  }
}

export function currentEnvironment(): Environment {
  const declared = process.env.APP_ENV;
  if (declared === 'development' || declared === 'staging' || declared === 'production') return declared;
  if (declared) throw new DbConfigError(`APP_ENV inconnu : ${declared}`);
  // Repli sûr : une exécution de production reste en production même sans APP_ENV.
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

export type Connection = {
  url: string;
  authToken?: string;
  environment: Environment;
  /** Base locale (fichier) : client Node, jamais embarqué dans un Worker. */
  isLocalFile: boolean;
};

/** Résout et valide la cible de base. Lève DbConfigError si la configuration est ambiguë. */
export function resolveConnection(): Connection {
  const environment = currentEnvironment();
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const token = process.env.TURSO_AUTH_TOKEN?.trim();
  const expectedHost = process.env.TURSO_EXPECTED_HOST?.trim();
  if (!url) throw new DbConfigError('TURSO_DATABASE_URL absente');

  if (url.startsWith('file:')) {
    if (environment !== 'development')
      throw new DbConfigError('Base fichier refusée hors développement');
    return { url, environment, isLocalFile: true };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DbConfigError('TURSO_DATABASE_URL invalide');
  }
  if (!['libsql:', 'https:', 'http:', 'wss:'].includes(parsed.protocol))
    throw new DbConfigError(`Protocole refusé : ${parsed.protocol}`);

  if (environment === 'development') {
    if (expectedHost && parsed.hostname !== expectedHost)
      throw new DbConfigError('Hôte local incohérent avec TURSO_EXPECTED_HOST');
    return { url, authToken: token || undefined, environment, isLocalFile: false };
  }

  // staging / production : connexion distante obligatoire et strictement contrôlée.
  if (!['libsql:', 'https:'].includes(parsed.protocol))
    throw new DbConfigError('Connexion distante en clair refusée');
  if (!token) throw new DbConfigError('TURSO_AUTH_TOKEN absente');
  if (!expectedHost) throw new DbConfigError('TURSO_EXPECTED_HOST absente');
  if (parsed.hostname !== expectedHost)
    throw new DbConfigError('Hôte Turso différent de TURSO_EXPECTED_HOST');
  const looksStaging = /(^|[.-])staging([.-]|$)/i.test(parsed.hostname);
  if (environment === 'production' && looksStaging)
    throw new DbConfigError('Hôte staging refusé en production');
  if (environment === 'staging' && !looksStaging)
    throw new DbConfigError('Hôte non staging refusé en environnement staging');
  return { url, authToken: token, environment, isLocalFile: false };
}

/** Conservé pour les modules existants : résolution stricte, sans ouvrir de client. */
export function checkedConnection(): { url: string; authToken: string } {
  const connection = resolveConnection();
  return { url: connection.url, authToken: connection.authToken ?? '' };
}

async function createLocalClient(url: string): Promise<Db> {
  // Import dynamique volontairement opaque : le client Node (binding natif)
  // ne doit jamais être tiré dans le paquet Cloudflare Workers.
  const specifier = '@libsql/' + 'client';
  const load = new Function('s', 'return import(s)') as (s: string) => Promise<{ createClient(o: { url: string }): Db }>;
  const mod = await load(specifier);
  return mod.createClient({ url });
}

async function createRemoteClient(connection: Connection): Promise<Db> {
  const { createClient } = await import('@libsql/client/web');
  return createClient({ url: connection.url, authToken: connection.authToken }) as unknown as Db;
}

let cachedClient: { key: string; client: Db } | undefined;

/** Ouvre (ou réutilise) le client de base. Ne journalise jamais l'URL ni le jeton. */
export async function openDb(): Promise<Db> {
  const connection = resolveConnection();
  const key = `${connection.url}|${connection.authToken ? 'token' : 'anon'}`;
  if (cachedClient?.key === key) return cachedClient.client;
  const client = connection.isLocalFile ? await createLocalClient(connection.url) : await createRemoteClient(connection);
  cachedClient = { key, client };
  return client;
}

export async function checkTursoConnection(): Promise<void> {
  const client = await openDb();
  const result = await client.execute('SELECT 1 AS ok');
  if (Number(result.rows[0]?.ok) !== 1) throw new Error('sonde Turso invalide');
}

/** Une formation publiée par identifiant (page d'achat externe). */
export async function getTrainingById(id: string): Promise<PublicTraining | null> {
  if (typeof id !== 'string' || id.length < 1 || id.length > 120) return null;
  const client = await openDb();
  const result = await client.execute({
    sql: 'SELECT id, title, price_cfa, description, buy_url FROM trainings WHERE id = ? AND published = 1',
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  const price = Number(row.price_cfa);
  if (typeof row.id !== 'string' || typeof row.title !== 'string' || !Number.isSafeInteger(price) || price < 0)
    throw new Error('Catalogue Turso invalide');
  return {
    id: row.id,
    title: row.title,
    priceCfa: price,
    description: typeof row.description === 'string' ? row.description : null,
    buyUrl: typeof row.buy_url === 'string' && row.buy_url.startsWith('https://') ? row.buy_url : null,
  };
}

export type PublicTraining = {
  id: string;
  title: string;
  priceCfa: number;
  description: string | null;
  buyUrl: string | null;
};

// Cache de métadonnées publiques par instance, jamais un cache de droits ni de prix de paiement.
let cached: { expiresAt: number; value: PublicTraining[] } | undefined;
let pending: Promise<PublicTraining[]> | undefined;

export async function getPublishedTrainings(): Promise<PublicTraining[]> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    const client = await openDb();
    const result = await client.execute(
      'SELECT id, title, price_cfa, description, buy_url FROM trainings WHERE published = 1 ORDER BY title LIMIT 30'
    );
    const trainings = result.rows.map((row): PublicTraining => {
      const price = Number(row.price_cfa);
      if (typeof row.id !== 'string' || typeof row.title !== 'string' || !Number.isSafeInteger(price) || price < 0)
        throw new Error('Catalogue Turso invalide');
      const description = typeof row.description === 'string' ? row.description : null;
      const buyUrl = typeof row.buy_url === 'string' && row.buy_url.startsWith('https://') ? row.buy_url : null;
      return { id: row.id, title: row.title, priceCfa: price, description, buyUrl };
    });
    cached = { expiresAt: Date.now() + 60_000, value: trainings };
    return trainings;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
