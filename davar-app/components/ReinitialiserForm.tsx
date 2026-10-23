'use client';

import { useState } from 'react';
import Link from 'next/link';
import { deriveClientKey } from '@/lib/client/derive';

const MESSAGES: Record<string, string> = {
  invalid_input: 'Vérifiez votre nouveau mot de passe (8 caractères minimum).',
  invalid_token: 'Ce lien n’est plus valable. Demandez-en un nouveau depuis la connexion.',
  rate_limited: 'Trop de demandes depuis cette connexion. Patientez avant de réessayer.',
  origin_refused: 'Requête refusée : origine non reconnue.',
  unavailable: 'Service momentanément indisponible. Réessayez plus tard.',
};

export function ReinitialiserForm({
  token,
  email,
  sel,
  iterations,
}: {
  token: string;
  email: string;
  sel: string;
  iterations: number;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fait, setFait] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Mots de passe invalides ou différents.');
      return;
    }
    if (password.length < 8) {
      setError(MESSAGES.invalid_input);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Le mot de passe est transformé ici, dans le navigateur : il n'est jamais
      // transmis tel quel, et le serveur ne reçoit que la clé dérivée.
      const verifier = await deriveClientKey(password, { salt: sel, iterations });
      const response = await fetch('/api/auth/reinitialiser', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, verifier, salt: sel, iterations }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(MESSAGES[payload.error ?? 'unavailable'] ?? MESSAGES.unavailable);
        return;
      }
      setFait(true);
    } catch {
      setError(MESSAGES.unavailable);
    } finally {
      setBusy(false);
    }
  }

  if (fait) {
    return (
      <>
        <div className="banner ok" role="status">
          <span>Votre mot de passe est enregistré. Connectez-vous avec.</span>
        </div>
        <p className="small mt16" style={{ textAlign: 'center' }}>
          <Link href="/connexion">Aller à la connexion</Link>
        </p>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p>Choisissez votre nouveau mot de passe pour {email}.</p>
      {error && (
        <div className="banner err" role="alert">
          <span>{error}</span>
        </div>
      )}
      <label htmlFor="reset-password">Nouveau mot de passe</label>
      <input
        id="reset-password"
        className="inp"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="8 caractères minimum"
      />
      <label htmlFor="reset-confirm">Confirmer le mot de passe</label>
      <input
        id="reset-confirm"
        className="inp"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      <button type="submit" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}
