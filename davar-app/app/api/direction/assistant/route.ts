import { verrouProprietaire } from '@/lib/server/direction-access';
import { jsonNoStore, readJsonBody } from '@/lib/server/http';
import { trackApiRequest } from '@/lib/server/quota';
import {
  FOURNISSEURS,
  definirAssociation,
  ecrireConfig,
  lireConfig,
  marquerQuotaAtteint,
  jourDe,
  type Fournisseur,
} from '@/lib/server/assistant';
import { cleDisponible } from '@/lib/server/ai-providers';

export const dynamic = 'force-dynamic';

const FOURNISSEURS_VALIDES = Object.keys(FOURNISSEURS) as Fournisseur[];

function estFournisseur(valeur: unknown): valeur is Fournisseur {
  return typeof valeur === 'string' && (FOURNISSEURS_VALIDES as string[]).includes(valeur);
}

/**
 * Configuration de l'assistant virtuel — propriétaire uniquement.
 *
 * La clé d'API, elle, ne passe JAMAIS par ici : elle vit dans l'environnement du
 * serveur. Cet écran montre quels moteurs ont une clé, lesquels sont en secours,
 * et lequel a soif aujourd'hui.
 */
export async function POST(request: Request) {
  await trackApiRequest();
  const verrou = await verrouProprietaire(request);
  if (!verrou.ok) return verrou.reponse;
  const { db } = verrou.session;

  const body = await readJsonBody(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const maintenant = Date.now();

  try {
    const actuelle = await lireConfig(db);

    if (action === 'config') {
      const patch: Record<string, unknown> = {};
      if (typeof body?.displayName === 'string') patch.displayName = body.displayName.trim().slice(0, 60);
      if (typeof body?.lang === 'string' && ['fr', 'en', 'es', 'pt'].includes(body.lang)) patch.lang = body.lang;
      if (typeof body?.temperature === 'number' && body.temperature >= 0 && body.temperature <= 1)
        patch.temperature = Math.round(body.temperature * 10) / 10;
      if (typeof body?.hue === 'number' && body.hue >= 0 && body.hue <= 360) patch.hue = Math.trunc(body.hue);
      if (typeof body?.studentDailyCap === 'number' && body.studentDailyCap >= 1 && body.studentDailyCap <= 500)
        patch.studentDailyCap = Math.trunc(body.studentDailyCap);
      if (typeof body?.transcription === 'string' && ['browser-whisper', 'groq-whisper'].includes(body.transcription))
        patch.transcription = body.transcription;
      if (estFournisseur(body?.primaryProvider)) patch.primaryProvider = body.primaryProvider;
      if (Array.isArray(body?.chaine)) {
        const chaine = (body.chaine as unknown[]).filter(estFournisseur);
        if (chaine.length > 0) patch.chaine = chaine;
      }
      const enregistree = await ecrireConfig(db, actuelle, patch, maintenant);
      return jsonNoStore({ ok: true, config: { ...enregistree, modeles: enregistree.modeles, limites: enregistree.limites } });
    }

    if (action === 'kb') {
      const formationId = typeof body?.formationId === 'string' ? body.formationId : '';
      if (!formationId) return jsonNoStore({ error: 'invalid_input' }, 400);
      await definirAssociation(db, formationId, body?.associee === true, maintenant);
      return jsonNoStore({ ok: true });
    }

    if (action === 'quota_simuler') {
      const fournisseur = body?.provider;
      if (!estFournisseur(fournisseur)) return jsonNoStore({ error: 'invalid_input' }, 400);
      await marquerQuotaAtteint(db, fournisseur, jourDe(maintenant));
      return jsonNoStore({ ok: true, message: `Quota de ${FOURNISSEURS[fournisseur].nom} marqué atteint : le suivant prend le relais.` });
    }

    if (action === 'etat') {
      const moteurs = FOURNISSEURS_VALIDES.map((fournisseur) => ({
        provider: fournisseur,
        nom: FOURNISSEURS[fournisseur].nom,
        note: FOURNISSEURS[fournisseur].note,
        modele: actuelle.modeles[fournisseur] ?? FOURNISSEURS[fournisseur].modele,
        cle: cleDisponible(fournisseur),
        principal: actuelle.primaryProvider === fournisseur,
        dansChaine: actuelle.chaine.includes(fournisseur),
      }));
      return jsonNoStore({ ok: true, moteurs, config: actuelle });
    }

    return jsonNoStore({ error: 'action_inconnue' }, 400);
  } catch {
    return jsonNoStore({ error: 'unavailable' }, 503);
  }
}
