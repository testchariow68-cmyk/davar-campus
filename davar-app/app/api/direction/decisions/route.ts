import { verrouEcriture, verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { deciderDevoir } from '@/lib/server/pedagogie';
import { deciderCertificat } from '@/lib/server/certificats';
import { notifier } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

/**
 * LES DÉCISIONS HUMAINES.
 *   - un devoir : validé, ou refusé AVEC une explication obligatoire — le
 *     correcteur et l'assistant pédagogique décident aussi (règle du prototype) ;
 *   - un certificat : validé (il reçoit alors son code), ou refusé AVEC un motif —
 *     geste de direction, réservé au propriétaire.
 * Toute décision notifie l'étudiant : personne n'attend dans le vide.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const verrou =
    action === 'devoir' ? await verrouEcriture(request, 'decider-devoir') : await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const id = typeof body?.id === 'string' ? body.id : '';
  const motif = typeof body?.motif === 'string' ? body.motif.trim().slice(0, 800) : '';
  if (!id) return jsonNoStore({ error: 'invalid_input' }, 400);
  const maintenant = Date.now();

  try {
    if (action === 'devoir') {
      const decision = body?.decision === 'approved' ? 'approved' : 'refused';
      const resultat = await deciderDevoir(db, { submissionId: id, decision, feedback: motif, decideur: reel.id }, maintenant);
      if (!resultat.ok) {
        return jsonNoStore(
          { error: resultat.erreur, message: resultat.erreur === 'explication_obligatoire' ? 'Un refus sans explication serait un mur : écrivez le motif.' : 'Décision impossible.' },
          400
        );
      }
      const devoir = await db.execute({ sql: 'SELECT user_id FROM submissions WHERE id = ?', args: [id] });
      const etudiant = typeof devoir.rows[0]?.user_id === 'string' ? devoir.rows[0].user_id : '';
      if (etudiant) {
        await notifier(
          db,
          {
            userId: etudiant,
            kind: 'devoir',
            titre: decision === 'approved' ? 'Votre devoir est validé' : 'Votre devoir demande une reprise',
            corps: motif || null,
            route: '/campus',
          },
          maintenant
        );
      }
      return jsonNoStore({ ok: true, message: decision === 'approved' ? 'Devoir validé : l’étudiant est prévenu.' : 'Devoir refusé, avec votre explication.' });
    }

    if (action === 'certificat') {
      const decision = body?.decision === 'approved' ? 'approved' : 'refused';
      const resultat = await deciderCertificat(db, { requestId: id, decision, motif, decideur: reel.id }, maintenant);
      if (!resultat.ok) {
        return jsonNoStore(
          { error: resultat.erreur, message: resultat.erreur === 'motif_obligatoire' ? 'Un refus doit porter un motif écrit.' : 'Décision impossible.' },
          400
        );
      }
      const demande = await db.execute({ sql: 'SELECT user_id FROM certificate_requests WHERE id = ?', args: [id] });
      const etudiant = typeof demande.rows[0]?.user_id === 'string' ? demande.rows[0].user_id : '';
      if (etudiant) {
        await notifier(
          db,
          {
            userId: etudiant,
            kind: 'certificat',
            titre: decision === 'approved' ? 'Votre certificat est délivré' : 'Votre demande de certificat',
            corps: decision === 'approved' ? `Code de vérification : ${resultat.code}` : motif || null,
            route: '/campus/certificats',
          },
          maintenant
        );
      }
      return jsonNoStore({
        ok: true,
        code: resultat.code,
        message: decision === 'approved' ? `Certificat délivré — code ${resultat.code}.` : 'Demande refusée, avec votre motif.',
      });
    }

    return jsonNoStore({ error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
