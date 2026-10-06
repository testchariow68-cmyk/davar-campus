'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  invalid_input: 'Vérifiez l’adresse e-mail et le mot de passe saisis.',
  email_not_verified: 'Adresse e-mail non confirmée : ouvrez le lien de confirmation reçu.',
  account_suspended: 'Ce compte est suspendu. Contactez l’administration.',
  rate_limited: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
  origin_refused: 'Requête refusée : origine non reconnue.',
  unavailable: 'Service momentanément indisponible. Réessayez plus tard.',
};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setUnverified(false);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(MESSAGES[payload.error ?? 'unavailable'] ?? 'Connexion refusée.');
        setUnverified(payload.error === 'email_not_verified');
        return;
      }
      router.replace('/campus');
      router.refresh();
    } catch {
      setError(MESSAGES.unavailable);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setNotice(null);
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => ({}))) as { devVerificationUrl?: string; emailSent?: boolean };
      if (!response.ok) {
        setNotice('Renvoi impossible pour le moment.');
        return;
      }
      if (payload.devVerificationUrl) setNotice(`Lien de développement : ${payload.devVerificationUrl}`);
      else if (payload.emailSent) setNotice('Un nouveau lien vient d’être envoyé.');
      else setNotice('Si un compte non confirmé existe pour cette adresse, un lien vient d’être envoyé.');
    } catch {
      setNotice('Renvoi impossible pour le moment.');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error && <div className="banner err" role="alert"><span>{error}</span></div>}
      {notice && <div className="banner info"><span style={{wordBreak: 'break-all'}}>{notice}</span></div>}
      <label htmlFor="login-email">Adresse e-mail</label>
      <input
        id="login-email"
        className="inp"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="vous@exemple.com"
      />
      <label htmlFor="login-password">Mot de passe</label>
      <input
        id="login-password"
        className="inp"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Votre mot de passe"
      />
      <button type="submit" disabled={busy}>
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>
      {unverified && (
        <button type="button" className="btn btn-ghost" onClick={resend} disabled={busy}>
          Renvoyer le lien de confirmation
        </button>
      )}
      <p className="small" style={{textAlign:'center',marginTop:14}}>
        Pas encore de compte ? <Link href="/inscription">Créer mon accès</Link>
      </p>
    </form>
  );
}
