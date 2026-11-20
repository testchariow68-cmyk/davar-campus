import {
  AuthError,
  consumeRateLimit,
  derivationParams,
  httpStatusForAuthError,
  rateLimitKey,
  registerClientUser,
  registerUser,
} from '@/lib/server/auth-core';
import { clientIp, isDevelopment, isSameOrigin, jsonNoStore, linkOrigin, readJsonBody } from '@/lib/server/http';
import { mailerConfigured, sendVerificationEmail } from '@/lib/server/mailer';
import { envoyerScenario } from '@/lib/server/courriels';
import { openDb } from '@/lib/server/turso';
import { trackApiRequest } from '@/lib/server/quota';
import { passwordAdapter } from '@/lib/server/password-service';
import { invitationDuToken, marquerInvitationUtilisee } from '@/lib/server/invitations';
import { normalizeEmail } from '@/lib/server/auth-core';
import { ecrirePreference } from '@/lib/server/profil';
import { deposerContenu, stockagePret } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';

/**
 * La photo choisie à l'inscription : 400 Ko au plus. Pourquoi si peu ? Parce
 * qu'elle voyage DANS la requête de création de compte, et qu'une requête ne
 * dépasse pas 1 Mo. Une photo plus lourde se dépose depuis le profil, où le
 * fichier part directement au stockage — là, la limite est celle des documents.
 */
const PHOTO_OCTETS_MAX = 400 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Une photo arrive en « data:image/…;base64,… » : rien d'autre n'est accepté. */
function lirePhoto(valeur: unknown): { extension: string; octets: Uint8Array } | null {
  if (typeof valeur !== 'string' || !valeur.startsWith('data:image/')) return null;
  const entete = valeur.slice(5, valeur.indexOf(';'));
  const extension = entete.replace('image/', '').toLowerCase();
  if (!PHOTO_TYPES[extension]) return null;
  const base64 = valeur.slice(valeur.indexOf(',') + 1);
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
  const binaire = atob(base64);
  if (binaire.length > PHOTO_OCTETS_MAX) return null;
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return { extension: extension === 'jpeg' ? 'jpg' : extension, octets };
}

/**
 * Création de compte. En production, aucun compte n'est créé si l'envoi
 * d'e-mail n'est pas configuré : un compte non vérifiable serait inutilisable
 * et la vérification d'e-mail est la preuve exigée pour rattacher un achat.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);

  const development = isDevelopment();
  if (!mailerConfigured() && !development)
    return jsonNoStore({ error: 'email_delivery_not_configured' }, 503);

  const origin = linkOrigin(request);
  if (!origin) return jsonNoStore({ error: 'origin_not_configured' }, 503);
  const db = await openDb();
  try {
    const ipBucket = await rateLimitKey('register.ip', clientIp(request));
    const verdict = await consumeRateLimit(db, ipBucket, { limit: 10, windowMs: 60 * 60 * 1000 });
    if (!verdict.allowed) throw new AuthError('rate_limited', undefined, verdict.retryAfterSeconds);

    // Deux chemins acceptés :
    //  - client-v1 (défaut) : le navigateur a dérivé la clé, le serveur ne fait
    //    qu'un contrôle bon marché ;
    //  - server-v1 (comptes hérités, outils internes) : hachage côté serveur.
    const usesClientDerivation = typeof body.verifier === 'string';
    const registration = usesClientDerivation
      ? await registerClientUser(db, {
          email: body.email as string,
          displayName: body.displayName as string,
          verifier: body.verifier as string,
          salt: body.salt as string,
          iterations: Number(body.iterations),
        })
      : await registerUser(
          db,
          {
            email: body.email as string,
            displayName: body.displayName as string,
            password: body.password as string,
          },
          passwordAdapter()
        );
    // Invitation éventuelle : elle est liée à UNE adresse. Un lien détourné vers
    // une autre adresse est refusé, jamais honoré.
    const invitationToken = typeof body.invitation === 'string' ? body.invitation : '';
    if (invitationToken) {
      const invitation = await invitationDuToken(db, invitationToken);
      if (!invitation || invitation.email !== normalizeEmail(String(body.email)))
        return jsonNoStore({ error: 'invitation_invalide' }, 403);
      await marquerInvitationUtilisee(db, invitation.id, registration.userId);
    }

    // La photo est facultative : jamais elle ne fait échouer une inscription.
    const photo = lirePhoto(body.photo);
    let photoGardee = false;
    if (photo && stockagePret()) {
      const cle = `photos/${registration.userId}/inscription-${Date.now().toString(36)}.${photo.extension}`;
      if (await deposerContenu(cle, photo.octets, PHOTO_TYPES[photo.extension])) {
        await ecrirePreference(db, registration.userId, 'photo.cle', cle);
        photoGardee = true;
      }
    }

    const verifyUrl = `${origin}/verifier-email?token=${encodeURIComponent(registration.verificationToken)}`;

    let emailSent = false;
    if (mailerConfigured()) {
      try {
        await sendVerificationEmail(
          { to: registration.email, displayName: String(body.displayName), verifyUrl },
          db
        );
        emailSent = true;
        // La bienvenue part avec la confirmation : le prototype souhaite la
        // bienvenue dès l'inscription, et prévient aussi dans la cloche.
        await envoyerScenario(db, 'bienvenue', registration.email, {
          nom: String(body.displayName),
          userId: registration.userId,
        });
      } catch {
        emailSent = false;
      }
    }
    return jsonNoStore(
      {
        ok: true,
        emailSent,
        photoGardee,
        // Le lien n'est renvoyé au navigateur QU'EN développement, pour test manuel.
        devVerificationUrl: development && !emailSent ? verifyUrl : undefined,
      },
      201
    );
  } catch (error) {
    if (error instanceof AuthError)
      return jsonNoStore(
        { error: error.code, retryAfterSeconds: error.retryAfterSeconds },
        httpStatusForAuthError(error.code)
      );
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
