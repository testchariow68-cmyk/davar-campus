'use client';

import { useState } from 'react';
import Link from 'next/link';

const MESSAGES: Record<string, string> = {
  invalid_input: 'Vérifiez le nom, l’adresse e-mail et le mot de passe (10 caractères minimum).',
  email_taken: 'Un compte existe déjà pour cette adresse. Connectez-vous ou renvoyez le lien de confirmation.',
  rate_limited: 'Trop de créations depuis cette connexion. Patientez avant de réessayer.',
  email_delivery_not_configured:
    'Les inscriptions sont fermées : l’envoi d’e-mails de confirmation n’est pas encore configuré sur ce serveur.',
  origin_refused: 'Requête refusée : origine non reconnue.',
  unavailable: 'Service momentanément indisponible. Réessayez plus tard.',
};

type Result = { mode: 'sent' } | { mode: 'dev'; url: string };

export function SignupForm() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, email, password }),
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
      setBusy(false);
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
        <p className="small mt16" style={{textAlign:'center'}}>
          <Link href="/connexion">Aller à la connexion</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error && <div className="banner err" role="alert"><span>{error}</span></div>}
      <label htmlFor="signup-name">Nom complet</label>
      <input
        id="signup-name"
        className="inp"
        type="text"
        autoComplete="name"
        required
        minLength={2}
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="Ex. : Awa Koné"
      />
      <label htmlFor="signup-email">Adresse e-mail</label>
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
      <label htmlFor="signup-password">Mot de passe</label>
      <input
        id="signup-password"
        className="inp"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="10 caractères minimum"
      />
      <label htmlFor="signup-confirm">Confirmation</label>
      <input
        id="signup-confirm"
        className="inp"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      <button type="submit" disabled={busy}>
        {busy ? 'Création…' : 'Créer mon compte'}
      </button>
      <p className="small" style={{textAlign:'center',marginTop:14}}>
        Déjà inscrit ? <Link href="/connexion">Se connecter</Link>
      </p>
    </form>
  );
}
