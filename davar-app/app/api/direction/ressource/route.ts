import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { enregistrerEvenement } from '@/lib/server/journal';
import { attribuerRessource, creerRessource, retirerAttribution } from '@/lib/server/ressources';
import { ajouterPage, ajouterPiste, definirPiste, supprimerPage } from '@/lib/server/medias';
import { clePropre, libellePlafond, stockagePret, tailleAcceptable } from '@/lib/server/stockage';
import { urlDepot } from '@/lib/server/stockage';
import { notifier } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

/**
 * DÉPÔT D'UN FICHIER — en trois temps, et sans que le fichier traverse l'application :
 *   1. `depot`   : le serveur renvoie une adresse signée (15 min) ;
 *   2. le navigateur du propriétaire envoie le fichier DIRECTEMENT au stockage ;
 *   3. `confirmer` : la référence est enregistrée en base.
 * Le plafond de taille est vérifié ici, AVANT toute signature.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const maintenant = Date.now();
  const texteDe = (valeur: unknown, max = 200): string => (typeof valeur === 'string' ? valeur.trim().slice(0, max) : '');

  try {
    if (action === 'creer') {
      const kind = body?.kind === 'audio' ? 'audio' : body?.kind === 'book' ? 'book' : 'file';
      const resultat = await creerRessource(
        db,
        {
          kind,
          title: texteDe(body?.title, 160),
          description: texteDe(body?.description, 800),
          formationId: texteDe(body?.formationId, 120) || null,
        },
        maintenant
      );
      if (!resultat.ok) return jsonNoStore({ error: resultat.erreur }, 400);
      await enregistrerEvenement(db, {
        actorId: reel.id,
        action: 'ressource-depot',
        detail: `${kind} · ${texteDe(body?.title, 160)}`,
      });
      return jsonNoStore({ ok: true, id: resultat.id, message: 'Ressource créée.' });
    }

    if (action === 'page') {
      const resourceId = texteDe(body?.resourceId, 120);
      if (!resourceId) return jsonNoStore({ error: 'invalid_input' }, 400);
      const resultat = await ajouterPage(
        db,
        { resourceId, title: texteDe(body?.title, 160) || null, body: typeof body?.body === 'string' ? body.body : '' },
        maintenant
      );
      if (!resultat.ok) return jsonNoStore({ error: resultat.erreur }, 400);
      return jsonNoStore({ ok: true, position: resultat.position, message: `Page ${resultat.position} ajoutée.` });
    }

    if (action === 'supprimer_page') {
      const pageId = texteDe(body?.pageId, 120);
      if (!pageId) return jsonNoStore({ error: 'invalid_input' }, 400);
      await supprimerPage(db, pageId);
      return jsonNoStore({ ok: true, message: 'Page supprimée.' });
    }

    if (action === 'piste') {
      const resourceId = texteDe(body?.resourceId, 120);
      if (!resourceId) return jsonNoStore({ error: 'invalid_input' }, 400);
      const resultat = await ajouterPiste(
        db,
        {
          resourceId,
          title: texteDe(body?.title, 160),
          durationSec: Number.isFinite(Number(body?.durationSec)) ? Number(body?.durationSec) : null,
        },
        maintenant
      );
      if (!resultat.ok) return jsonNoStore({ error: resultat.erreur }, 400);
      return jsonNoStore({ ok: true, id: resultat.id, position: resultat.position, message: `Piste ${resultat.position} ajoutée.` });
    }

    if (action === 'depot') {
      const kind = body?.kind === 'audio' ? 'audio' : body?.kind === 'video' ? 'video' : 'document';
      const octets = Number(body?.octets);
      if (!tailleAcceptable(kind, octets)) {
        return jsonNoStore(
          {
            error: 'fichier_trop_lourd',
            message: `Ce fichier dépasse la limite (${libellePlafond(kind)}). Les plafonds du propriétaire ne changent que sur sa validation.`,
          },
          400
        );
      }
      if (!stockagePret()) {
        return jsonNoStore(
          {
            error: 'stockage_non_relie',
            message:
              "Le stockage des fichiers n’est pas encore relié. Les clés R2 (compte, clé d’accès, secret, seau) doivent être posées côté serveur avant tout dépôt.",
          },
          503
        );
      }
      const cle = clePropre(texteDe(body?.cle, 400));
      if (!cle) return jsonNoStore({ error: 'cle_invalide' }, 400);
      const adresse = await urlDepot(cle, 900, maintenant);
      return jsonNoStore({ ok: true, url: adresse, cle, message: 'Adresse de dépôt prête (15 minutes).' });
    }

    if (action === 'confirmer') {
      const cle = clePropre(texteDe(body?.cle, 400));
      const resourceId = texteDe(body?.resourceId, 120);
      if (!cle) return jsonNoStore({ error: 'cle_invalide' }, 400);
      if (body?.pisteId) {
        await definirPiste(db, {
          pisteId: texteDe(body.pisteId, 120),
          fileKey: cle,
          durationSec: Number.isFinite(Number(body?.durationSec)) ? Number(body.durationSec) : undefined,
        });
        return jsonNoStore({ ok: true, message: 'Piste déposée.' });
      }
      if (!resourceId) return jsonNoStore({ error: 'invalid_input' }, 400);
      await db.execute({ sql: 'UPDATE resources SET file_key = ? WHERE id = ?', args: [cle, resourceId] });
      return jsonNoStore({ ok: true, message: 'Fichier déposé et rattaché.' });
    }

    if (action === 'attribuer') {
      const resourceId = texteDe(body?.resourceId, 120);
      const courriel = texteDe(body?.email, 200).toLowerCase();
      const utilisateur = await db.execute({ sql: 'SELECT id FROM users WHERE email_normalized = ?', args: [courriel] });
      const userId = typeof utilisateur.rows[0]?.id === 'string' ? utilisateur.rows[0].id : '';
      if (!resourceId || !userId) return jsonNoStore({ error: 'etudiant_introuvable' }, 400);
      await attribuerRessource(db, { resourceId, userId, par: reel.id }, maintenant);
      await notifier(
        db,
        { userId, kind: 'ressource', titre: 'Une nouvelle ressource vous est attribuée', corps: 'Retrouvez-la dans « Mes ressources ».', route: '/campus/ressources' },
        maintenant
      );
      await enregistrerEvenement(db, {
        actorId: reel.id,
        action: 'ressource-attribution',
        detail: `${resourceId} → ${courriel}`,
      });
      return jsonNoStore({ ok: true, message: `Ressource attribuée à ${courriel}.` });
    }

    if (action === 'retirer') {
      const resourceId = texteDe(body?.resourceId, 120);
      const courriel = texteDe(body?.email, 200).toLowerCase();
      const utilisateur = await db.execute({ sql: 'SELECT id FROM users WHERE email_normalized = ?', args: [courriel] });
      const userId = typeof utilisateur.rows[0]?.id === 'string' ? utilisateur.rows[0].id : '';
      if (!resourceId || !userId) return jsonNoStore({ error: 'etudiant_introuvable' }, 400);
      await retirerAttribution(db, resourceId, userId);
      return jsonNoStore({ ok: true, message: 'Attribution retirée.' });
    }

    if (action === 'publier') {
      const resourceId = texteDe(body?.resourceId, 120);
      if (!resourceId) return jsonNoStore({ error: 'invalid_input' }, 400);
      const publiee = body?.publiee === true ? 1 : 0;
      await db.execute({ sql: 'UPDATE resources SET published = ? WHERE id = ?', args: [publiee, resourceId] });
      return jsonNoStore({ ok: true, message: publiee ? 'Ressource publiée.' : 'Ressource retirée de la vue des étudiants.' });
    }

    return jsonNoStore({ error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
