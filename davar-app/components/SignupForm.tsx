'use client';

import { useState } from 'react';
import Link from 'next/link';
import { deriveClientKey, fetchDerivationParameters } from '@/lib/client/derive';

/**
 * INSCRIPTION EN DEUX ÉTAPES — à l'identique du prototype.
 *
 * Le prototype (vSignup, js/views-student.js ligne 82) ne demande d'abord que
 * l'adresse e-mail, avec un bouton « Vérifier mon e-mail ». La configuration du
 * compte n'apparaît qu'ensuite, une fois l'adresse reconnue. Tous les textes et
 * tous les libellés ci-dessous sont ceux du prototype, sans ajout.
 */
const MESSAGES: Record<string, string> = {
  invalid_input: 'Vérifiez le nom, l’adresse e-mail et le mot de passe (8 caractères minimum).',
  email_taken: 'Un compte existe déjà avec cet e-mail : connectez-vous.',
  no_purchase:
    'Aucun achat ni invitation trouvé pour cet e-mail. Entrez l’adresse e-mail utilisée lors de votre achat, c’est celui sur lequel vous avez reçu le message de succès de votre achat.',
  rate_limited: 'Trop de créations depuis cette connexion. Patientez avant de réessayer.',
  email_delivery_not_configured:
    'Les inscriptions sont fermées : l’envoi d’e-mails de confirmation n’est pas encore configuré sur ce serveur.',
  origin_refused: 'Requête refusée : origine non reconnue.',
  not_configured: 'Les inscriptions ne sont pas encore configurées sur ce serveur.',
  unavailable: 'Service momentanément indisponible. Réessayez plus tard.',
};

type Result = { mode: 'sent' } | { mode: 'dev'; url: string };

export function SignupForm({ invitation }: { invitation?: string } = {}) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [formations, setFormations] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  /** Étape 1 : l'e-mail d'achat, et rien d'autre. */
  async function verifierEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy('checking');
    setError(null);
    try {
      const response = await fetch('/api/auth/verifier-achat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        formations?: number;
      };
      if (!response.ok || !payload.ok) {
        setError(MESSAGES[payload.error ?? 'unavailable'] ?? 'Adresse non reconnue.');
        return;
      }
      setFormations(payload.formations ?? 0);
      setStep(2);
    } catch {
      setError(MESSAGES.unavailable);
    } finally {
      setBusy(null);
    }
  }

  /** Étape 2 : la configuration du compte. */
  async function creerCompte(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Mots de passe invalides ou différents.');
      return;
    }
    setBusy('params');
    setError(null);
    try {
      // 1. Paramètres publics : sel et nombre d'itérations.
      const parameters = await fetchDerivationParameters(email);
      if (!parameters.ok) {
        setError(MESSAGES[parameters.error] ?? MESSAGES.unavailable);
        return;
      }
      if (parameters.parameters.scheme !== 'client-v1') {
        setError(MESSAGES.unavailable);
        return;
      }

      // 2. Le travail coûteux se fait dans ce navigateur ; le mot de passe ne
      //    quitte jamais l'appareil, seule la clé dérivée est envoyée.
      setBusy('deriving');
      const verifier = await deriveClientKey(password, parameters.parameters);

      setBusy('sending');
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName,
          email,
          ...(invitation ? { invitation } : {}),
          verifier,
          salt: parameters.parameters.salt,
          iterations: parameters.parameters.iterations,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        emailSent?: boolean;
        devVerificationUrl?: string;
      };
      if (!response.ok) {
        setError(MESSAGES[payload.error ?? 'unavailable'] ?? 'Inscription refusée.');
        return;
      }
      setResult(payload.devVerificationUrl ? { mode: 'dev', url: payload.devVerificationUrl } : { mode: 'sent' });
    } catch {
      setError(MESSAGES.unavailable);
    } finally {
      setBusy(null);
    }
  }

  if (result) {
    return (
      <div>
        <div className="banner ok" role="status">
          <span>
            Compte créé. Confirmez votre adresse e-mail pour activer l’accès : le lien est valable 24 heures.
          </span>
        </div>
        {result.mode === 'dev' && (
          <div className="banner warn mt16">
            <span>
              Mode développement : aucun e-mail n’est envoyé. Lien de confirmation à ouvrir manuellement —{' '}
              <a href={result.url}>confirmer mon adresse</a>.
            </span>
          </div>
        )}
        <p className="small mt16" style={{ textAlign: 'center' }}>
          <Link href="/connexion">Aller à la connexion</Link>
        </p>
      </div>
    );
  }

  if (step === 1) {
    return (
      <>
        <h1>Créer mon compte</h1>
        <p>
          Entrez l’adresse e-mail utilisée lors de votre achat, c’est celui sur lequel vous avez reçu le message
          de succès de votre achat.
        </p>
        <form onSubmit={verifierEmail} noValidate>
          {error && (
            <div className="banner err" role="alert">
              <span>{error}</span>
            </div>
          )}
          <label htmlFor="signup-email">Adresse e-mail d’achat</label>
          <input
            id="signup-email"
            className="inp"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vous@exemple.com"
          />
          <button type="submit" disabled={busy !== null}>
            {busy === 'checking' ? 'Vérification…' : 'Vérifier mon e-mail'}
          </button>
          <p className="small" style={{ textAlign: 'center', marginTop: 14 }}>
            Déjà inscrit ? <Link href="/connexion">Se connecter</Link>
          </p>
        </form>
      </>
    );
  }

  return (
    <>
      <h1>Configurer mon compte</h1>
      <div className="banner ok" role="status">
        <span>
          E-mail reconnu ✓{' '}
          {formations > 0
            ? 'Vos formations seront ajoutées automatiquement à votre compte.'
            : 'Invitation valide — configurez votre accès.'}
        </span>
      </div>
      <form onSubmit={creerCompte} noValidate>
        {error && (
          <div className="banner err" role="alert">
            <span>{error}</span>
          </div>
        )}
        <label htmlFor="signup-email-locked">Adresse e-mail (verrouillée)</label>
        <input id="signup-email-locked" className="inp" value={email} disabled />
        <label htmlFor="signup-name">Nom complet (max 21 caractères)</label>
        <input
          id="signup-name"
          className="inp"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={21}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Tel qu’il apparaîtra sur vos certificats"
        />
        <label htmlFor="signup-password">Mot de passe</label>
        <input
          id="signup-password"
          className="inp"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="8 caractères minimum"
        />
        <label htmlFor="signup-confirm">Confirmer le mot de passe</label>
        <input
          id="signup-confirm"
          className="inp"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <button type="submit" disabled={busy !== null}>
          {busy === 'params'
            ? 'Préparation…'
            : busy === 'deriving'
              ? 'Protection de votre mot de passe…'
              : busy === 'sending'
                ? 'Création…'
                : 'Créer mon compte'}
        </button>
        <p className="small" style={{ textAlign: 'center', marginTop: 14 }}>
          <Link href="/connexion">Retour à la connexion</Link>
        </p>
      </form>
    </>
  );
}
