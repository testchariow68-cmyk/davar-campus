'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { deriveClientKey, fetchDerivationParameters } from '@/lib/client/derive';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  invalid_input: 'Vérifiez l’adresse e-mail et le mot de passe saisis.',
  email_not_verified: 'Adresse e-mail non confirmée : ouvrez le lien de confirmation reçu.',
  account_suspended: 'Ce compte est suspendu. Contactez l’administration.',
  rate_limited: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
  origin_refused: 'Requête refusée : origine non reconnue.',
  kdf_scheme_mismatch: 'Ce compte utilise un autre mode de protection. Rechargez la page et réessayez.',
  unavailable: 'Service momentanément indisponible. Réessayez plus tard.',
  not_configured: 'La connexion n’est pas encore configurée sur ce serveur.',
};

type Step = 'idle' | 'deriving' | 'verifying';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [oubliOuvert, setOubliOuvert] = useState(false);
  const [oubliEnvoi, setOubliEnvoi] = useState(false);
  const [oubliErreur, setOubliErreur] = useState<string | null>(null);
  const [oubliFait, setOubliFait] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const busy = step !== 'idle';

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setUnverified(false);
    try {
      // 1. Paramètres publics du compte : le serveur indique le schéma de protection.
      const parameters = await fetchDerivationParameters(email);
      if (!parameters.ok) {
        setError(MESSAGES[parameters.error] ?? MESSAGES.unavailable);
        return;
      }

      // 2. Compte moderne : la dérivation coûteuse se fait ICI, dans le navigateur.
      let payload: Record<string, unknown> = { email };
      if (parameters.parameters.scheme === 'client-v1') {
        setStep('deriving');
        const verifier = await deriveClientKey(password, parameters.parameters);
        payload = { email, verifier };
      } else {
        // Compte hérité : le serveur procède au hachage (hôte à budget CPU suffisant).
        payload = { email, password };
      }

      setStep('verifying');
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(MESSAGES[result.error ?? 'unavailable'] ?? 'Connexion refusée.');
        setUnverified(result.error === 'email_not_verified');
        return;
      }
      router.replace('/campus');
      router.refresh();
    } catch {
      setError(MESSAGES.unavailable);
    } finally {
      setStep('idle');
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

  /** « Mot de passe oublié ? » — la fenêtre du prototype, avec un vrai envoi. */
  async function envoyerLien() {
    if (!email.trim()) {
      setOubliErreur('Indiquez votre e-mail.');
      return;
    }
    setOubliEnvoi(true);
    setOubliErreur(null);
    try {
      await fetch('/api/auth/mot-de-passe-oublie', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // La réponse est la même, que l'adresse existe ou non : jamais on ne le dit.
      setOubliOuvert(false);
      setOubliFait(true);
    } finally {
      setOubliEnvoi(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {oubliFait && (
        <div className="banner ok" role="status">
          {/* eslint-disable-next-line react/no-unescaped-entities */}
          <span>Lien de réinitialisation envoyé 📮</span>
        </div>
      )}
      {error && <div className="banner err" role="alert"><span>{error}</span></div>}
      {notice && <div className="banner info"><span style={{wordBreak: 'break-all'}}>{notice}</span></div>}
      <label htmlFor="login-email">E-mail</label>
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
        placeholder="••••••••"
      />
      <button type="submit" disabled={busy}>
        {step === 'deriving' ? 'Protection de votre mot de passe…' : step === 'verifying' ? 'Connexion…' : 'Se connecter'}
      </button>
      <div className="gl-links">
        <button type="button" className="gl-lien" onClick={() => { setOubliFait(false); setOubliOuvert(true); }}>
          Mot de passe oublié ?
        </button>
      </div>
      {unverified && (
        <button type="button" className="btn btn-ghost" onClick={resend} disabled={busy}>
          Renvoyer le lien de confirmation
        </button>
      )}
      <p className="small" style={{textAlign:'center',marginTop:14}}>
        Pas de compte ? <Link href="/inscription">S’inscrire</Link>
      </p>

      {oubliOuvert && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-label="Mot de passe oublié">
            <div className="modal-head">
              <h3>Mot de passe oublié</h3>
              <button type="button" className="icon-btn" onClick={() => setOubliOuvert(false)} aria-label="Fermer">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label htmlFor="fgEmail">Votre adresse e-mail</label>
                <input
                  id="fgEmail"
                  className="inp"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="vous@exemple.com"
                />
              </div>
              <div className="hint">Un lien de réinitialisation vous sera envoyé par e-mail.</div>
              {oubliErreur && (
                <div className="banner err" role="alert" style={{ marginTop: 10 }}>
                  <span>{oubliErreur}</span>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setOubliOuvert(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={envoyerLien} disabled={oubliEnvoi}>
                {oubliEnvoi ? 'Envoi…' : 'Envoyer le lien'}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
