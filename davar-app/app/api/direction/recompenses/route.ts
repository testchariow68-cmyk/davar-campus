import { verrouEcriture, verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { enregistrerEvenement } from '@/lib/server/journal';
import {
  enregistrerReglagesAssiduite,
  lireReglagesAssiduite,
  verifierAssiduite,
} from '@/lib/server/assiduite';
import { attribuerBadge, catalogueBadges } from '@/lib/server/recompenses';

export const dynamic = 'force-dynamic';

/**
 * RÉCOMPENSES — le catalogue, l'attribution à la main et le moteur d'assiduité.
 *
 * Deux niveaux de droit, comme le prototype :
 *   - les RÉGLAGES du moteur sont au propriétaire seul ;
 *   - l'ATTRIBUTION à la main et la vérification du cycle sont des gestes de
 *     supervision — propriétaire ou manager.
 *
 * Une distinction manuelle exige toujours son mot : le prototype l'écrit
 * (« Motif (consigné dans l'historique) »), et un badge sans raison écrit serait
 * une décision qu'on ne pourrait plus expliquer.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  // Le périmètre de lecture est celui de la section : propriétaire ou manager.
  const verrouLecture = await verrouEcriture(request, 'attribuer-distinction');
  if (!verrouLecture.ok) return verrouLecture.reponse;
  const { db, reel } = verrouLecture.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';

  try {
    if (action === 'etat') {
      const [reglages, catalogue] = await Promise.all([lireReglagesAssiduite(db), catalogueBadges(db)]);
      return jsonNoStore({ ok: true, reglages, catalogue: catalogue.length });
    }

    if (action === 'reglages') {
      const verrou = await verrouProprietaire(request);
      if (!verrou.ok) return verrou.reponse;
      const reglages = await enregistrerReglagesAssiduite(db, {
        absenceDays: Number(body?.absenceDays),
        periodDays: Number(body?.periodDays),
        minActiveDays: Number(body?.minActiveDays),
      });
      await enregistrerEvenement(db, {
        actorId: reel.id,
        action: 'recompenses-reglages',
        detail: `absence ${reglages.absenceDays} j · régularité ${reglages.minActiveDays}/${reglages.periodDays} j`,
      });
      return jsonNoStore({
        ok: true,
        message: `Réglages enregistrés — rappel après ${reglages.absenceDays} jours, régularité : ${reglages.minActiveDays} jours travaillés sur ${reglages.periodDays}.`,
        reglages,
      });
    }

    if (action === 'attribuer') {
      const userId = typeof body?.userId === 'string' ? body.userId : '';
      const badgeId = typeof body?.badgeId === 'string' ? body.badgeId : '';
      const motif = typeof body?.motif === 'string' ? body.motif.trim() : '';
      if (!userId || !badgeId) return jsonNoStore({ ok: false, message: 'Choisissez un étudiant et une distinction.' }, 400);
      if (motif.length < 3)
        return jsonNoStore({ ok: false, message: 'Écrivez le motif : il restera dans l’historique.' }, 400);

      const etudiant = await db.execute({
        sql: "SELECT display_name FROM users WHERE id = ? AND role = 'student' AND is_test = 0",
        args: [userId],
      });
      if (!etudiant.rows.length) return jsonNoStore({ ok: false, message: 'Cet étudiant est introuvable.' }, 404);

      const pose = await attribuerBadge(
        db,
        {
          userId,
          badgeId,
          source: 'manuel',
          awardedBy: verrouLecture.session.user.id,
          note: motif,
        },
      );
      if (pose)
        await enregistrerEvenement(db, {
          actorId: reel.id,
          action: 'distinction-manuelle',
          detail: `${badgeId} à ${String(etudiant.rows[0].display_name)} · ${motif.slice(0, 120)}`,
        });
      return jsonNoStore({
        ok: pose,
        message: pose
          ? `Distinction attribuée à ${String(etudiant.rows[0].display_name)} — motif consigné.`
          : 'Cette distinction est déjà portée par cet étudiant : rien n’a été ajouté.',
      });
    }

    if (action === 'verifier') {
      const resultat = await verifierAssiduite(db);
      const parties: string[] = [];
      if (resultat.distinctions.length) parties.push(`${resultat.distinctions.length} distinction(s) attribuée(s)`);
      if (resultat.rappels.length) parties.push(`${resultat.rappels.length} rappel(s) déposé(s)`);
      if (resultat.rappelRefuses) parties.push(`${resultat.rappelRefuses} étudiant(s) ont coupé les notifications`);
      await enregistrerEvenement(db, {
        actorId: reel.id,
        action: 'rappel-cycle',
        detail: `${resultat.distinctions.length} distinction(s), ${resultat.rappels.length} rappel(s)`,
      });
      return jsonNoStore({
        ok: true,
        message: parties.length
          ? `Cycle vérifié — ${parties.join(', ')}.`
          : `Cycle vérifié — rien à faire pour l’instant sur ${resultat.examines} étudiant(s).`,
        resultat,
      });
    }

    return jsonNoStore({ ok: false, message: 'Action inconnue.' }, 400);
  } catch (erreur) {
    console.error('[direction/recompenses]', erreur);
    return jsonNoStore({ ok: false, message: 'L’opération a échoué.' }, 500);
  }
}
