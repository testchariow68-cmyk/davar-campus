import { currentSession } from '@/lib/server/auth';
import { isClientVerifier } from '@/lib/server/auth-core';
import { isSameOrigin, jsonNoStore, readJsonBody } from '@/lib/server/http';
import {
  analyserPreference,
  changerCodeSecret,
  definirPhoto,
  ecrirePreference,
  enregistrerNom,
  lireProfil,
} from '@/lib/server/profil';
import { trackApiRequest } from '@/lib/server/quota';
import { clePropre, stockagePret, tailleAcceptable } from '@/lib/server/stockage';
import { urlDepot } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';

/** PROFIL — le nom, les préférences, la photo et le code secret, pour soi-même. */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const maintenant = Date.now();

  try {
    if (action === 'nom') {
      const resultat = await enregistrerNom(session.db, session.user.id, typeof body?.nom === 'string' ? body.nom : '');
      if (!resultat.ok) {
        return jsonNoStore(
          {
            ok: false,
            erreur: resultat.erreur,
            message: 'Le nom doit faire entre 2 et 21 caractères — c’est celui qui apparaîtra sur vos certificats.',
          },
          400
        );
      }
      return jsonNoStore({ ok: true, message: 'Nom enregistré.', nom: resultat.nom });
    }

    if (action === 'preference') {
      const cle = typeof body?.cle === 'string' ? body.cle : '';
      const valeur = typeof body?.valeur === 'string' ? body.valeur : String(body?.valeur ?? '');
      const analyse = analyserPreference(cle, valeur);
      if (!analyse.ok) return jsonNoStore({ ok: false, erreur: analyse.erreur }, 400);
      await ecrirePreference(session.db, session.user.id, analyse.cle, analyse.valeur, maintenant);
      const preferences = (await lireProfil(session.db, session.user.id))?.preferences;
      return jsonNoStore({
        ok: true,
        message:
          analyse.cle === 'notifications.actives'
            ? analyse.valeur === '1'
              ? 'Notifications activées.'
              : 'Notifications coupées. Les alertes de sécurité continueront de vous prévenir.'
            : 'Taille d’affichage enregistrée.',
        preferences,
      });
    }

    if (action === 'photo_depot') {
      // Comme pour les ressources : le fichier part directement dans le stockage,
      // le serveur ne fait que signer l'adresse de dépôt (15 minutes).
      if (!stockagePret()) {
        return jsonNoStore(
          {
            ok: false,
            erreur: 'stockage_non_relie',
            message: 'Le stockage des fichiers n’est pas encore relié : la photo de profil arrive avec lui.',
          },
          503
        );
      }
      const extension = typeof body?.extension === 'string' ? body.extension.toLowerCase() : 'jpg';
      const permise = ['jpg', 'jpeg', 'png', 'webp'].includes(extension) ? extension : 'jpg';
      const cle = `photos/${session.user.id}/${maintenant.toString(36)}-${Math.random().toString(36).slice(2, 8)}.${permise}`;
      const octets = Number(body?.octets);
      if (!tailleAcceptable('document', octets)) {
        return jsonNoStore({ ok: false, erreur: 'fichier_trop_lourd', message: 'La photo doit peser moins de 10 Mo.' }, 400);
      }
      const adresse = await urlDepot(cle, 900, maintenant);
      return jsonNoStore({ ok: true, url: adresse, cle, message: 'Adresse de dépôt prête (15 minutes).' });
    }

    if (action === 'photo') {
      // Le fichier est déposé directement dans le stockage ; ici on n'enregistre
      // que sa clé, et seulement si elle appartient bien à ce compte.
      const cle = clePropre(typeof body?.cle === 'string' ? body.cle : '');
      if (!cle || !cle.startsWith(`photos/${session.user.id}/`)) {
        return jsonNoStore({ ok: false, erreur: 'cle_invalide' }, 400);
      }
      await definirPhoto(session.db, session.user.id, cle, maintenant);
      return jsonNoStore({ ok: true, message: 'Photo enregistrée.' });
    }

    if (action === 'photo_retirer') {
      await definirPhoto(session.db, session.user.id, null, maintenant);
      return jsonNoStore({ ok: true, message: 'Photo retirée.' });
    }

    if (action === 'code') {
      const ancien = typeof body?.ancien === 'string' ? body.ancien : '';
      const nouveau = typeof body?.nouveau === 'string' ? body.nouveau : '';
      if (!isClientVerifier(ancien) || !isClientVerifier(nouveau)) {
        return jsonNoStore({ ok: false, erreur: 'code_invalide' }, 400);
      }
      if (ancien === nouveau) {
        return jsonNoStore(
          { ok: false, erreur: 'code_identique', message: 'Le nouveau code est identique à l’ancien.' },
          400
        );
      }
      const resultat = await changerCodeSecret(session.db, {
        userId: session.user.id,
        tokenActuel: session.token,
        ancienVerifier: ancien,
        nouveauVerifier: nouveau,
        maintenant,
      });
      if (!resultat.ok) {
        const message =
          resultat.erreur === 'code_actuel_incorrect'
            ? 'Votre code secret actuel n’est pas correct : rien n’a été changé.'
            : 'Changement impossible pour le moment.';
        return jsonNoStore({ ok: false, erreur: resultat.erreur, message }, 400);
      }
      return jsonNoStore({ ok: true, message: 'Code secret changé. Vos autres appareils devront se reconnecter.' });
    }

    if (action === 'etat') {
      const profil = await lireProfil(session.db, session.user.id);
      return jsonNoStore({ ok: true, profil });
    }

    return jsonNoStore({ ok: false, erreur: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ ok: false, erreur: 'unavailable' }, 503);
  }
}
