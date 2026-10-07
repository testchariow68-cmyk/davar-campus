/**
 * APPELS AUX MOTEURS D'IA — côté SERVEUR uniquement.
 *
 * Règle ferme : la clé ne doit jamais se trouver dans le navigateur de l'étudiant,
 * sinon n'importe qui peut la copier et dépenser l'argent du propriétaire. Elle est
 * donc lue ici, depuis l'environnement du serveur, et n'en sort pas.
 *
 * Les quatre moteurs gratuits forment la chaîne décrite par le prototype : quand
 * l'un atteint son quota, le suivant prend le relais sans que l'étudiant s'en
 * aperçoive. Aucun frais tant que la chaîne tient.
 */
import type { Fournisseur, FournisseurJoint } from './assistant.ts';
import { FOURNISSEURS } from './assistant.ts';

export type ResultatAppel =
  | { ok: true; texte: string; provider: Fournisseur; modele: string }
  | { ok: false; provider: Fournisseur; raison: 'quota' | 'sans_cle' | 'erreur' | 'vide'; detail?: string };

const DELAI_MS = 20_000;

function cle(fournisseur: FournisseurJoint): string {
  return (process.env[fournisseur.cleEnvironnement] ?? '').trim();
}

/** Une clé est-elle disponible pour ce moteur ? Sert à l'écran de configuration. */
export function cleDisponible(fournisseur: Fournisseur): boolean {
  switch (fournisseur) {
    case 'groq':
      return (process.env.GROQ_API_KEY ?? '').trim().length > 0;
    case 'gemini':
      return (process.env.GEMINI_API_KEY ?? '').trim().length > 0;
    case 'openrouter':
      return (process.env.OPENROUTER_API_KEY ?? '').trim().length > 0;
    case 'hf':
      return (process.env.HUGGINGFACE_API_KEY ?? '').trim().length > 0;
    case 'custom':
      return (process.env.ASSISTANT_CUSTOM_KEY ?? '').trim().length > 0 && (process.env.ASSISTANT_CUSTOM_URL ?? '').trim().length > 0;
    default:
      return false;
  }
}

function texteReponse(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/** Extrait le texte quelle que soit la forme JSON du moteur. */
function extraireTexte(fournisseur: Fournisseur, corps: unknown): string {
  const donnees = corps as Record<string, unknown>;
  if (fournisseur === 'gemini') {
    const candidats = donnees?.candidates as Array<Record<string, unknown>> | undefined;
    const parties = (candidats?.[0]?.content as Record<string, unknown> | undefined)?.parts as
      | Array<Record<string, unknown>>
      | undefined;
    return texteReponse(parties?.[0]?.text);
  }
  if (fournisseur === 'hf') {
    if (Array.isArray(donnees)) {
      const premier = donnees[0] as Record<string, unknown> | undefined;
      return texteReponse(premier?.generated_text);
    }
    return texteReponse((donnees as Record<string, unknown>)?.generated_text);
  }
  const choix = donnees?.choices as Array<Record<string, unknown>> | undefined;
  const message = choix?.[0]?.message as Record<string, unknown> | undefined;
  return texteReponse(message?.content) || texteReponse(choix?.[0]?.text);
}

async function lireCorps(reponse: Response): Promise<{ json: unknown; brut: string }> {
  const brut = await reponse.text().catch(() => '');
  try {
    return { json: brut ? JSON.parse(brut) : null, brut };
  } catch {
    return { json: null, brut };
  }
}

function ressembleAQuota(statut: number, brut: string): boolean {
  if (statut === 429) return true;
  const minuscule = brut.toLowerCase();
  return (
    minuscule.includes('quota') ||
    minuscule.includes('rate limit') ||
    minuscule.includes('rate_limit') ||
    minuscule.includes('too many requests') ||
    minuscule.includes('insufficient')
  );
}

/** Un appel, sur un moteur précis. Aucune exception ne remonte : tout est un résultat. */
export async function appelerFournisseur(
  joint: FournisseurJoint,
  question: string,
  systeme: string,
  temperature: number,
  fetchImpl: typeof fetch = fetch
): Promise<ResultatAppel> {
  const cleApi = cle(joint);
  if (!cleApi || (joint.provider === 'custom' && !joint.url)) {
    return { ok: false, provider: joint.provider, raison: 'sans_cle' };
  }

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    let reponse: Response;
    if (joint.provider === 'gemini') {
      reponse = await fetchImpl(`${joint.url}/models/${encodeURIComponent(joint.modele)}:generateContent?key=${encodeURIComponent(cleApi)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controleur.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systeme }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { temperature },
        }),
      });
    } else if (joint.provider === 'hf') {
      reponse = await fetchImpl(`${joint.url}/${joint.modele}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cleApi}` },
        signal: controleur.signal,
        body: JSON.stringify({
          inputs: `${systeme}\n\nQuestion de l'étudiant : ${question}\n\nRéponse :`,
          parameters: { temperature, max_new_tokens: 700, return_full_text: false },
        }),
      });
    } else {
      reponse = await fetchImpl(joint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleApi}`,
          ...(joint.provider === 'openrouter' ? { 'HTTP-Referer': 'https://davarcampus.co', 'X-Title': 'DAVAR Academie' } : {}),
        },
        signal: controleur.signal,
        body: JSON.stringify({
          model: joint.modele,
          temperature,
          max_tokens: 700,
          messages: [
            { role: 'system', content: systeme },
            { role: 'user', content: question },
          ],
        }),
      });
    }

    const { json, brut } = await lireCorps(reponse);
    if (!reponse.ok || ressembleAQuota(reponse.status, brut)) {
      return {
        ok: false,
        provider: joint.provider,
        raison: ressembleAQuota(reponse.status, brut) ? 'quota' : 'erreur',
        detail: `HTTP ${reponse.status}`,
      };
    }
    const texte = extraireTexte(joint.provider, json);
    if (!texte) return { ok: false, provider: joint.provider, raison: 'vide' };
    return { ok: true, texte, provider: joint.provider, modele: joint.modele };
  } catch (erreur) {
    return {
      ok: false,
      provider: joint.provider,
      raison: 'erreur',
      detail: erreur instanceof Error ? erreur.message : 'inconnue',
    };
  } finally {
    clearTimeout(minuteur);
  }
}

export type ResultatChaine = {
  resultat: ResultatAppel;
  /** Moteurs dont le quota du jour est atteint : à marquer en base pour la bascule. */
  epuises: Fournisseur[];
};

/**
 * Pose la question au premier moteur disponible, puis au suivant en cas de quota.
 * C'est la promesse du prototype : « quota journalier atteint → le suivant prend le
 * relais ; le lendemain, le 1er revient ».
 */
export async function poserQuestionAuxFournisseurs(options: {
  chaine: FournisseurJoint[];
  question: string;
  systeme: string;
  temperature: number;
  fetchImpl?: typeof fetch;
}): Promise<ResultatChaine> {
  const epuises: Fournisseur[] = [];
  let dernier: ResultatAppel = { ok: false, provider: 'groq', raison: 'erreur', detail: 'aucun moteur' };

  for (const joint of options.chaine) {
    const resultat = await appelerFournisseur(joint, options.question, options.systeme, options.temperature, options.fetchImpl);
    if (resultat.ok) return { resultat, epuises };
    dernier = resultat;
    if (resultat.raison === 'quota') {
      epuises.push(joint.provider);
      continue;
    }
    if (resultat.raison === 'sans_cle') continue;
    // Erreur passagère du moteur : on tente le suivant, sans le marquer épuisé.
  }
  return { resultat: dernier, epuises };
}

/** État de la chaîne, pour l'écran de configuration : qui répond, qui est en secours, qui a soif. */
export function resumeChaine(chaine: Fournisseur[]): Array<{ provider: Fournisseur; nom: string; note: string; cle: boolean }> {
  return chaine.map((fournisseur) => ({
    provider: fournisseur,
    nom: FOURNISSEURS[fournisseur].nom,
    note: FOURNISSEURS[fournisseur].note,
    cle: cleDisponible(fournisseur),
  }));
}
