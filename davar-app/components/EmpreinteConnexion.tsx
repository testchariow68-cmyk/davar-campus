'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './campus/Icon';
import {
  base64urlVersOctets,
  capacite,
  comptesDeCetAppareil,
  octetsVersBase64url,
} from '@/lib/client/empreinte';

/**
 * L'EMPREINTE SUR L'ÉCRAN DE CONNEXION — le bouton `gl-fp` du prototype.
 *
 * Il n'apparaît QUE si cet appareil garde déjà une empreinte pour un compte du
 * campus : sinon, rien ne s'affiche, plutôt qu'un bouton qui échouerait. Et
 * comme le prototype, il se propose de lui-même au premier affichage — un seul
 * geste suffit alors pour entrer.
 */
export function EmpreinteConnexion() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let vivant = true;
    capacite().then((cap) => {
      if (!vivant) return;
      setVisible(cap.api && comptesDeCetAppareil().length > 0);
    });
    return () => {
      vivant = false;
    };
  }, []);

  async function connecter(silencieux = false) {
    if (enCours) return;
    setEnCours(true);
    try {
      const preparation = await fetch('/api/auth/empreinte', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'defi-connexion' }),
      }).then((reponse) => reponse.json().catch(() => ({})));
      const options = preparation.options as { challenge: string; timeout: number; userVerification: string; rpId: string };
      if (!preparation.ok || !options?.challenge) {
        if (!silencieux) setMessage('Empreinte indisponible pour le moment.');
        return;
      }

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: base64urlVersOctets(options.challenge),
          timeout: options.timeout,
          userVerification: 'required',
          rpId: options.rpId,
        },
      })) as PublicKeyCredential | null;
      if (!assertion) return;

      const reponse = assertion.response as AuthenticatorAssertionResponse;
      const envoi = await fetch('/api/auth/empreinte', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'connexion',
          defiId: String(preparation.defiId ?? ''),
          reponse: {
            id: assertion.id,
            type: assertion.type,
            response: {
              clientDataJSON: octetsVersBase64url(reponse.clientDataJSON),
              authenticatorData: octetsVersBase64url(reponse.authenticatorData),
              signature: octetsVersBase64url(reponse.signature),
              userHandle: reponse.userHandle ? octetsVersBase64url(reponse.userHandle) : null,
            },
          },
        }),
      });
      if (!envoi.ok) {
        if (!silencieux) setMessage('Empreinte non reconnue ou lecture annulée.');
        return;
      }
      router.replace('/campus');
      router.refresh();
    } catch {
      if (!silencieux) setMessage('Empreinte non reconnue ou lecture annulée.');
    } finally {
      setEnCours(false);
    }
  }

  if (!visible) return null;

  return (
    <>
      <button type="button" className="gl-fp" onClick={() => connecter()} disabled={enCours}>
        <Icon nom="fingerprint" taille={15} /> Se connecter avec l’empreinte digitale
      </button>
      {message && (
        <div className="xs faint mt8" role="status" style={{ textAlign: 'center' }}>
          {message}
        </div>
      )}
    </>
  );
}
