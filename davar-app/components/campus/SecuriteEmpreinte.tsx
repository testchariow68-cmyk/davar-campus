'use client';

import { useEffect, useState } from 'react';
import {
  base64urlVersOctets,
  capacite,
  nomAppareil,
  octetsVersBase64url,
  retenirCompte,
} from '@/lib/client/empreinte';

/**
 * SÉCURITÉ — le bloc « Sécurité » de `vSettings()` du prototype : un
 * interrupteur « Connexion par empreinte digitale » et une phrase qui dit où
 * en est l'appareil.
 *
 * Le geste est celui du prototype : on active, l'appareil demande l'empreinte
 * (ou le visage), et la connexion suivante se fait d'un geste depuis l'écran de
 * connexion. La différence est invisible mais elle compte : ici l'appareil
 * SIGNE un défi tiré par le serveur, et c'est cette signature — pas une
 * case cochée — qui ouvre la session.
 */
export function SecuriteEmpreinte({
  activeInitiale,
  utilisateurId,
}: {
  activeInitiale: boolean;
  utilisateurId: string;
}) {
  const [active, setActive] = useState(activeInitiale);
  const [indice, setIndice] = useState('Vérification de votre appareil…');
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    let vivant = true;
    capacite().then((cap) => {
      if (!vivant) return;
      const appareil = nomAppareil();
      setIndice(
        cap.api
          ? cap.authentifie
            ? `Votre empreinte ne quitte jamais votre appareil (${appareil}) : la plateforme ne garde qu’une clé publique.`
            : `Enregistrez votre empreinte (ou visage) dans les réglages de cet appareil (${appareil}), puis activez-la ici.`
          : `Appareil détecté (${appareil}), mais ce navigateur n’expose pas la biométrie. Rouvrez la plateforme dans Chrome ou Safari pour l’activer.`
      );
    });
    return () => {
      vivant = false;
    };
  }, []);

  async function poster(corps: Record<string, unknown>) {
    const reponse = await fetch('/api/auth/empreinte', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: reponse.ok, donnees };
  }

  async function basculer() {
    if (occupe) return;
    setOccupe(true);
    try {
      if (active) {
        await poster({ action: 'desactiver' });
        retenirCompte(octetsVersBase64url(new TextEncoder().encode(utilisateurId)), false);
        setActive(false);
        return;
      }

      const cap = await capacite();
      if (!cap.api || !cap.authentifie) {
        setIndice(
          cap.api
            ? `Votre appareil (${nomAppareil()}) est compatible : enregistrez d’abord votre empreinte (ou visage) dans les réglages de l’appareil, puis revenez ici.`
            : `Votre appareil (${nomAppareil()}) est compatible, mais le navigateur utilisé n’expose pas la vérification biométrique. Rouvrez cette adresse dans Chrome ou Safari, puis activez-la.`
        );
        return;
      }

      const preparation = await poster({ action: 'defi-enregistrement' });
      if (!preparation.ok) return;
      const options = preparation.donnees.options as {
        challenge: string;
        rp: { id: string; name: string };
        user: { id: string; name: string; displayName: string };
        pubKeyCredParams: Array<{ type: PublicKeyCredentialType; alg: number }>;
        authenticatorSelection: AuthenticatorSelectionCriteria;
        timeout: number;
        excludeCredentials: Array<{ type: PublicKeyCredentialType; id: string }>;
      };
      const defiId = String(preparation.donnees.defiId ?? '');

      const cree = (await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: base64urlVersOctets(options.challenge),
          user: { ...options.user, id: base64urlVersOctets(options.user.id) },
          excludeCredentials: (options.excludeCredentials ?? []).map((credential) => ({
            ...credential,
            id: base64urlVersOctets(credential.id),
          })),
        },
      })) as PublicKeyCredential | null;
      if (!cree) return;

      const attestation = cree.response as AuthenticatorAttestationResponse;
      const envoi = await poster({
        action: 'enregistrer',
        defiId,
        reponse: {
          id: cree.id,
          type: cree.type,
          response: {
            clientDataJSON: octetsVersBase64url(attestation.clientDataJSON),
            attestationObject: octetsVersBase64url(attestation.attestationObject),
          },
        },
      });
      if (!envoi.ok) {
        setIndice('Lecture de l’empreinte annulée. Réessayez quand vous voulez.');
        return;
      }
      // L'empreinte est retenue sur CET appareil : l'écran de connexion la
      // proposera d'elle-même au prochain passage.
      retenirCompte(options.user.id, true);
      setActive(true);
      setIndice(
        `Empreinte enregistrée ✓ Sur cet appareil (${nomAppareil()}), vous pourrez vous connecter d’un geste depuis l’écran de connexion.`
      );
    } catch {
      setIndice('Lecture de l’empreinte annulée. Réessayez quand vous voulez.');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      <div className="divider" />

      <div className="eyebrow mb8">Sécurité</div>
      <div className="row between">
        <span className="small">Connexion par empreinte digitale</span>
        <label className="switch">
          <input type="checkbox" checked={active} disabled={occupe} onChange={basculer} />
          <i />
        </label>
      </div>
      <div className="xs faint mt8">{indice}</div>
    </>
  );
}
