/**
 * Dérivation du mot de passe — CÔTÉ NAVIGATEUR UNIQUEMENT (Web Crypto natif).
 *
 * C'est ici que se passe le travail coûteux (PBKDF2-SHA256, 600 000 itérations).
 * Le mot de passe ne quitte JAMAIS l'appareil : seul le résultat de la
 * dérivation (32 octets) est envoyé au serveur, qui le revérifie à faible coût.
 *
 * Conséquences directes :
 *  - aucune location d'hébergement supplémentaire n'est nécessaire ;
 *  - le plafond de 10 ms de CPU par requête de l'offre gratuite n'est jamais
 *    franchi côté serveur ;
 *  - la résistance hors ligne reste celle des 600 000 itérations.
 *
 * Aucun import applicatif : ce module doit rester utilisable dans un Worker de
 * navigateur, une page statique ou un test Node.
 */

export type DerivationParameters = {
  scheme: 'server-v1' | 'client-v1';
  salt: string;
  iterations: number;
  algorithm: 'PBKDF2-SHA256';
};

export class DerivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DerivationError';
  }
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

/**
 * Dérive la clé du compte à partir du mot de passe et des paramètres publics.
 * Renvoie 32 octets en base64url (43 caractères) — jamais le mot de passe.
 */
export async function deriveClientKey(
  password: string,
  parameters: Pick<DerivationParameters, 'salt' | 'iterations'>
): Promise<string> {
  if (typeof password !== 'string' || password.length < 1) throw new DerivationError('mot de passe vide');
  if (!parameters.salt) throw new DerivationError('sel absent');
  if (!Number.isInteger(parameters.iterations) || parameters.iterations < 100_000)
    throw new DerivationError('itérations insuffisantes');
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new DerivationError('Web Crypto indisponible');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromBase64Url(parameters.salt) as unknown as BufferSource,
      iterations: parameters.iterations,
    },
    key,
    256
  );
  return toBase64Url(new Uint8Array(bits));
}

export type ParamsFetchResult =
  | { ok: true; parameters: DerivationParameters }
  | { ok: false; error: string; retryAfterSeconds?: number };

/** Récupère les paramètres publics de dérivation (sel + itérations). */
export async function fetchDerivationParameters(email: string): Promise<ParamsFetchResult> {
  try {
    const response = await fetch('/api/auth/params', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<DerivationParameters> & {
      error?: string;
      retryAfterSeconds?: number;
    };
    if (!response.ok) {
      return { ok: false, error: payload.error ?? 'unavailable', retryAfterSeconds: payload.retryAfterSeconds };
    }
    const scheme = payload.scheme === 'server-v1' ? 'server-v1' : payload.scheme === 'client-v1' ? 'client-v1' : null;
    if (!scheme || typeof payload.salt !== 'string' || typeof payload.iterations !== 'number')
      return { ok: false, error: 'unavailable' };
    return {
      ok: true,
      parameters: { scheme, salt: payload.salt, iterations: payload.iterations, algorithm: 'PBKDF2-SHA256' },
    };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}
