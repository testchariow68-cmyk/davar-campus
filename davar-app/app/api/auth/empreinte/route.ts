/**
 * EMPREINTE DIGITALE — les quatre portes de la connexion sans mot de passe.
 *
 *   etat                 → l'interrupteur est-il activé, et sur combien d'appareils
 *   defi-enregistrement  → tire un défi et dit à l'appareil quoi enregistrer
 *   enregistrer          → vérifie la réponse et garde la clé publique
 *   defi-connexion       → tire un défi, sans dire qui l'on est
 *   connexion            → vérifie la signature et ouvre la session
 *   desactiver           → retire les clés : l'empreinte ne reconnecte plus
 *
 * Aucune de ces portes ne reçoit une donnée biométrique : elles ne voient
 * jamais qu'une signature et une clé publique.
 */
import { createSession, type Db } from '@/lib/server/auth-core';
import { currentSession, setSessionCookie } from '@/lib/server/auth';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import { openDb } from '@/lib/server/turso';
import { trackApiRequest } from '@/lib/server/quota';
import {
  desactiver,
  enregistrer,
  etatEmpreinte,
  preparerConnexion,
  preparerEnregistrement,
  verifierConnexion,
} from '@/lib/server/passkeys';

export const dynamic = 'force-dynamic';

/** L'adresse du site, telle que le navigateur la voit : c'est l'identité du site pour l'appareil. */
function rpId(request: Request): string {
  return new URL(request.url).hostname;
}

function origine(request: Request): string {
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const body = await readJsonBody(request);
  if (!body) return jsonNoStore({ error: 'invalid_input' }, 400);
  const action = String(body.action ?? '');
  const db: Db = await openDb();

  // Se connecter, c'est justement ne PAS avoir de session : cette action est
  // la seule qui s'ouvre sans être déjà entré.
  if (action === 'defi-connexion') {
    const { defiId, options } = await preparerConnexion(db, rpId(request));
    return jsonNoStore({ ok: true, defiId, options });
  }

  if (action === 'connexion') {
    const defiId = String(body.defiId ?? '');
    const reponse = (body.reponse ?? {}) as Parameters<typeof verifierConnexion>[2];
    const userId = await verifierConnexion(db, defiId, reponse, rpId(request), origine(request));
    if (!userId) return jsonNoStore({ error: 'empreinte_refusee' }, 401);
    const session = await createSession(db, userId);
    await setSessionCookie(session.token, session.expiresAtMs);
    return jsonNoStore({ ok: true });
  }

  // Tout le reste demande une session : on ne touche qu'à SA propre empreinte.
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthorized' }, 401);
  const utilisateur = { id: session.reel.id, email: session.reel.email, displayName: session.reel.displayName };

  if (action === 'etat') {
    return jsonNoStore({ ok: true, ...(await etatEmpreinte(db, utilisateur.id)) });
  }

  if (action === 'defi-enregistrement') {
    const { defiId, options } = await preparerEnregistrement(db, utilisateur, rpId(request));
    return jsonNoStore({ ok: true, defiId, options });
  }

  if (action === 'enregistrer') {
    const defiId = String(body.defiId ?? '');
    const reponse = (body.reponse ?? {}) as Parameters<typeof enregistrer>[3];
    const resultat = await enregistrer(db, utilisateur, defiId, reponse, rpId(request), origine(request));
    if (!resultat.ok) return jsonNoStore({ error: resultat.erreur }, 400);
    return jsonNoStore({ ok: true, appareils: resultat.appareils });
  }

  if (action === 'desactiver') {
    await desactiver(db, utilisateur.id);
    return jsonNoStore({ ok: true, active: false, appareils: 0 });
  }

  return jsonNoStore({ error: 'action_inconnue' }, 400);
}
