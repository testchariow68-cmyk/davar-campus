import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, linkOrigin, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import { enregistrerEvenement, type ActionJournal } from '@/lib/server/journal';
import {
  accorderAcces,
  listerEquipe,
  basculerCompteTest,
  definirRole,
  definirRolesEquipe,
  definirStatut,
  purgerContenu,
  retirerAcces,
  type Resultat,
} from '@/lib/server/direction';
import { creerInvitation, listerInvitations, revoquerInvitation } from '@/lib/server/invitations';
import { annulerTransfert, initierTransfert, transfertEnAttente } from '@/lib/server/transfert';

export const dynamic = 'force-dynamic';

/** Équipe, invitations, transfert de propriété, et purge du contenu d'essai. */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db, reel } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const email = typeof body?.email === 'string' ? body.email : '';
  const formation = typeof body?.formation === 'string' ? body.formation : '';

  try {
    let resultat: Resultat;
    switch (action) {
      case 'set-role':
        resultat = await definirRole(db, email, String(body?.role ?? ''));
        break;
      case 'grant-access':
        resultat = await accorderAcces(db, email, formation);
        break;
      case 'revoke-access':
        resultat = await retirerAcces(db, email, formation);
        break;
      case 'roles-equipe': {
        const attribution = await definirRolesEquipe(db, email, String(body?.roles ?? ''));
        if (!attribution.ok) {
          const messages: Record<string, string> = {
            adresse_invalide: 'Cette adresse e-mail n’est pas valable.',
            role_inconnu: 'Rôle inconnu.',
            compte_introuvable: 'Aucun compte ne correspond à cette adresse.',
            role_inchange: 'Cette personne n’est pas membre du staff : attribuez-lui d’abord ce rôle.',
          };
          return jsonNoStore(
            { ok: false, erreur: attribution.erreur, message: messages[attribution.erreur] ?? 'Attribution impossible.' },
            400
          );
        }
        const libelles = (attribution.roles ?? []).map((role) => role);
        await enregistrerEvenement(db, {
          actorId: reel.id,
          action: 'roles-equipe',
          detail: `${email} · ${libelles.join(', ') || 'aucun rôle'}`,
        });
        return jsonNoStore({
          ok: true,
          message: libelles.length
            ? `Rôles enregistrés : ${libelles.join(', ')}.`
            : 'Aucun rôle : cette personne ne verra que sa vue d’ensemble.',
          equipe: await listerEquipe(db),
        });
      }

      case 'set-status':
        resultat = await definirStatut(db, email, String(body?.statut ?? ''));
        break;
      case 'toggle-test':
        resultat = await basculerCompteTest(db, email, body?.estTest === true);
        break;
      case 'purge-content':
        resultat = await purgerContenu(db, String(body?.confirmation ?? ''));
        break;

      case 'inviter': {
        const kind = body?.kind === 'student_grace' ? 'student_grace' : 'staff';
        const invitation = await creerInvitation(
          db,
          {
            email,
            kind,
            roles: String(body?.roles ?? ''),
            trainingId: typeof body?.formation === 'string' && body.formation ? body.formation : null,
            message: String(body?.message ?? ''),
            createur: reel.id,
            baseUrl: linkOrigin(request),
          }
        );
        if (!invitation.ok) {
          const messages: Record<string, string> = {
            adresse_invalide: 'Cette adresse e-mail n’est pas valable.',
            type_inconnu: 'Type d’invitation inconnu.',
            compte_existant: 'Un compte existe déjà avec cet e-mail : attribuez-lui un rôle plutôt que de l’inviter.',
            formation_inconnue: 'Cette formation n’existe pas.',
            unavailable: 'Invitation impossible pour le moment.',
          };
          return jsonNoStore({ ok: false, erreur: invitation.erreur, message: messages[invitation.erreur] }, 400);
        }
        await enregistrerEvenement(db, {
          actorId: reel.id,
          action: 'invitation-creee',
          detail: `${invitation.invitation.email} · ${kind === 'staff' ? 'équipe' : 'étudiant'}`,
        });
        return jsonNoStore({
          ok: true,
          message: `Invitation créée pour ${invitation.invitation.email} — valable ${kind === 'staff' ? 7 : 3} jours.`,
          invitation: invitation.invitation,
          // Le lien est montré au propriétaire : il peut le transmettre lui-même
          // si l'envoi d'e-mails n'est pas encore branché.
          lien: linkOrigin(request)
            ? `${linkOrigin(request)!.replace(/\/$/, '')}/invitation?token=${encodeURIComponent(invitation.token)}`
            : null,
          invitations: await listerInvitations(db),
        });
      }

      case 'revoquer-invitation': {
        const reussie = await revoquerInvitation(db, String(body?.id ?? ''));
        if (reussie)
          await enregistrerEvenement(db, {
            actorId: reel.id,
            action: 'invitation-revoquee',
            detail: String(body?.id ?? ''),
          });
        return jsonNoStore({
          ok: reussie,
          message: reussie ? 'Invitation révoquée : le lien ne fonctionne plus.' : 'Cette invitation n’existait plus.',
          invitations: await listerInvitations(db),
        });
      }

      case 'transfert-initier': {
        const transfert = await initierTransfert(db, {
          acteurId: reel.id,
          acteurEmail: reel.email,
          emailCible: email,
          motDePasse: String(body?.motDePasse ?? ''),
          baseUrl: linkOrigin(request),
        });
        if (!transfert.ok) {
          const messages: Record<string, string> = {
            adresse_invalide: 'Adresse e-mail invalide.',
            deja_proprietaire: 'Vous êtes déjà propriétaire du campus.',
            compte_inconnu: 'Aucun compte ne correspond à cette adresse sur la plateforme.',
            compte_inactif: 'Ce compte est suspendu : réactivez-le avant un transfert.',
            mot_de_passe_incorrect: 'Mot de passe incorrect : aucun transfert n’a été initié.',
            unavailable: 'Transfert impossible pour le moment.',
          };
          return jsonNoStore({ ok: false, erreur: transfert.erreur, message: messages[transfert.erreur] }, 400);
        }
        await enregistrerEvenement(db, {
          actorId: reel.id,
          action: 'transfert-initie',
          detail: email,
        });
        return jsonNoStore({
          ok: true,
          message: 'Un e-mail de confirmation a été envoyé au nouveau propriétaire. Le transfert n’est effectif qu’après sa confirmation.',
          transfert: transfert.transfert,
          lien: linkOrigin(request)
            ? `${linkOrigin(request)!.replace(/\/$/, '')}/transfert?token=${encodeURIComponent(transfert.token)}`
            : null,
        });
      }

      case 'transfert-annuler': {
        const enAttente = await transfertEnAttente(db);
        const reussie = enAttente ? await annulerTransfert(db, enAttente.id) : false;
        if (reussie) await enregistrerEvenement(db, { actorId: reel.id, action: 'transfert-annule', detail: reel.email });
        return jsonNoStore({
          ok: reussie,
          message: reussie ? 'Transfert annulé : vous restez propriétaire.' : 'Aucun transfert en attente.',
        });
      }

      default:
        return jsonNoStore({ ok: false, erreur: 'action_inconnue' }, 400);
    }
    // Le journal garde la trace humaine de ce que la base vient d'accepter.
    // Une action refusée ne s'écrit PAS : le journal raconte des faits.
    const ACTIONS_JOURNALISEES: Record<string, ActionJournal> = {
      'set-role': 'role-change',
      'grant-access': 'acces-accorde',
      'revoke-access': 'acces-retire',
      'set-status': 'statut-compte',
      'toggle-test': 'compte-test',
      'purge-content': 'purge-contenu',
    };
    const actionJournal = ACTIONS_JOURNALISEES[action];
    if (resultat.ok && actionJournal)
      await enregistrerEvenement(db, { actorId: reel.id, action: actionJournal, detail: email || formation || action });
    return jsonNoStore(resultat, resultat.ok ? 200 : 400);
  } catch {
    return jsonNoStore({ ok: false, erreur: 'unavailable' }, 503);
  }
}
