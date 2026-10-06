/**
 * Noyau d'authentification DAVAR Campus — SERVEUR UNIQUEMENT.
 *
 * Module volontairement autonome (aucun import applicatif) : il ne dépend que
 * de Web Crypto et de l'interface Db, ce qui permet de le tester directement
 * sur SQLite local et de le faire tourner aussi bien sous Node que sous
 * Cloudflare Workers.
 *
 * Principes non négociables appliqués ici :
 *  - mot de passe jamais stocké ni journalisé en clair (PBKDF2-HMAC-SHA256 salé) ;
 *  - jeton de session/jeton d'e-mail stocké uniquement sous forme de SHA-256 ;
 *  - comparaisons en temps constant ;
 *  - échec en mode fermé : toute ambiguïté lève une erreur, jamais un accès ;
 *  - aucune attribution de formation sans e-mail vérifié.
 */

export type DbStatement = { sql: string; args?: unknown[] };
export type DbRow = Record<string, unknown>;
export type DbResult = { rows: DbRow[]; rowsAffected?: number };
/** Interface minimale commune au client web libSQL et au client Node local. */
export type Db = {
  execute(statement: DbStatement | string): Promise<DbResult>;
  batch(statements: DbStatement[], mode?: string): Promise<unknown>;
};

const te = new TextEncoder();

/* ------------------------------------------------------------------ erreurs */

export type AuthErrorCode =
  | 'invalid_input'
  | 'invalid_credentials'
  | 'email_taken'
  | 'email_not_verified'
  | 'account_suspended'
  | 'rate_limited'
  | 'invalid_token'
  | 'kdf_scheme_mismatch'
  | 'not_configured';

export class AuthError extends Error {
  code: AuthErrorCode;
  /** Secondes avant nouvel essai, uniquement pour `rate_limited`. */
  retryAfterSeconds?: number;
  constructor(code: AuthErrorCode, message?: string, retryAfterSeconds?: number) {
    super(message ?? code);
    this.name = 'AuthError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function httpStatusForAuthError(code: AuthErrorCode): number {
  switch (code) {
    case 'invalid_input':
      return 400;
    case 'invalid_credentials':
      return 401;
    case 'email_taken':
      return 409;
    case 'email_not_verified':
      return 403;
    case 'account_suspended':
      return 403;
    case 'rate_limited':
      return 429;
    case 'invalid_token':
      return 400;
    case 'kdf_scheme_mismatch':
      return 409;
    case 'not_configured':
      return 503;
  }
}

/* ------------------------------------------------------- validation d'entrée */

export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') throw new AuthError('invalid_input', 'email');
  const email = raw.trim().toLowerCase();
  if (email.length < 5 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AuthError('invalid_input', 'email');
  return email;
}

export function validateDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') throw new AuthError('invalid_input', 'display_name');
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) throw new AuthError('invalid_input', 'display_name');
  return name;
}

const WEAK_PASSWORDS = new Set([
  'motdepasse', 'password', 'passw0rd', 'azerty123456', 'qwertyuiop', '12345678910',
  'davar123456', 'admin12345', 'motdepasse1',
]);

export function assertPasswordPolicy(password: unknown, emailNormalized: string): string {
  if (typeof password !== 'string') throw new AuthError('invalid_input', 'password');
  // Borne haute : évite qu'une chaîne géante consomme du CPU de dérivation.
  if (password.length < 10 || password.length > 200) throw new AuthError('invalid_input', 'password');
  const lower = password.toLowerCase();
  if (WEAK_PASSWORDS.has(lower)) throw new AuthError('invalid_input', 'password_weak');
  const localPart = emailNormalized.split('@')[0];
  if (localPart.length >= 4 && lower.includes(localPart) && password.length < 24)
    throw new AuthError('invalid_input', 'password_weak');
  return password;
}

/* ----------------------------------------------------------- hachage du mot de passe */

export const DEFAULT_PBKDF2_ITERATIONS = 600_000;
/** Plancher absolu, toutes configurations confondues. */
const HARD_MIN_ITERATIONS = 10_000;
/** Plancher exigé en staging/production (OWASP 2023 pour PBKDF2-HMAC-SHA256). */
const REMOTE_MIN_ITERATIONS = 210_000;

function productionLike(): boolean {
  const env = process.env.APP_ENV;
  if (env === 'staging' || env === 'production') return true;
  if (env === 'development') return false;
  return process.env.NODE_ENV === 'production';
}

/** Itérations PBKDF2 effectives, validées selon l'environnement. */
export function pbkdf2Iterations(): number {
  const raw = process.env.AUTH_PBKDF2_ITERATIONS?.trim();
  const parsed = raw ? Number(raw) : DEFAULT_PBKDF2_ITERATIONS;
  if (!Number.isInteger(parsed) || parsed < HARD_MIN_ITERATIONS)
    throw new AuthError('not_configured', 'AUTH_PBKDF2_ITERATIONS invalide');
  if (productionLike() && parsed < REMOTE_MIN_ITERATIONS && process.env.AUTH_ALLOW_LOW_KDF !== 'true')
    throw new AuthError(
      'not_configured',
      `AUTH_PBKDF2_ITERATIONS=${parsed} insuffisant en staging/production (minimum ${REMOTE_MIN_ITERATIONS})`
    );
  return parsed;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

/** Format stocké : pbkdf2-sha256$<itérations>$<sel>$<empreinte>. */
export async function hashPassword(password: string, iterations = pbkdf2Iterations()): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

export type PasswordCheck = { ok: boolean; needsRehash: boolean };

export async function verifyPassword(password: string, stored: string): Promise<PasswordCheck> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return { ok: false, needsRehash: false };
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 5_000_000) return { ok: false, needsRehash: false };
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64Url(parts[2]);
    expected = fromBase64Url(parts[3]);
  } catch {
    return { ok: false, needsRehash: false };
  }
  const derived = await derive(password, salt, iterations);
  const ok = timingSafeEqual(derived, expected);
  return { ok, needsRehash: ok && iterations !== pbkdf2Iterations() };
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

/**
 * Adaptateur de dérivation de mot de passe. L'implémentation locale est le
 * défaut (développement, tests, hôtes Node). Les routes applicatives peuvent
 * injecter un adaptateur délégué à un service gratuit lorsque l'hôte impose un
 * plafond de CPU par requête (Cloudflare Workers Free) — voir password-service.ts.
 */
export type KdfAdapter = {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<PasswordCheck>;
};

export const localKdfAdapter: KdfAdapter = {
  hash: (password) => hashPassword(password),
  verify: (password, stored) => verifyPassword(password, stored),
};

/** Empreinte factice : garantit le même coût CPU quand le compte n'existe pas. */
export const DUMMY_PASSWORD_HASH =
  'pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/* ----------------------------------------------------------------- jetons */

export function newToken(byteLength = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', te.encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

/* ------------------------------------------------------------ lecture de base */

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function int(value: unknown): number | null {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'student' | 'staff' | 'admin';
  emailVerified: boolean;
};

function mapUser(row: DbRow): AuthUser {
  const id = text(row.id);
  const email = text(row.email_normalized);
  const displayName = text(row.display_name);
  const role = text(row.role);
  if (!id || !email || !displayName || !role || !['student', 'staff', 'admin'].includes(role))
    throw new Error('Utilisateur Turso invalide');
  return { id, email, displayName, role: role as AuthUser['role'], emailVerified: int(row.email_verified_at_ms) !== null };
}

/* ------------------------------------- dérivation côté client (schéma client-v1) */

/**
 * Le navigateur effectue PBKDF2-SHA256 sur 600 000 itérations (recommandation
 * OWASP). Le serveur ne reçoit que la clé dérivée de 256 bits, puis la
 * revérifie à faible coût : c'est ce qui rend la plateforme gratuite tenable
 * (10 ms de CPU par requête) sans jamais affaiblir la résistance hors ligne.
 */
export const CLIENT_KDF_ITERATIONS = 600_000;
/** Coût de la vérification serveur : quelques millisecondes, jamais le coût client. */
export const SERVER_VERIFIER_ITERATIONS = 10_000;
const MIN_SERVER_VERIFIER_ITERATIONS = 1_000;
const MAX_SERVER_VERIFIER_ITERATIONS = 60_000;
/** Sel factice pour les adresses inconnues : identique en forme à un vrai sel. */
const FAKE_SALT_BYTES = 16;

export type KdfScheme = 'server-v1' | 'client-v1';

export function schemeOf(row: DbRow): KdfScheme {
  return text(row.kdf_scheme) === 'client-v1' ? 'client-v1' : 'server-v1';
}

function verifierIterations(options: { verifierIterations?: number }): number {
  const requested = options.verifierIterations ?? Number(process.env.AUTH_VERIFIER_ITERATIONS);
  const iterations = Number.isFinite(requested) && requested > 0 ? Math.trunc(requested) : SERVER_VERIFIER_ITERATIONS;
  if (iterations < MIN_SERVER_VERIFIER_ITERATIONS || iterations > MAX_SERVER_VERIFIER_ITERATIONS)
    throw new AuthError('not_configured', 'AUTH_VERIFIER_ITERATIONS hors bornes');
  return iterations;
}

function verifierPepper(options: { verifierPepper?: string } = {}): string {
  const pepper = options.verifierPepper ?? process.env.AUTH_VERIFIER_PEPPER ?? '';
  if (pepper.length >= 16) return pepper;
  if (productionLike() && process.env.AUTH_ALLOW_NO_PEPPER !== 'true')
    throw new AuthError('not_configured', 'AUTH_VERIFIER_PEPPER absente (16 caractères minimum)');
  // Développement/tests : poivre constant, jamais utilisé hors développement.
  return 'pepper-de-developpement-non-secret';
}

/** Le vérificateur stocké ne permet jamais de remonter au mot de passe ni à la clé client. */
function verifierMaterial(verifier: string, pepper: string): string {
  return `${pepper}:${verifier}`;
}

export async function hashClientVerifier(
  verifier: string,
  options: { verifierPepper?: string; verifierIterations?: number } = {}
): Promise<string> {
  if (!isClientVerifier(verifier)) throw new AuthError('invalid_input', 'verifier');
  return hashPassword(verifierMaterial(verifier, verifierPepper(options)), verifierIterations(options));
}

export async function verifyClientVerifier(
  verifier: string,
  stored: string,
  options: { verifierPepper?: string; verifierIterations?: number } = {}
): Promise<PasswordCheck> {
  if (!isClientVerifier(verifier)) return { ok: false, needsRehash: false };
  const check = await verifyPassword(verifierMaterial(verifier, verifierPepper(options)), stored);
  const target = verifierIterations(options);
  const storedIterations = Number(stored.split('$')[1]);
  return { ok: check.ok, needsRehash: check.ok && storedIterations !== target };
}

/** Une clé dérivée est un secret de 32 octets en base64url — jamais un mot de passe. */
export function isClientVerifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Empreinte factice de même coût, employée quand l'adresse est inconnue. */
export const DUMMY_VERIFIER_HASH =
  `pbkdf2-sha256$${SERVER_VERIFIER_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

/* ---------------------------------------------------- paramètres de dérivation */

export type DerivationParams = {
  scheme: KdfScheme;
  /** Sel public du compte (ou sel factice déterministe si l'adresse est inconnue). */
  salt: string;
  /** Itérations à appliquer côté navigateur. */
  iterations: number;
  /** Version d'algorithme, pour permettre une évolution sans casser l'existant. */
  algorithm: 'PBKDF2-SHA256';
};

/**
 * Paramètres publics de dérivation pour une adresse donnée.
 *
 * Anti-énumération : pour une adresse inconnue, le sel est calculé de façon
 * DÉTERMINISTE à partir d'un secret serveur. Deux appels pour la même adresse
 * renvoient donc la même valeur — impossible de distinguer « compte existant »
 * de « adresse inconnue » depuis l'extérieur.
 */
export async function derivationParams(
  db: Db,
  rawEmail: string,
  secret: string
): Promise<DerivationParams> {
  const email = normalizeEmail(rawEmail);
  const found = await db.execute({
    sql: 'SELECT kdf_scheme, client_salt, client_iterations FROM users WHERE email_normalized = ?',
    args: [email],
  });
  const row = found.rows[0];
  if (row && schemeOf(row) === 'client-v1') {
    const salt = text(row.client_salt);
    const iterations = int(row.client_iterations);
    if (!salt || !iterations) throw new Error('Paramètres de dérivation illisibles');
    return { scheme: 'client-v1', salt, iterations, algorithm: 'PBKDF2-SHA256' };
  }
  if (row) {
    // Compte hérité : le navigateur envoie le mot de passe, le serveur le hache.
    return { scheme: 'server-v1', salt: '', iterations: 0, algorithm: 'PBKDF2-SHA256' };
  }
  return {
    scheme: 'client-v1',
    salt: await deterministicSalt(secret, email),
    iterations: CLIENT_KDF_ITERATIONS,
    algorithm: 'PBKDF2-SHA256',
  };
}

/** Sel factice stable : HMAC(secret, "davar-salt:" + email), tronqué et encodé. */
export async function deterministicSalt(secret: string, email: string): Promise<string> {
  if (!secret || secret.length < 32) throw new AuthError('not_configured', 'secret de dérivation absent');
  const key = await crypto.subtle.importKey(
    'raw',
    te.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, te.encode(`davar-salt:${email}`));
  return toBase64Url(new Uint8Array(digest).slice(0, FAKE_SALT_BYTES));
}

/** Sel aléatoire d'un nouveau compte (public, jamais secret). */
export function randomClientSalt(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(FAKE_SALT_BYTES)));
}

/* -------------------------------------------------------- inscription client-v1 */

export type ClientRegistrationInput = {
  email: string;
  displayName: string;
  /** Clé dérivée par le navigateur (base64url, 32 octets). */
  verifier: string;
  /** Sel fourni par `derivationParams` : refusé s'il ne correspond pas à l'attendu. */
  salt: string;
  iterations: number;
  now?: number;
  verificationTtlMs?: number;
  verifierPepper?: string;
  verifierIterations?: number;
};

export async function registerClientUser(
  db: Db,
  input: ClientRegistrationInput
): Promise<RegistrationResult> {
  const email = normalizeEmail(input.email);
  const displayName = validateDisplayName(input.displayName);
  if (!isClientVerifier(input.verifier)) throw new AuthError('invalid_input', 'verifier');
  if (typeof input.salt !== 'string' || input.salt.length < 16 || input.salt.length > 128)
    throw new AuthError('invalid_input', 'salt');
  if (!Number.isInteger(input.iterations) || input.iterations < 100_000 || input.iterations > 2_000_000)
    throw new AuthError('invalid_input', 'iterations');

  const now = input.now ?? Date.now();
  const userId = newId('usr');
  const passwordHash = await hashClientVerifier(input.verifier, input);
  const inserted = await db.execute({
    sql: `INSERT INTO users(id, email_normalized, display_name, password_hash, role, status,
                             created_at_ms, kdf_scheme, client_salt, client_iterations)
          SELECT ?, ?, ?, ?, 'student', 'active', ?, 'client-v1', ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM users WHERE email_normalized = ?)`,
    args: [userId, email, displayName, passwordHash, now, input.salt, input.iterations, email],
  });
  if ((inserted.rowsAffected ?? 0) !== 1) throw new AuthError('email_taken');

  const verificationToken = await createEmailToken(db, userId, 'verify_email', now, input.verificationTtlMs);
  return { userId, email, verificationToken };
}

/* ------------------------------------------------------- limitation de débit */

export type RateLimitVerdict = { allowed: boolean; attempts: number; retryAfterSeconds: number };

/**
 * Consomme un essai dans une fenêtre glissante simple. Le compteur est mis à jour
 * en une seule instruction SQL (atomique), puis relu pour décider.
 */
export async function consumeRateLimit(
  db: Db,
  bucket: string,
  options: { limit: number; windowMs: number; now?: number }
): Promise<RateLimitVerdict> {
  const now = options.now ?? Date.now();
  await db.execute({
    sql: `INSERT INTO rate_limits(bucket, window_started_at_ms, attempts) VALUES (?, ?, 1)
          ON CONFLICT(bucket) DO UPDATE SET
            attempts = CASE WHEN excluded.window_started_at_ms - rate_limits.window_started_at_ms >= ?
                            THEN 1 ELSE rate_limits.attempts + 1 END,
            window_started_at_ms = CASE WHEN excluded.window_started_at_ms - rate_limits.window_started_at_ms >= ?
                                        THEN excluded.window_started_at_ms ELSE rate_limits.window_started_at_ms END`,
    args: [bucket, now, options.windowMs, options.windowMs],
  });
  const result = await db.execute({ sql: 'SELECT window_started_at_ms, attempts FROM rate_limits WHERE bucket = ?', args: [bucket] });
  const row = result.rows[0];
  const startedAt = int(row?.window_started_at_ms);
  const attempts = int(row?.attempts);
  if (startedAt === null || attempts === null) throw new Error('Compteur de débit illisible');
  const allowed = attempts <= options.limit;
  const retryAfterMs = allowed ? 0 : Math.max(0, startedAt + options.windowMs - now);
  return { allowed, attempts, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
}

/** Clé de compteur non réversible : aucun e-mail ni IP en clair dans la base. */
export async function rateLimitKey(scope: string, subject: string): Promise<string> {
  return `${scope}:${await hashToken(subject.trim().toLowerCase())}`;
}

/* ----------------------------------------------------------------- inscription */

export type RegistrationInput = {
  email: string;
  displayName: string;
  password: string;
  now?: number;
  verificationTtlMs?: number;
};

export type RegistrationResult = { userId: string; email: string; verificationToken: string };

/**
 * Crée un compte NON vérifié et un jeton de vérification (jamais renvoyé par l'API
 * en dehors du lien envoyé par e-mail).
 */
export async function registerUser(
  db: Db,
  input: RegistrationInput,
  kdf: KdfAdapter = localKdfAdapter
): Promise<RegistrationResult> {
  const email = normalizeEmail(input.email);
  const displayName = validateDisplayName(input.displayName);
  const password = assertPasswordPolicy(input.password, email);
  const now = input.now ?? Date.now();
  const passwordHash = await kdf.hash(password);

  const userId = newId('usr');
  const inserted = await db.execute({
    sql: `INSERT INTO users(id, email_normalized, display_name, password_hash, role, status, created_at_ms)
          SELECT ?, ?, ?, ?, 'student', 'active', ?
          WHERE NOT EXISTS (SELECT 1 FROM users WHERE email_normalized = ?)`,
    args: [userId, email, displayName, passwordHash, now, email],
  });
  if ((inserted.rowsAffected ?? 0) !== 1) throw new AuthError('email_taken');

  const verificationToken = await createEmailToken(db, userId, 'verify_email', now, input.verificationTtlMs);
  return { userId, email, verificationToken };
}

export async function createEmailToken(
  db: Db,
  userId: string,
  purpose: 'verify_email' | 'reset_password',
  now = Date.now(),
  ttlMs = 24 * 60 * 60 * 1000
): Promise<string> {
  const token = newToken(32);
  await db.execute({
    sql: `INSERT INTO email_tokens(token_hash, user_id, purpose, created_at_ms, expires_at_ms)
          VALUES (?, ?, ?, ?, ?)`,
    args: [await hashToken(token), userId, purpose, now, now + ttlMs],
  });
  return token;
}

export type ConsumedToken = { userId: string; purpose: 'verify_email' | 'reset_password' };

/** Consomme un jeton à usage unique. Lève `invalid_token` si expiré, déjà utilisé ou inconnu. */
export async function consumeEmailToken(
  db: Db,
  token: string,
  purpose: 'verify_email' | 'reset_password',
  now = Date.now()
): Promise<ConsumedToken> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new AuthError('invalid_token');
  const tokenHash = await hashToken(token);
  const consumed = await db.execute({
    sql: `UPDATE email_tokens SET used_at_ms = ?
          WHERE token_hash = ? AND purpose = ? AND used_at_ms IS NULL AND expires_at_ms > ?
          RETURNING user_id`,
    args: [now, tokenHash, purpose, now],
  });
  const userId = text(consumed.rows[0]?.user_id);
  if (!userId) throw new AuthError('invalid_token');
  await db.execute({
    sql: 'UPDATE users SET email_verified_at_ms = COALESCE(email_verified_at_ms, ?) WHERE id = ?',
    args: [now, userId],
  });
  return { userId, purpose };
}

/* ------------------------------------------------------------------- connexion */

export type SessionResult = { token: string; expiresAtMs: number; user: AuthUser };

export type LoginInput = {
  email: string;
  /** Mot de passe en clair (compte hérité, haché côté serveur) — jamais journalisé. */
  password?: string;
  /** Clé dérivée par le navigateur (schéma client-v1) : 32 octets en base64url. */
  verifier?: string;
  now?: number;
  sessionTtlMs?: number;
  ipHash?: string;
};

/**
 * Connexion, tous schémas confondus.
 *
 *  - `client-v1` : le navigateur a dérivé la clé (PBKDF2 600 000 itérations) ;
 *    le serveur ne fait qu'une vérification bon marché, compatible avec le
 *    plafond de 10 ms de CPU par requête de Cloudflare Workers Free.
 *  - `server-v1` (comptes hérités) : le hachage est fait côté serveur, ce qui
 *    suppose un hôte qui en a le budget CPU.
 *
 * Le schéma du compte n'est jamais choisi par le client : il est lu en base et
 * un écart est refusé (`kdf_scheme_mismatch`).
 */
export async function loginUser(
  db: Db,
  input: LoginInput,
  kdf: KdfAdapter = localKdfAdapter,
  options: { verifierPepper?: string; verifierIterations?: number } = {}
): Promise<SessionResult> {
  const now = input.now ?? Date.now();
  const email = normalizeEmail(input.email);
  const hasVerifier = typeof input.verifier === 'string' && input.verifier.length > 0;
  const credential = hasVerifier ? input.verifier! : typeof input.password === 'string' ? input.password : '';

  // Anti-bruteforce par identité ET par origine réseau (compteurs non réversibles).
  const emailBucket = await rateLimitKey('login.email', email);
  const verdicts = [await consumeRateLimit(db, emailBucket, { limit: 10, windowMs: 15 * 60 * 1000, now })];
  if (input.ipHash) {
    const ipBucket = await rateLimitKey('login.ip', input.ipHash);
    verdicts.push(await consumeRateLimit(db, ipBucket, { limit: 40, windowMs: 15 * 60 * 1000, now }));
  }
  const blocked = verdicts.find((verdict) => !verdict.allowed);
  if (blocked) throw new AuthError('rate_limited', undefined, blocked.retryAfterSeconds);

  const found = await db.execute({
    sql: `SELECT id, email_normalized, display_name, role, status, password_hash,
                 email_verified_at_ms, kdf_scheme, client_salt, client_iterations
          FROM users WHERE email_normalized = ?`,
    args: [email],
  });
  const row = found.rows[0];
  if (!row) {
    // Même coût CPU qu'un compte réel : limite l'énumération par mesure de temps.
    if (hasVerifier) await verifyClientVerifier(credential, DUMMY_VERIFIER_HASH, options);
    else await kdf.verify(credential, DUMMY_PASSWORD_HASH);
    throw new AuthError('invalid_credentials');
  }

  const scheme = schemeOf(row);
  const stored = text(row.password_hash) ?? '';
  let check: PasswordCheck;
  if (hasVerifier) {
    if (scheme !== 'client-v1') throw new AuthError('kdf_scheme_mismatch');
    check = await verifyClientVerifier(credential, stored, options);
  } else {
    if (scheme === 'client-v1') throw new AuthError('kdf_scheme_mismatch');
    check = await kdf.verify(credential, stored);
  }
  if (!check.ok) throw new AuthError('invalid_credentials');

  const status = text(row.status) ?? 'active';
  if (status === 'suspended') throw new AuthError('account_suspended');
  const user = mapUser(row);
  if (!user.emailVerified) throw new AuthError('email_not_verified');

  if (check.needsRehash) {
    // Mise à niveau du vérificateur, dans le schéma du compte.
    const upgraded = hasVerifier
      ? await hashClientVerifier(credential, options)
      : await kdf.hash(credential);
    await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [upgraded, user.id] });
  }

  const session = await createSession(db, user.id, now, input.sessionTtlMs ?? 30 * 24 * 60 * 60 * 1000);
  await db.execute({ sql: 'UPDATE users SET last_login_at_ms = ? WHERE id = ?', args: [now, user.id] });
  return { ...session, user };
}

export async function createSession(
  db: Db,
  userId: string,
  now = Date.now(),
  ttlMs = 30 * 24 * 60 * 60 * 1000
): Promise<{ token: string; expiresAtMs: number }> {
  const token = newToken(32);
  const expiresAtMs = now + ttlMs;
  await db.execute({
    sql: 'INSERT INTO sessions(token_hash, user_id, created_at_ms, expires_at_ms, last_seen_at_ms) VALUES (?, ?, ?, ?, ?)',
    args: [await hashToken(token), userId, now, expiresAtMs, now],
  });
  return { token, expiresAtMs };
}

export type SessionUser = AuthUser & { sessionExpiresAtMs: number };

/** Valide une session. Renvoie null (jamais une exception) si le jeton est inconnu ou expiré. */
export async function resolveSession(db: Db, token: string, now = Date.now()): Promise<SessionUser | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const tokenHash = await hashToken(token);
  const found = await db.execute({
    sql: `SELECT u.id, u.email_normalized, u.display_name, u.role, u.status, u.email_verified_at_ms,
                 s.expires_at_ms, s.last_seen_at_ms
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ?`,
    args: [tokenHash],
  });
  const row = found.rows[0];
  if (!row) return null;
  const expiresAtMs = int(row.expires_at_ms);
  if (expiresAtMs === null || expiresAtMs <= now) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [tokenHash] });
    return null;
  }
  if ((text(row.status) ?? 'active') === 'suspended') return null;
  const lastSeen = int(row.last_seen_at_ms) ?? 0;
  // Renouvellement glissant, écrit au maximum une fois par jour.
  if (now - lastSeen > 24 * 60 * 60 * 1000) {
    await db.execute({ sql: 'UPDATE sessions SET last_seen_at_ms = ?, expires_at_ms = ? WHERE token_hash = ?', args: [now, now + 30 * 24 * 60 * 60 * 1000, tokenHash] });
    return { ...mapUser(row), sessionExpiresAtMs: now + 30 * 24 * 60 * 60 * 1000 };
  }
  return { ...mapUser(row), sessionExpiresAtMs: expiresAtMs };
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  if (typeof token !== 'string' || token.length < 20) return;
  await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [await hashToken(token)] });
}

/* ------------------------------------------- rattachement des achats vérifiés */

/**
 * Attribue les formations déjà payées (ventes Chariow vérifiées par webhook) à un
 * compte dont l'e-mail est CONFIRMÉ. Idempotent : jamais de doublon d'inscription.
 */
export async function claimPurchasesForVerifiedUser(db: Db, userId: string, now = Date.now()): Promise<number> {
  const result = await db.execute({
    sql: `INSERT INTO enrollments(user_id, training_id, source, sale_id, acquired_at_ms)
          SELECT u.id, p.training_id, 'verified_purchase', p.sale_id, ?
          FROM users u JOIN verified_purchases p ON p.buyer_email_normalized = u.email_normalized
          WHERE u.id = ? AND u.email_verified_at_ms IS NOT NULL
          ON CONFLICT(user_id, training_id) DO NOTHING`,
    args: [now, userId],
  });
  return result.rowsAffected ?? 0;
}
