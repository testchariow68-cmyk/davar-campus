import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { enregistrerEvenement } from '@/lib/server/journal';
import { modeleParId } from '@/lib/server/modeles-courriel';
import { ecrireReglages, lireReglages, lienSocialValide } from '@/lib/server/settings';
import { creerCle, listerCles, revoquerCle } from '@/lib/server/cles-api';
import { emailBudget, mailerConfigured, sendEmail } from '@/lib/server/mailer';
import {
  compteGmail,
  echangerCodeGmail,
  gmailAutorise,
  gmailConfigue,
  revoquerGmail,
  urlAutorisationGmail,
} from '@/lib/server/gmail';
import { CLE_URL_SHEETS, envoyerVersSheets, urlSheetsValide } from '@/lib/server/sheets';
import { CLE_COULEURS, CLE_PALETTE } from '@/lib/server/apparence';
import { paletteValide } from '@/lib/palette';
import { TYPES_EXPORT, type TypeExport } from '@/lib/server/exports';

export const dynamic = 'force-dynamic';

const CLES_REGLAGES = new Set([
  'support.whatsapp',
  'support.phone',
  'support.email',
  'emails.support',
  'emails.direction',
  'social.instagram',
  'social.tiktok',
  'social.facebook',
  'announce.text',
  'announce.active',
  'announce.audience',
  CLE_PALETTE,
  CLE_COULEURS,
  'paiement.flutterwave.actif',
  'paiement.flutterwave.cle',
  'paiement.flutterwave.webhook',
]);

/** L'origine publique déclarée, ou celle de la requête : l'adresse de retour Google. */
function nouvelleURL(request: Request, chemin: string): string {
  const declaree = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (declaree) {
    try {
      return new URL(chemin, declaree).toString();
    } catch {
      /* on retombe sur l'origine de la requête */
    }
  }
  return new URL(chemin, request.url).toString();
}

/**
 * RÉGLAGES, CLÉS, E-MAILS, SHEETS — tout ce qui se règle depuis l'espace du
 * propriétaire. Chaque action est vérifiée : réservé au propriétaire, et rien
 * d'autre n'entre en base que ce qui est attendu.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const maintenant = Date.now();

  try {
    if (action === 'reglages') {
      const entrees: Record<string, string> = {};
      const recues = (body?.reglages ?? {}) as Record<string, unknown>;
      for (const [cle, valeur] of Object.entries(recues)) {
        if (!CLES_REGLAGES.has(cle)) continue;
        if (typeof valeur !== 'string') continue;
        const propre = valeur.trim().slice(0, 600);
        if (cle.startsWith('social.') && propre.length > 0 && !lienSocialValide(propre)) {
          return jsonNoStore({ error: 'lien_social_invalide', message: `Le lien ${cle.replace('social.', '')} doit être une adresse https:// valide.` }, 400);
        }
        if (cle === CLE_PALETTE && !paletteValide(propre)) {
          return jsonNoStore({ error: 'palette_inconnue', message: 'Cette palette n’existe pas.' }, 400);
        }
        entrees[cle] = propre;
      }
      const ecrites = await ecrireReglages(db, entrees, maintenant);
      if (ecrites > 0)
        await enregistrerEvenement(db, {
          actorId: reel.id,
          action: 'reglages-campus',
          detail: Object.keys(entrees).join(', ').slice(0, 200),
        });
      return jsonNoStore({ ok: true, message: `${ecrites} réglage(s) enregistré(s).`, reglages: await lireReglages(db) });
    }

    if (action === 'cle_creer') {
      const resultat = await creerCle(db, { label: String(body?.label ?? ''), createur: reel.id }, maintenant);
      if (!resultat.ok) return jsonNoStore({ error: resultat.erreur }, 400);
      return jsonNoStore({
        ok: true,
        // Montrée une seule fois : elle n'est plus jamais relisible ensuite.
        cle: resultat.cle,
        message: 'Clé créée. Copiez-la maintenant : elle ne sera plus jamais affichée.',
        cles: await listerCles(db),
      });
    }

    if (action === 'cle_revoquer') {
      const id = String(body?.id ?? '');
      const reussie = await revoquerCle(db, id, maintenant);
      return jsonNoStore({ ok: reussie, message: reussie ? 'Clé révoquée.' : 'Cette clé était déjà révoquée.', cles: await listerCles(db) });
    }

    // Essayer un modèle un par un : le propriétaire voit exactement ce que
    // reçoit un étudiant, avant la mise en production.
    if (action === 'courriel_modele') {
      const modele = modeleParId(String(body?.modele ?? ''));
      const destinataire = String(body?.email ?? reel.email ?? '').trim().toLowerCase();
      if (!modele) return jsonNoStore({ error: 'modele_inconnu' }, 400);
      if (!destinataire.includes('@')) return jsonNoStore({ error: 'adresse_invalide' }, 400);
      if (!mailerConfigured())
        return jsonNoStore(
          {
            error: 'envoi_non_configure',
            message:
              "Aucun service d'envoi n'est configuré. Posez l'adresse du relais Apps Script côté serveur, puis réessayez.",
          },
          503
        );
      try {
        await sendEmail(
          { to: destinataire, subject: `[ESSAI] ${modele.objet}`, text: modele.corps(reel.displayName) },
          db
        );
        await enregistrerEvenement(db, { actorId: reel.id, action: 'courriel-modele', detail: modele.id }, maintenant);
        return jsonNoStore({ ok: true, message: `« ${modele.objet} » envoyé à ${destinataire}.` });
      } catch {
        return jsonNoStore({ error: 'envoi_refuse', message: "L'envoi a été refusé (budget quotidien atteint, ou service indisponible)." }, 503);
      }
    }

    // Écrire à quelqu'un, librement : aucun modèle, aucun destinataire imposé.
    if (action === 'courriel_libre') {
      const destinataire = String(body?.email ?? '').trim().toLowerCase();
      const objet = String(body?.objet ?? '').trim().slice(0, 200);
      const texte = String(body?.texte ?? '').trim().slice(0, 5000);
      if (!destinataire.includes('@')) return jsonNoStore({ error: 'adresse_invalide' }, 400);
      if (!objet) return jsonNoStore({ error: 'objet_manquant', message: 'L’objet de l’e-mail est requis.' }, 400);
      if (!texte) return jsonNoStore({ error: 'message_vide', message: 'Écrivez d’abord le message de l’e-mail.' }, 400);
      if (!mailerConfigured())
        return jsonNoStore(
          {
            error: 'envoi_non_configure',
            message:
              "Aucun service d'envoi n'est configuré. Posez l'adresse du relais Apps Script côté serveur, puis réessayez.",
          },
          503
        );
      try {
        await sendEmail({ to: destinataire, subject: objet, text: texte }, db);
        await enregistrerEvenement(db, { actorId: reel.id, action: 'courriel-libre' }, maintenant);
        return jsonNoStore({ ok: true, message: `E-mail envoyé à ${destinataire}.` });
      } catch {
        return jsonNoStore({ error: 'envoi_refuse', message: "L'envoi a été refusé (budget quotidien atteint, ou service indisponible)." }, 503);
      }
    }

    if (action === 'sheets_url') {
      const url = String(body?.url ?? '').trim();
      if (url.length > 0 && !urlSheetsValide(url))
        return jsonNoStore({ error: 'url_invalide', message: 'L’adresse doit être un script Google (https://script.google.com/…).' }, 400);
      await ecrireReglages(db, { [CLE_URL_SHEETS]: url }, maintenant);
      return jsonNoStore({ ok: true, message: url.length > 0 ? 'Adresse du script enregistrée.' : 'Adresse effacée.' });
    }

    if (action === 'sheets_envoyer') {
      const kind = String(body?.kind ?? 'etudiants') as TypeExport;
      if (!TYPES_EXPORT.includes(kind)) return jsonNoStore({ error: 'type_inconnu' }, 400);
      const url = String(body?.url ?? '').trim() || (await lireReglages(db))[CLE_URL_SHEETS] || '';
      const resultat = await envoyerVersSheets(db, { url, kind });
      return jsonNoStore({ ok: resultat.ok, message: resultat.message, lignes: resultat.lignes });
    }

    if (action === 'gmail_lien') {
      // L'adresse de retour doit être, au caractère près, celle déclarée dans
      // la console Google : on la montre pour qu'elle soit recopiée telle quelle.
      const retour = nouvelleURL(request, '/direction/emails');
      const url = urlAutorisationGmail(retour);
      if (!url) return jsonNoStore({ error: 'gmail_non_configure', message: 'Les identifiants Google ne sont pas enregistrés.' }, 400);
      return jsonNoStore({ ok: true, url, retour });
    }

    if (action === 'gmail_autoriser') {
      const code = String(body?.code ?? '').trim();
      if (code.length < 10) return jsonNoStore({ error: 'code_invalide', message: 'Collez le code fourni par Google.' }, 400);
      const retour = String(body?.retour ?? '').trim() || nouvelleURL(request, '/direction/emails');
      const echange = await echangerCodeGmail(db, code, retour);
      await enregistrerEvenement(db, { actorId: reel.id, action: 'reglages-campus', detail: 'gmail autorisé' }, maintenant);
      return jsonNoStore({
        ok: true,
        compte: echange.compte,
        message: echange.compte ? `Autorisation enregistrée pour ${echange.compte}.` : 'Autorisation enregistrée.',
      });
    }

    if (action === 'gmail_revoquer') {
      await revoquerGmail(db);
      await enregistrerEvenement(db, { actorId: reel.id, action: 'reglages-campus', detail: 'gmail révoqué' }, maintenant);
      return jsonNoStore({ ok: true, message: 'Autorisation retirée.' });
    }

    if (action === 'etat') {
      return jsonNoStore({
        ok: true,
        email: emailBudget(),
        gmail: { configure: gmailConfigue(), autorise: await gmailAutorise(db), compte: await compteGmail(db) },
        cles: await listerCles(db),
        reglages: await lireReglages(db),
      });
    }

    return jsonNoStore({ error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
