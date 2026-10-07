import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { ecrireReglages, lireReglages, lienSocialValide } from '@/lib/server/settings';
import { creerCle, listerCles, revoquerCle } from '@/lib/server/cles-api';
import { emailBudget, mailerConfigured, sendEmail } from '@/lib/server/mailer';
import { CLE_URL_SHEETS, envoyerVersSheets, urlSheetsValide } from '@/lib/server/sheets';
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
]);

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
        entrees[cle] = propre;
      }
      const ecrites = await ecrireReglages(db, entrees, maintenant);
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

    if (action === 'courriel_test') {
      const destinataire = String(body?.email ?? reel.email ?? '').trim().toLowerCase();
      if (!destinataire.includes('@')) return jsonNoStore({ error: 'adresse_invalide' }, 400);
      if (!mailerConfigured())
        return jsonNoStore(
          {
            error: 'envoi_non_configure',
            message:
              "Aucun service d'envoi n'est configuré. Posez l'adresse du relais Apps Script (ou la clé Brevo) côté serveur, puis réessayez.",
          },
          503
        );
      try {
        await sendEmail(
          {
            to: destinataire,
            subject: 'DAVAR ACADÉMIE — essai d’envoi',
            text: `Cet essai confirme que les e-mails de la plateforme partent bien.

Depuis : ${reel.email}
Le ${new Date(maintenant).toLocaleString('fr-FR')}`,
          },
          db
        );
        return jsonNoStore({ ok: true, message: `Essai envoyé à ${destinataire}.` });
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

    if (action === 'etat') {
      return jsonNoStore({
        ok: true,
        email: emailBudget(),
        cles: await listerCles(db),
        reglages: await lireReglages(db),
      });
    }

    return jsonNoStore({ error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
