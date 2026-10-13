import { currentSession } from '@/lib/server/auth';
import { jsonNoStore, readJsonBody, isSameOrigin } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import {
  chaineActive,
  compterAppelFournisseur,
  compterQuestionEtudiant,
  contexteAutorise,
  etatsFournisseurs,
  jointureFournisseur,
  jourDe,
  lireConfig,
  marquerQuotaAtteint,
  nomAssistant,
  promptSysteme,
  questionsRestantes,
  type Mode,
} from '@/lib/server/assistant';
import { poserQuestionAuxFournisseurs } from '@/lib/server/ai-providers';
import { ajouterMessage, ouvrirConversation } from '@/lib/server/echanges';
import { notifier, notifierEquipe } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

const LONGUEUR_MIN = 3;
const LONGUEUR_MAX = 1200;

/**
 * POSER UNE QUESTION — assistant immédiat ou coach humain.
 *
 * Garde-fous, dans cet ordre :
 *   1. même origine, session valide ;
 *   2. l'étudiant doit être RÉELLEMENT inscrit à la formation visée ;
 *   3. l'assistant ne parle que des formations ASSOCIÉES à lui (base de connaissances) ;
 *   4. plafond de questions par étudiant et par jour : la protection des quotas gratuits ;
 *   5. vue test = lecture seule : elle n'écrit rien et ne consomme aucun quota d'étudiant.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  const session = await currentSession();
  if (!session) return jsonNoStore({ error: 'unauthenticated' }, 401);

  const body = await readJsonBody(request);
  const formationId = typeof body?.formationId === 'string' ? body.formationId.trim() : '';
  const moduleId = typeof body?.moduleId === 'string' && body.moduleId.trim() !== '' ? body.moduleId.trim() : null;
  const mode: Mode = body?.mode === 'coach' ? 'coach' : 'ai';
  const question = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!formationId || question.length < LONGUEUR_MIN || question.length > LONGUEUR_MAX)
    return jsonNoStore({ error: 'invalid_input' }, 400);

  const { db, user } = session;
  const maintenant = Date.now();

  try {
    const inscription = await db.execute({
      sql: 'SELECT 1 AS ok FROM enrollments WHERE user_id = ? AND training_id = ?',
      args: [user.id, formationId],
    });
    if (inscription.rows.length === 0) return jsonNoStore({ error: 'not_enrolled' }, 403);

    /* --- coach humain : la question est transmise, personne n'est jamais bloqué --- */
    if (mode === 'coach') {
      const conversationId = await ouvrirConversation(db, { userId: user.id, formationId, moduleId, mode: 'coach' }, maintenant);
      await ajouterMessage(db, { conversationId, auteur: 'student', texte: question }, maintenant);
      await notifierEquipe(
        db,
        {
          titre: 'Question en attente de votre coach',
          corps: `${user.displayName} — ${question.slice(0, 120)}`,
          route: '/direction/conversations',
          kind: 'coach',
        },
        maintenant
      );
      await notifier(
        db,
        {
          userId: user.id,
          kind: 'coach',
          titre: 'Question transmise à votre coach',
          corps: 'Votre Coach répond généralement sous 48 heures.',
          route: '/campus/questions',
        },
        maintenant
      );
      return jsonNoStore({ ok: true, mode: 'coach', reponse: 'Question transmise à votre coach. Réponse sous 48 heures maximum.' });
    }

    /* --- assistant virtuel --- */
    const config = await lireConfig(db);
    const nom = nomAssistant(config);
    const contexte = await contexteAutorise(db, user.id, formationId, moduleId);
    if (!contexte) {
      return jsonNoStore(
        {
          error: 'assistant_indisponible_pour_cette_formation',
          message: "L'assistant n'est pas encore relié à cette formation. Votre coach peut répondre : transmettez-lui votre question.",
        },
        200
      );
    }

    const lectureSeule = session.vueTest !== null;
    const jour = jourDe(maintenant);

    if (!lectureSeule) {
      const reste = await questionsRestantes(db, user.id, jour, config.studentDailyCap);
      if (reste <= 0) {
        return jsonNoStore(
          {
            error: 'plafond_jour',
            message: `Vous avez posé vos ${config.studentDailyCap} questions du jour. Votre coach reste disponible, et l'assistant vous réécoute demain.`,
          },
          200
        );
      }
    }

    const systeme = promptSysteme({
      nomAssistant: nom,
      nomEtudiant: user.displayName,
      langue: config.lang,
      formation: contexte.formation,
      module: moduleId ? (contexte.lignes.find((l) => l.includes('Module :'))?.replace('— Module :', '').trim() ?? null) : null,
      contexte: contexte.lignes.join('\n'),
    });

    const etats = await etatsFournisseurs(db, jour);
    const disponibles = chaineActive(config, etats);
    const joints = disponibles
      .map((fournisseur) => jointureFournisseur(fournisseur, config.modeles))
      .filter((joint): joint is NonNullable<typeof joint> => joint !== null);

    if (joints.length === 0) {
      await notifierEquipe(
        db,
        { titre: 'Assistant indisponible : aucun moteur disponible', corps: `${user.displayName} attend une réponse.`, route: '/direction/conversations', kind: 'assistant' },
        maintenant
      );
      return jsonNoStore(
        {
          error: 'assistant_indisponible',
          message: "L'assistant est momentanément indisponible. Votre question peut être transmise à votre coach.",
        },
        200
      );
    }

    const { resultat, epuises } = await poserQuestionAuxFournisseurs({
      chaine: joints,
      question,
      systeme,
      temperature: config.temperature,
    });

    for (const fournisseur of epuises) await marquerQuotaAtteint(db, fournisseur, jour);
    if (resultat.ok) await compterAppelFournisseur(db, resultat.provider, jour, false);

    if (!resultat.ok) {
      await notifierEquipe(
        db,
        {
          titre: "L'assistant n'a pas pu répondre",
          corps: `${user.displayName} · ${resultat.raison}${resultat.detail ? ` (${resultat.detail})` : ''} — question : ${question.slice(0, 120)}`,
          route: '/direction/conversations',
          kind: 'assistant',
        },
        maintenant
      );
      return jsonNoStore(
        {
          error: 'assistant_indisponible',
          message: "L'assistant n'a pas pu répondre à l'instant. Votre coach est prévenu — transmettez-lui la question pour une réponse sous 48 h.",
        },
        200
      );
    }

    if (lectureSeule) {
      // Aperçu du propriétaire : la réponse est montrée, rien n'est écrit nulle part.
      return jsonNoStore({ ok: true, mode: 'ai', apercu: true, nom, reponse: resultat.texte });
    }

    const conversationId = await ouvrirConversation(db, { userId: user.id, formationId, moduleId, mode: 'ai' }, maintenant);
    await ajouterMessage(db, { conversationId, auteur: 'student', texte: question }, maintenant);
    await ajouterMessage(
      db,
      { conversationId, auteur: 'ai', texte: resultat.texte, provider: resultat.provider, modele: resultat.modele },
      maintenant + 1
    );
    await compterQuestionEtudiant(db, user.id, jour);
    await notifier(
      db,
      { userId: user.id, kind: 'ai', titre: `${nom} a répondu`, corps: 'Consultez la réponse dans votre conversation.', route: '/campus/questions' },
      maintenant
    );

    const reste = await questionsRestantes(db, user.id, jour, config.studentDailyCap);
    return jsonNoStore({ ok: true, mode: 'ai', nom, reponse: resultat.texte, reste });
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
