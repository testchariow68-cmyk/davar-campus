/**
 * GMAIL — l'envoi par la messagerie de l'académie.
 *
 * Le propriétaire a choisi : « demande-moi l'autorisation une fois pour toute ».
 * On lui présente donc une adresse Google, une seule fois. Il accepte, il
 * colle le code qu'il reçoit, et c'est fini : la plateforme garde un jeton de
 * rafraîchissement, qu'il n'a plus jamais à retoucher. Google peut révoquer ce
 * jeton depuis le compte ; tant qu'il ne le fait pas, les e-mails partent.
 *
 * Aucune dépendance : deux appels HTTPS et du WebCrypto, rien d'autre.
 */
import type { Db } from './auth-core';
import { lireReglages, ecrireReglages } from './settings.ts';

const CLE_RAFRAICHISSEMENT = 'gmail.rafraichissement';
const CLE_ACCES = 'gmail.acces';
const CLE_EXPIRE = 'gmail.expire_ms';
const CLE_COMPTE = 'gmail.compte';

const PORTEE = 'https://www.googleapis.com/auth/gmail.send';
const TOKEN = 'https://oauth2.googleapis.com/token';
const ENVOI = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const PROFIL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

/** Le jeton est renouvelé une minute avant l'heure, jamais à la dernière seconde. */
const MARGE_MS = 60_000;

export class GmailNonAutoriseError extends Error {
  constructor() {
    super('Gmail n’a pas encore donné son autorisation');
    this.name = 'GmailNonAutoriseError';
  }
}

export function gmailConfigue(): boolean {
  return Boolean(process.env.GMAIL_CLIENT_ID?.trim() && process.env.GMAIL_CLIENT_SECRET?.trim());
}

/**
 * L'adresse à ouvrir une fois. `redirect_uri` doit être exactement celle
 * déclarée dans la console Google, sinon Google refuse.
 */
export function urlAutorisationGmail(redirectUri: string): string | null {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  if (!clientId) return null;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', PORTEE);
  // « offline » pour obtenir le jeton de rafraîchissement, « consent » pour
  // être certain de le recevoir même si le compte a déjà dit oui autrefois.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

/** Vrai quand le campus tient un jeton de rafraîchissement : il peut envoyer. */
export async function gmailAutorise(db: Db): Promise<boolean> {
  if (!gmailConfigue()) return false;
  const reglages = await lireReglages(db);
  return (reglages[CLE_RAFRAICHISSEMENT] ?? '').length > 20;
}

type ReponseJeton = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };

async function poster(url: string, corps: Record<string, string>): Promise<ReponseJeton> {
  const reponse = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corps).toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const donnees = (await reponse.json().catch(() => ({}))) as ReponseJeton;
  if (!reponse.ok) {
    if (donnees.error === 'invalid_grant') throw new GmailNonAutoriseError();
    throw new Error(`Gmail a refusé le jeton (${donnees.error ?? reponse.status})`);
  }
  return donnees;
}

/**
 * Échange le code collé par le propriétaire contre le jeton qui durera.
 * On note aussi l'adresse de la boîte, pour la lui montrer.
 */
export async function echangerCodeGmail(
  db: Db,
  code: string,
  redirectUri: string
): Promise<{ compte: string | null }> {
  const donnees = await poster(TOKEN, {
    code: code.trim(),
    client_id: process.env.GMAIL_CLIENT_ID!.trim(),
    client_secret: process.env.GMAIL_CLIENT_SECRET!.trim(),
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (!donnees.refresh_token) throw new GmailNonAutoriseError();
  const maintenant = Date.now();
  await ecrireReglages(
    db,
    {
      [CLE_RAFRAICHISSEMENT]: donnees.refresh_token,
      [CLE_ACCES]: donnees.access_token ?? '',
      [CLE_EXPIRE]: String(maintenant + (donnees.expires_in ?? 3600) * 1000),
    },
    maintenant
  );
  return { compte: await lireCompteGmail(db, donnees.access_token ?? '') };
}

async function lireCompteGmail(db: Db, acces: string): Promise<string | null> {
  if (!acces) return null;
  try {
    const reponse = await fetch(PROFIL, {
      headers: { authorization: `Bearer ${acces}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!reponse.ok) return null;
    const donnees = (await reponse.json()) as { emailAddress?: string };
    const compte = typeof donnees.emailAddress === 'string' ? donnees.emailAddress : null;
    if (compte) await ecrireReglages(db, { [CLE_COMPTE]: compte }, Date.now());
    return compte;
  } catch {
    return null;
  }
}

/** L'adresse de la boîte qui envoie, telle que Google la connaît. */
export async function compteGmail(db: Db): Promise<string | null> {
  const reglages = await lireReglages(db);
  return reglages[CLE_COMPTE] ?? null;
}

/** Un jeton d'accès valide : celui en mémoire s'il tient, sinon on le renouvelle. */
async function jetonAcces(db: Db): Promise<string> {
  const reglages = await lireReglages(db);
  const rafraichissement = reglages[CLE_RAFRAICHISSEMENT];
  if (!rafraichissement) throw new GmailNonAutoriseError();
  const acces = reglages[CLE_ACCES];
  const expire = Number(reglages[CLE_EXPIRE] ?? 0);
  if (acces && Number.isFinite(expire) && expire - MARGE_MS > Date.now()) return acces;

  const donnees = await poster(TOKEN, {
    client_id: process.env.GMAIL_CLIENT_ID!.trim(),
    client_secret: process.env.GMAIL_CLIENT_SECRET!.trim(),
    refresh_token: rafraichissement,
    grant_type: 'refresh_token',
  });
  if (!donnees.access_token) throw new GmailNonAutoriseError();
  const maintenant = Date.now();
  await ecrireReglages(
    db,
    {
      [CLE_ACCES]: donnees.access_token,
      [CLE_EXPIRE]: String(maintenant + (donnees.expires_in ?? 3600) * 1000),
    },
    maintenant
  );
  return donnees.access_token;
}

function b64url(texte: string): string {
  const octets = new TextEncoder().encode(texte);
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Les en-têtes accentués doivent être enveloppés (RFC 2047), sinon ils arrivent mangés. */
function entete(texte: string): string {
  if (/^[\x20-\x7E]*$/.test(texte)) return texte;
  return `=?UTF-8?B?${b64url(texte).replace(/-/g, '+').replace(/_/g, '/')}?=`;
}

/** Le message brut tel que Gmail l'attend : en-têtes, ligne vide, corps. */
export function messageBrut(message: {
  de: string;
  a: string;
  objet: string;
  texte: string;
}): string {
  const date = new Date().toUTCString();
  const brut =
    `From: ${entete(message.de)}\r\n` +
    `To: ${entete(message.a)}\r\n` +
    `Subject: ${entete(message.objet)}\r\n` +
    `Date: ${date}\r\n` +
    'MIME-Version: 1.0\r\n' +
    'Content-Type: text/plain; charset=UTF-8\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    b64url(message.texte);
  return b64url(brut);
}

/** Envoie par Gmail. L'adresse d'expédition doit être celle de la boîte, ou l'un de ses alias. */
export async function envoyerViaGmail(
  db: Db,
  message: { to: string; subject: string; text: string; de?: string }
): Promise<void> {
  if (!gmailConfigue()) throw new GmailNonAutoriseError();
  const acces = await jetonAcces(db);
  const compte = (await compteGmail(db)) ?? '';
  const expediteur = message.de && message.de !== compte ? message.de : compte;
  const brut = messageBrut({
    de: expediteur,
    a: message.to,
    objet: message.subject,
    texte: message.text,
  });
  const reponse = await fetch(ENVOI, {
    method: 'POST',
    headers: { authorization: `Bearer ${acces}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: brut }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (reponse.status === 401) throw new GmailNonAutoriseError();
  if (!reponse.ok) throw new Error(`Gmail a refusé l’envoi (${reponse.status})`);
}

/** Coupé volontairement : les jetons sont oubliés, plus rien ne part. */
export async function revoquerGmail(db: Db): Promise<void> {
  await ecrireReglages(db, { [CLE_RAFRAICHISSEMENT]: '', [CLE_ACCES]: '', [CLE_EXPIRE]: '0' }, Date.now());
}
