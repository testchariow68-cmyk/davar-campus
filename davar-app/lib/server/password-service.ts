/**
 * Service de mots de passe — SERVEUR UNIQUEMENT.
 *
 * Pourquoi ce module existe : PBKDF2-HMAC-SHA256 à 600 000 itérations coûte
 * ~121 ms de CPU. C'est voulu (résistance au cassage hors ligne), mais cela
 * dépasse le plafond de 10 ms par requête du plan Cloudflare Workers gratuit.
 * Plutôt que d'affaiblir le hachage — jamais —, l'opération coûteuse est
 * DÉLÉGUÉE à un service qui vit sur une offre gratuite mesurée en temps CPU
 * mensuel (Oracle Cloud Always Free, Google Cloud Run free tier, ou tout
 * serveur personnel de l'opérateur : voir auth-kdf-service/README.md).
 *
 * Deux modes, choisis explicitement par `AUTH_KDF_MODE` :
 *  - `local`  : hachage dans le processus courant. Développement, et hôtes
 *               Node qui autorisent ce coût. **Refusé** en staging/production
 *               sauf dérogation explicite `AUTH_ALLOW_LOCAL_KDF=true`.
 *  - `remote` : appel signé au service dédié (recommandé pour Cloudflare).
 *
 * Le mot de passe ne transite que du serveur applicatif vers le service, en
 * HTTPS, sur un corps signé HMAC-SHA256 et horodaté (anti-rejeu). Il n'est
 * jamais journalisé, ni par l'application, ni par le service.
 */
import {
  CLIENT_KDF_ITERATIONS,
  SERVER_VERIFIER_ITERATIONS,
  hashPassword,
  verifyPassword,
  type KdfAdapter,
  type PasswordCheck,
} from './auth-core.ts';
import { budgetFor, countOp, verdictFor, windowTagFor } from './quota.ts';

export type KdfMode = 'client' | 'local' | 'remote';

export class PasswordServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordServiceError';
  }
}

function productionLike(): boolean {
  const env = process.env.APP_ENV;
  if (env === 'staging' || env === 'production') return true;
  if (env === 'development') return false;
  return process.env.NODE_ENV === 'production';
}

/**
 * Mode de dérivation. `client` est le défaut : le navigateur paie le coût CPU
 * (voir lib/client/derive.ts) et le serveur ne fait qu'une vérification brève,
 * ce qui suffit pour l'offre gratuite. `local` et `remote` restent disponibles
 * pour les outils internes et les comptes hérités.
 */
export function kdfMode(): KdfMode {
  const declared = process.env.AUTH_KDF_MODE?.trim();
  if (declared === 'client' || declared === 'local' || declared === 'remote') return declared;
  return 'client';
}

export function kdfRemoteConfig(): { url: string; token: string } | null {
  const url = process.env.AUTH_KDF_URL?.trim();
  const token = process.env.AUTH_KDF_TOKEN?.trim();
  if (!url || !token || token.length < 32) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const httpsOk = parsed.protocol === 'https:';
  const localOk = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (!httpsOk && !localOk) return null;
  return { url: parsed.toString(), token };
}

/* ---------------------------------------------------------- signature requête */

async function signBody(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Empêche qu'une panne du service délègue un hachage à un tiers non prévu. */
function assertAllowedRemote(config: { url: string }): void {
  const allowlist = process.env.AUTH_KDF_ALLOWED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowlist || allowlist.length === 0) return; // URL configurée par l'opérateur = référence
  const origin = new URL(config.url).origin;
  if (!allowlist.includes(origin)) throw new PasswordServiceError('Origine du service de hachage non autorisée');
}

async function callRemote(
  operations: { op: 'hash'; password: string } | { op: 'verify'; password: string; stored: string }
): Promise<unknown> {
  const config = kdfRemoteConfig();
  if (!config) throw new PasswordServiceError('Service de hachage non configuré');
  assertAllowedRemote(config);

  const budget = budgetFor('kdf.operations');
  if (!countOp('kdf.operations')) throw new PasswordServiceError('Quota de hachage journalier atteint');

  const timestamp = String(Date.now());
  const body = JSON.stringify({ v: 1, ...operations });
  const signature = await signBody(config.token, timestamp, body);
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-davar-timestamp': timestamp,
        'x-davar-signature': signature,
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PasswordServiceError('Service de hachage injoignable');
  }
  if (!response.ok) throw new PasswordServiceError(`Service de hachage refusé (${response.status})`);
  try {
    return await response.json();
  } catch {
    throw new PasswordServiceError('Réponse du service de hachage illisible');
  }
}

/* ------------------------------------------------------------------- API publique */

/** Hache un mot de passe : localement ou via le service selon AUTH_KDF_MODE. */
export async function derivePasswordHash(password: string): Promise<string> {
  if (kdfMode() === 'client') {
    // Le mode client n'hache jamais côté serveur : les nouveaux comptes passent
    // par registerClientUser, et les comptes hérités restent en « local ».
    return hashPassword(password);
  }
  if (kdfMode() === 'local') {
    if (productionLike() && process.env.AUTH_ALLOW_LOCAL_KDF !== 'true')
      throw new PasswordServiceError(
        'AUTH_KDF_MODE=local refusé en staging/production sans AUTH_ALLOW_LOCAL_KDF=true'
      );
    return hashPassword(password);
  }
  const payload = (await callRemote({ op: 'hash', password })) as { ok?: boolean; hash?: string };
  if (!payload?.ok || typeof payload.hash !== 'string' || !payload.hash.startsWith('pbkdf2-sha256$'))
    throw new PasswordServiceError('Hachage du service invalide');
  return payload.hash;
}

/**
 * Vérifie un mot de passe. En mode distant, le service renvoie aussi un hash
 * re-calculé si le coût stocké n'est plus celui de la politique courante.
 */
export async function checkPassword(password: string, stored: string): Promise<PasswordCheck> {
  if (kdfMode() === 'local') return verifyPassword(password, stored);
  const payload = (await callRemote({ op: 'verify', password, stored })) as {
    ok?: boolean;
    valid?: boolean;
    needsRehash?: boolean;
    upgradedHash?: string;
  };
  if (!payload?.ok || typeof payload.valid !== 'boolean')
    throw new PasswordServiceError('Vérification du service invalide');
  return {
    ok: payload.valid,
    needsRehash: payload.valid === true && payload.needsRehash === true && typeof payload.upgradedHash === 'string',
  };
}

/**
 * Adaptateur à injecter dans le noyau d'authentification : il applique la
 * politique choisie (local ou délégué) sans que les routes aient à s'en soucier.
 */
export function passwordAdapter(): KdfAdapter {
  return {
    hash: (password) => derivePasswordHash(password),
    verify: (password, stored) => checkPassword(password, stored),
  };
}

/** État lisible de la configuration, pour le diagnostic protégé (jamais de secret). */
export function kdfStatus(): {
  mode: KdfMode;
  remoteConfigured: boolean;
  dailyKdfBudget: number;
  clientIterations: number;
  serverVerifierIterations: number;
  paramsSecretConfigured: boolean;
} {
  return {
    mode: kdfMode(),
    remoteConfigured: kdfRemoteConfig() !== null,
    dailyKdfBudget: budgetFor('kdf.operations').limit,
    clientIterations: CLIENT_KDF_ITERATIONS,
    serverVerifierIterations: SERVER_VERIFIER_ITERATIONS,
    paramsSecretConfigured: Boolean((process.env.AUTH_PARAMS_SECRET ?? '').trim().length >= 32),
  };
}

export function kdfWindowRemaining(now = Date.now()): { windowTag: string; verdict: string } {
  return { windowTag: windowTagFor('day', now), verdict: verdictFor(0, budgetFor('kdf.operations').limit) };
}
