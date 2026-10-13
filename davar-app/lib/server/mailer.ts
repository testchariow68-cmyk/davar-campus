/**
 * Envoi d'e-mail — SERVEUR UNIQUEMENT, désactivé par défaut.
 *
 * Deux fournisseurs gratuits sont supportés, sans carte bancaire :
 *  - `brevo`       : API transactionnelle Brevo, 300 e-mails/jour sur l'offre
 *                    gratuite (marketing + transactionnel partagent le quota).
 *  - `apps_script` : script Google Apps Script déjà présent dans le projet
 *                    (utilisable en secours, quota Google plus serré).
 *
 * Tant que rien n'est configuré, l'application REFUSE de créer un compte
 * réel hors développement : un compte non vérifiable serait inutilisable et la
 * confirmation d'e-mail est la preuve exigée pour rattacher un achat Chariow.
 *
 * Chaque envoi est compté (`email.sent`) pour protéger le quota gratuit.
 */
import { budgetFor, countOp, recordOpEvent, type Db } from './quota.ts';

export class MailerNotConfiguredError extends Error {
  constructor() {
    super("Envoi d'e-mail non configuré");
    this.name = 'MailerNotConfiguredError';
  }
}

export class MailQuotaReachedError extends Error {
  constructor() {
    super('Quota d’e-mails du jour atteint');
    this.name = 'MailQuotaReachedError';
  }
}

export type MailerKind = 'none' | 'apps_script' | 'brevo';

export function mailerKind(): MailerKind {
  const declared = process.env.MAILER_KIND?.trim();
  if (declared === 'brevo' || declared === 'apps_script') return declared;
  return 'none';
}

function httpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function mailerConfigured(): boolean {
  if (mailerKind() === 'brevo') {
    const key = process.env.BREVO_API_KEY?.trim();
    const from = process.env.MAIL_FROM_EMAIL?.trim();
    return Boolean(key && key.length >= 20 && from && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from));
  }
  if (mailerKind() === 'apps_script') {
    const token = process.env.MAIL_APPS_SCRIPT_TOKEN?.trim();
    return Boolean(httpsUrl(process.env.MAIL_APPS_SCRIPT_URL) && token && token.length >= 16);
  }
  return false;
}

export type OutgoingEmail = { to: string; subject: string; text: string };

async function sendViaBrevo(message: OutgoingEmail, apiKey: string): Promise<void> {
  const senderEmail = process.env.MAIL_FROM_EMAIL!.trim();
  const senderName = process.env.MAIL_FROM_NAME?.trim() || 'Davar Académie Campus';
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Envoi d'e-mail refusé (${response.status})`);
}

async function sendViaAppsScript(message: OutgoingEmail): Promise<void> {
  const url = httpsUrl(process.env.MAIL_APPS_SCRIPT_URL)!;
  const token = process.env.MAIL_APPS_SCRIPT_TOKEN!.trim();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: token, to: message.to, subject: message.subject, text: message.text }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Envoi d'e-mail refusé (${response.status})`);
}

/**
 * Envoie un e-mail en respectant le budget quotidien configuré.
 * `db` est optionnel : il ne sert qu'au journal d'opérations (aucune donnée
 * personnelle n'y est écrite).
 */
export async function sendEmail(message: OutgoingEmail, db?: Db): Promise<void> {
  if (!mailerConfigured()) throw new MailerNotConfiguredError();
  if (!countOp('email.sent')) {
    if (db) await recordOpEvent(db, 'email_refused');
    throw new MailQuotaReachedError();
  }
  if (mailerKind() === 'brevo') await sendViaBrevo(message, process.env.BREVO_API_KEY!.trim());
  else await sendViaAppsScript(message);
  if (db) await recordOpEvent(db, 'email_sent');
}

/** Budget quotidien restant, sans révéler la configuration du fournisseur. */
export function emailBudget(): { kind: MailerKind; configured: boolean; dailyLimit: number } {
  return { kind: mailerKind(), configured: mailerConfigured(), dailyLimit: budgetFor('email.sent').limit };
}

export async function sendVerificationEmail(
  input: { to: string; displayName: string; verifyUrl: string },
  db?: Db
): Promise<void> {
  await sendEmail(
    {
      to: input.to,
      subject: 'DAVAR Campus — confirmez votre adresse e-mail',
      text: [
        `Bonjour ${input.displayName},`,
        '',
        'Confirmez votre adresse e-mail pour activer votre accès au campus Davar Académie :',
        input.verifyUrl,
        '',
        'Ce lien est valable 24 heures et ne sert qu’une seule fois.',
        'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
        '',
        'DAVAR Académie — Abidjan',
      ].join('\n'),
    },
    db
  );
}
