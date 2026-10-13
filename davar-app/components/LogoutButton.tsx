'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/connexion');
      router.refresh();
    }
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={onClick} disabled={busy}>
      {busy ? 'Déconnexion…' : 'Déconnexion'}
    </button>
  );
}
