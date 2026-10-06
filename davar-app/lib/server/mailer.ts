/**
 * Envoi d'e-mail — SERVEUR UNIQUEMENT, désactivé par défaut.
 *
 * Aucun fournisseur d'e-mail n'est configuré dans ce dépôt : tant que
 * MAILER_KIND vaut « none », l'application REFUSE de créer un compte réel
 * plutôt que de produire un compte impossible à vérifier. En développement,
 * le lien est renvoyé à l'opérateur pour test manuel.
 */

export class MailerNotConfiguredError extends Error {
  constructor() {
    super("Envoi d'e-mail non configuré");
    this.name = 'MailerNotConfiguredError';
  }
}

export type MailerKind = 'none' | 'apps_script';

export function mailerKind(): MailerKind {
  return process.env.MAILER_KIND?.trim() === 'apps_script' ? 'apps_script' : 'none';
}

export function mailerConfigured(): boolean {
  if (mailerKind() !== 'apps_script') return false;
  const url = process.env.MAIL_APPS_SCRIPT_URL?.trim();
  const token = process.env.MAIL_APPS_SCRIPT_TOKEN?.trim();
  if (!url || !token || token.length < 16) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export type OutgoingEmail = { to: string; subject: string; text: string };

/**
 * Envoie un e-mail via le script Apps Script configuré. Le secret partagé est
 * vérifié côté script ; il n'est jamais journalisé ici.
 */
export async function sendEmail(message: OutgoingEmail): Promise<void> {
  if (!mailerConfigured()) throw new MailerNotConfiguredError();
  const url = process.env.MAIL_APPS_SCRIPT_URL!.trim();
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

export async function sendVerificationEmail(input: {
  to: string;
  displayName: string;
  verifyUrl: string;
}): Promise<void> {
  await sendEmail({
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
  });
}
