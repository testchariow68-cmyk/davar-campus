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
export async function registerUser(db: Db, input: RegistrationInput): Promise<RegistrationResult> {
  const email = normalizeEmail(input.email);
  const displayName = validateDisplayName(input.displayName);
  const password = assertPasswordPolicy(input.password, email);
  const now = input.now ?? Date.now();
  const iterations = pbkdf2Iterations();
  const passwordHash = await hashPassword(password, iterations);

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

export async function loginUser(
  db: Db,
  input: { email: string; password: string; now?: number; sessionTtlMs?: number; ipHash?: string }
): Promise<SessionResult> {
  const now = input.now ?? Date.now();
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';

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
    sql: 'SELECT id, email_normalized, display_name, role, status, password_hash, email_verified_at_ms FROM users WHERE email_normalized = ?',
    args: [email],
  });
  const row = found.rows[0];
  if (!row) {
    // Même coût CPU qu'un compte réel : limite l'énumération par mesure de temps.
    const cost = pbkdf2Iterations();
    await verifyPassword(
      password,
      `pbkdf2-sha256$${cost}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`
    );
    throw new AuthError('invalid_credentials');
  }
  const stored = text(row.password_hash) ?? '';
  const check = await verifyPassword(password, stored);
  if (!check.ok) throw new AuthError('invalid_credentials');

  const status = text(row.status) ?? 'active';
  if (status === 'suspended') throw new AuthError('account_suspended');
  const user = mapUser(row);
  if (!user.emailVerified) throw new AuthError('email_not_verified');

  if (check.needsRehash) {
    const upgraded = await hashPassword(password);
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
