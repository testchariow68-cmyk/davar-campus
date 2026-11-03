import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import {
  TYPES_EXPORT,
  construireExport,
  derniersExports,
  factureDeVente,
  journaliserExport,
  motDePasseProprietaireValide,
  texteCsv,
  ventesPourFactures,
  type TypeExport,
} from '@/lib/server/exports';

export const dynamic = 'force-dynamic';

/**
 * EXPORTS ET FACTURES — « derrière le mot de passe ».
 *
 * Le propriétaire est déjà connecté ; on lui redemande quand même son mot de passe
 * au moment de sortir des données personnelles. Chaque sortie est journalisée.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const motDePasse = typeof body?.motDePasse === 'string' ? body.motDePasse : '';

  /** Le mot de passe est exigé pour tout ce qui contient des données de personnes. */
  async function passe(): Promise<Response | null> {
    const valide = await motDePasseProprietaireValide(db, reel.id, motDePasse).catch(() => false);
    if (!valide)
      return jsonNoStore(
        { error: 'mot_de_passe_requis', message: 'Mot de passe incorrect. Les exports restent fermés.' },
        403
      );
    return null;
  }

  try {
    if (action === 'journal') {
      return jsonNoStore({ ok: true, journal: await derniersExports(db, 30), types: TYPES_EXPORT });
    }

    if (action === 'csv') {
      const refus = await passe();
      if (refus) return refus;
      const kind = String(body?.kind ?? '') as TypeExport;
      if (!TYPES_EXPORT.includes(kind)) return jsonNoStore({ error: 'type_inconnu' }, 400);
      const table = await construireExport(db, kind);
      const contenu = texteCsv(table.entetes, table.lignes);
      await journaliserExport(db, kind, table.lignes.length, reel.id);
      return jsonNoStore({
        ok: true,
        nom: `davar-${kind}-${new Date().toISOString().slice(0, 10)}.csv`,
        contenu,
        lignes: table.lignes.length,
        message: `${table.lignes.length} ligne(s) exportée(s). Ce fichier reste chez vous : il n’est ni envoyé ni publié.`,
      });
    }

    if (action === 'factures') {
      const refus = await passe();
      if (refus) return refus;
      const factures = await ventesPourFactures(db, 200);
      await journaliserExport(db, 'factures', factures.length, reel.id);
      return jsonNoStore({ ok: true, factures, message: `${factures.length} facture(s).` });
    }

    if (action === 'facture') {
      const refus = await passe();
      if (refus) return refus;
      const facture = await factureDeVente(db, String(body?.saleId ?? ''));
      if (!facture) return jsonNoStore({ error: 'vente_introuvable' }, 404);
      const texte = [
        'DAVAR ACADÉMIE — FACTURE',
        `N° ${facture.numero}`,
        `Date : ${new Date(facture.verifieeLeMs).toLocaleDateString('fr-FR')}`,
        '',
        `Client : ${facture.acheteur}`,
        `Formation : ${facture.formation}`,
        `Montant : ${facture.montant} ${facture.devise}`,
        `Référence de vente : ${facture.reference}`,
        '',
        'Merci de votre confiance. DAVAR ACADÉMIE — direction@davarcampus.co',
      ].join('\n');
      return jsonNoStore({ ok: true, facture, texte });
    }

    return jsonNoStore({ error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
