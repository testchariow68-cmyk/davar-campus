/**
 * Envoi d'e-mail — SERVEUR UNIQUEMENT, désactivé par défaut.
 *
 * Un seul fournisseur, sans carte bancaire : le relais Google Apps Script déjà
 * présent dans le projet (le propriétaire l'a choisi ; le quota est celui de
 * Google). Aucun autre service d'envoi n'est câblé, et aucun n'est facturé.
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

export type MailerKind = 'none' | 'apps_script';

export function mailerKind(): MailerKind {
  const declared = process.env.MAILER_KIND?.trim();
  if (declared === 'apps_script') return declared;
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
  if (mailerKind() === 'apps_script') {
    const token = process.env.MAIL_APPS_SCRIPT_TOKEN?.trim();
    return Boolean(httpsUrl(process.env.MAIL_APPS_SCRIPT_URL) && token && token.length >= 16);
  }
  return false;
}

export type OutgoingEmail = { to: string; subject: string; text: string };

/**
 * Apps Script répond en deux temps : `/exec` renvoie d'abord une redirection
 * (302) vers `script.googleusercontent.com`. Suivie normalement, cette
 * redirection change le POST en GET — c'est la règle du HTTP. Le script
 * exécute alors `doGet` au lieu de `doPost`, répond « actif » avec un 200…
 * et AUCUN e-mail ne part, sans que rien ne le signale. On croit avoir
 * envoyé, on n'a rien envoyé.
 *
 * On suit donc la redirection à la main, en gardant le POST.
 */
async function posterVersAppsScript(url: string, corps: string, signal: AbortSignal): Promise<Response> {
  const entetes = { 'content-type': 'application/json' };
  const premier = await fetch(url, {
    method: 'POST',
    headers: entetes,
    body: corps,
    redirect: 'manual',
    cache: 'no-store',
    signal,
  });
  const redirection = [301, 302, 303, 307, 308].includes(premier.status);
  if (!redirection) return premier;
  const cible = premier.headers.get('location');
  if (!cible) return premier;
  return await fetch(new URL(cible, url).toString(), {
    method: 'POST',
    headers: entetes,
    body: corps,
    redirect: 'manual',
    cache: 'no-store',
    signal,
  });
}

async function sendViaAppsScript(message: OutgoingEmail): Promise<void> {
  const url = httpsUrl(process.env.MAIL_APPS_SCRIPT_URL)!;
  const token = process.env.MAIL_APPS_SCRIPT_TOKEN!.trim();
  const corps = JSON.stringify({
    secret: token,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
  const reponse = await posterVersAppsScript(url, corps, AbortSignal.timeout(10_000));
  const donnees = (await reponse.json().catch(() => ({}))) as {
    ok?: boolean;
    envoye?: boolean;
    message?: string;
  };
  // Le relais confirme l'envoi par `envoye` (ou le mot « envoyé »). Toute
  // autre réponse — y compris un 200 « actif » venu de doGet — est un échec :
  // mieux vaut le dire que faire croire qu'un e-mail est parti.
  const parti = donnees.envoye === true || donnees.message === 'envoyé';
  if (!reponse.ok || !parti) {
    const detail = typeof donnees.message === 'string' ? ` : ${donnees.message.slice(0, 120)}` : '';
    throw new Error(`Envoi refusé par le relais (${reponse.status}${detail})`);
  }
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
  await sendViaAppsScript(message);
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
