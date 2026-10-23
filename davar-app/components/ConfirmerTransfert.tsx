'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * CONFIRMER — ou « CE N'ÉTAIT PAS MOI ».
 *
 * Les deux boutons sont au même niveau : refuser doit être aussi simple que
 * confirmer, sinon la sortie de secours n'existe pas vraiment.
 */
export function ConfirmerTransfert({ token }: { token: string }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ ok: boolean; message: string; confirme?: boolean } | null>(null);

  async function agir(action: 'confirmer' | 'refuser') {
    setEnCours(action);
    try {
      const reponse = await fetch('/api/transfert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      setResultat({ ok: Boolean(donnees.ok), message: donnees.message ?? (donnees.ok ? 'C’est fait.' : 'Action refusée.'), confirme: action === 'confirmer' });
    } catch {
      setResultat({ ok: false, message: 'La plateforme n’a pas répondu. Réessayez dans un instant.' });
    } finally {
      setEnCours(null);
    }
  }

  if (resultat) {
    return (
      <>
        <div className={resultat.ok ? 'banner ok' : 'banner err'} role="status">
          <span>{resultat.message}</span>
        </div>
        <Link href={resultat.ok && resultat.confirme ? '/direction' : '/'} className="btn mt16">
          {resultat.ok && resultat.confirme ? 'Ouvrir l’espace Direction' : 'Revenir à l’accueil'}
        </Link>
      </>
    );
  }

  return (
    <div className="col" style={{ gap: 10 }}>
      <button className="btn btn-gold btn-lg" type="button" disabled={enCours !== null} onClick={() => agir('confirmer')}>
        {enCours === 'confirmer' ? 'Confirmation…' : 'Je confirme : je deviens propriétaire'}
      </button>
      <button className="btn btn-ghost" type="button" disabled={enCours !== null} onClick={() => agir('refuser')}>
        {enCours === 'refuser' ? 'Annulation…' : 'Ce n’était pas moi'}
      </button>
    </div>
  );
}
