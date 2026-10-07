/**
 * ASSISTANT VIRTUEL — le cerveau côté serveur.
 *
 * Reprend la configuration écrite dans les documents du propriétaire, sans rien
 * inventer (voir `SPEC-ASSISTANT-IA.md`) :
 *   - une CHAÎNE de fournisseurs gratuits : quota atteint → le suivant prend le
 *     relais, sans que l'étudiant s'en aperçoive et sans dépense ;
 *   - une base de connaissances PAR FORMATION : l'assistant ne parle que des
 *     formations réellement achetées par l'étudiant, jamais d'une autre ;
 *   - un nom, une photo, une langue, une température réglables par lui ;
 *   - un plafond de questions par étudiant et par jour : c'est ce plafond qui
 *     protège les quotas gratuits (« nous protégeons les quotas ») ;
 *   - supervision humaine : le coach valide, corrige ou répond à la place.
 *
 * Ce fichier ne dépend PAS de Next : ses règles sont donc testables en Node.
 */
import type { Db } from './auth-core';

/* ------------------------------------------------------------------ durées */

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Conversation avec l'assistant : 90 jours (statistiques anonymisées conservées). */
export const PURGE_IA_MS = 90 * JOUR_MS;
/** Conversation avec le coach : 12 mois maximum. */
export const PURGE_COACH_MS = 365 * JOUR_MS;

export function purgeApres(mode: Mode, maintenant: number): number {
  return maintenant + (mode === 'ai' ? PURGE_IA_MS : PURGE_COACH_MS);
}

export type Mode = 'ai' | 'coach' | 'support';
export type Fournisseur = 'groq' | 'gemini' | 'openrouter' | 'hf' | 'custom';

export const FOURNISSEURS: Record<Fournisseur, { nom: string; modele: string; limite: number; note: string }> = {
  groq: {
    nom: 'Groq',
    modele: 'openai/gpt-oss-120b',
    limite: 1000,
    note: 'Ultra-rapide · gratuit · vos échanges ne servent pas à entraîner leurs modèles',
  },
  gemini: {
    nom: 'Google Gemini',
    modele: 'gemini-2.5-flash',
    limite: 1500,
    note: 'Palier gratuit généreux · Google peut utiliser les échanges pour ses propres modèles',
  },
  openrouter: {
    nom: 'OpenRouter',
    modele: 'deepseek/deepseek-chat-v3.1:free',
    limite: 50,
    note: 'Modèles « :free » · le plafond monte à 1 000/jour après 10 $ de crédit',
  },
  hf: {
    nom: 'Hugging Face',
    modele: 'meta-llama/Llama-3.1-8B-Instruct',
    limite: 300,
    note: 'Inference API · gratuit · plus lent',
  },
  custom: {
    nom: 'Personnalisée (API)',
    modele: '',
    limite: 1000,
    note: 'Votre propre moteur, compatible OpenAI',
  },
};

/** Valeurs par défaut de la configuration — celles du prototype. */
export const CONFIG_DEFAUT = {
  defaultName: 'Monsieur Koffi',
  displayName: '',
  hue: 265,
  lang: 'fr',
  temperature: 0.4,
  primaryProvider: 'groq' as Fournisseur,
  chaine: ['groq', 'gemini', 'openrouter', 'hf'] as Fournisseur[],
  studentDailyCap: 30,
  // Choix du propriétaire (7 octobre 2026) : les DEUX moteurs sont gardés, et
  // c'est « Whisper large-v3 via Groq » qui vient en premier, comme dans le
  // prototype — le navigateur reste le repli quand la ligne ne peut pas répondre.
  transcription: 'groq-whisper',
};

export type ConfigAssistant = {
  id: string;
  defaultName: string;
  displayName: string;
  hue: number;
  photoKey: string | null;
  lang: string;
  temperature: number;
  primaryProvider: Fournisseur;
  chaine: Fournisseur[];
  modeles: Record<string, string>;
  limites: Record<string, number>;
  studentDailyCap: number;
  transcription: string;
  status: string;
};

/** Le nom affiché partout — exactement la règle du prototype : nom personnalisé, sinon nom par défaut. */
export function nomAssistant(config: Pick<ConfigAssistant, 'displayName' | 'defaultName'>): string {
  const personnalise = (config.displayName ?? '').trim();
  return personnalise.length > 0 ? personnalise : config.defaultName;
}

export function jourDe(maintenant: number): string {
  return new Date(maintenant).toISOString().slice(0, 10);
}

function entier(valeur: unknown, defaut: number): number {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  if (typeof valeur === 'string' && valeur.trim() !== '' && Number.isFinite(Number(valeur))) return Math.trunc(Number(valeur));
  return defaut;
}

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function listeJson<T>(brut: unknown, defaut: T[]): T[] {
  if (typeof brut !== 'string' || brut.trim() === '') return defaut;
  try {
    const valeur = JSON.parse(brut);
    return Array.isArray(valeur) && valeur.length > 0 ? (valeur as T[]) : defaut;
  } catch {
    return defaut;
  }
}

function objetJson(brut: unknown): Record<string, number> {
  if (typeof brut !== 'string' || brut.trim() === '') return {};
  try {
    const valeur = JSON.parse(brut);
    return valeur && typeof valeur === 'object' ? (valeur as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------- lecture/écriture */

export async function lireConfig(db: Db): Promise<ConfigAssistant> {
  const ligne = await db.execute("SELECT * FROM assistant_config WHERE id = 'principal'");
  const row = ligne.rows[0];
  if (!row) {
    return {
      id: 'principal',
      defaultName: CONFIG_DEFAUT.defaultName,
      displayName: '',
      hue: CONFIG_DEFAUT.hue,
      photoKey: null,
      lang: CONFIG_DEFAUT.lang,
      temperature: CONFIG_DEFAUT.temperature,
      primaryProvider: CONFIG_DEFAUT.primaryProvider,
      chaine: [...CONFIG_DEFAUT.chaine],
      modeles: {},
      limites: {},
      studentDailyCap: CONFIG_DEFAUT.studentDailyCap,
      transcription: CONFIG_DEFAUT.transcription,
      status: 'disconnected',
    };
  }
  const chaine = listeJson<Fournisseur>(row.fallback_chain, [...CONFIG_DEFAUT.chaine]).filter(
    (fournisseur) => fournisseur in FOURNISSEURS
  );
  return {
    id: 'principal',
    defaultName: texte(row.default_name, CONFIG_DEFAUT.defaultName),
    displayName: texte(row.display_name),
    hue: entier(row.hue, CONFIG_DEFAUT.hue),
    photoKey: typeof row.photo_key === 'string' && row.photo_key.length > 0 ? row.photo_key : null,
    lang: texte(row.lang, 'fr'),
    temperature: typeof row.temperature === 'number' ? row.temperature : CONFIG_DEFAUT.temperature,
    primaryProvider: (texte(row.primary_provider, 'groq') as Fournisseur) in FOURNISSEURS
      ? (texte(row.primary_provider, 'groq') as Fournisseur)
      : 'groq',
    chaine,
    modeles: objetJson(row.models) as unknown as Record<string, string>,
    limites: objetJson(row.provider_limits),
    studentDailyCap: entier(row.student_daily_cap, CONFIG_DEFAUT.studentDailyCap),
    transcription: texte(row.transcription, CONFIG_DEFAUT.transcription),
    status: texte(row.status, 'disconnected'),
  };
}

export type ConfigModifiable = Partial<{
  displayName: string;
  hue: number;
  photoKey: string | null;
  lang: string;
  temperature: number;
  primaryProvider: Fournisseur;
  chaine: Fournisseur[];
  modeles: Record<string, string>;
  limites: Record<string, number>;
  studentDailyCap: number;
  transcription: string;
}>;

/** Enregistre la configuration. Le fournisseur principal passe toujours en tête de chaîne. */
export async function ecrireConfig(db: Db, actuelle: ConfigAssistant, patch: ConfigModifiable, maintenant = Date.now()): Promise<ConfigAssistant> {
  const fusion: ConfigAssistant = {
    ...actuelle,
    ...patch,
    modeles: { ...actuelle.modeles, ...(patch.modeles ?? {}) },
    limites: { ...actuelle.limites, ...(patch.limites ?? {}) },
    chaine: patch.chaine ?? actuelle.chaine,
  };
  const principal = fusion.primaryProvider;
  const chaine = [principal, ...fusion.chaine.filter((fournisseur) => fournisseur !== principal)];
  fusion.chaine = chaine;

  await db.execute({
    sql: `INSERT INTO assistant_config
            (id, default_name, display_name, hue, photo_key, lang, temperature, primary_provider,
             fallback_chain, models, provider_limits, student_daily_cap, transcription, status, updated_at_ms)
          VALUES ('principal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            display_name = excluded.display_name, hue = excluded.hue, photo_key = excluded.photo_key,
            lang = excluded.lang, temperature = excluded.temperature, primary_provider = excluded.primary_provider,
            fallback_chain = excluded.fallback_chain, models = excluded.models,
            provider_limits = excluded.provider_limits, student_daily_cap = excluded.student_daily_cap,
            transcription = excluded.transcription, updated_at_ms = excluded.updated_at_ms`,
    args: [
      fusion.defaultName,
      fusion.displayName,
      fusion.hue,
      fusion.photoKey,
      fusion.lang,
      fusion.temperature,
      principal,
      JSON.stringify(chaine),
      JSON.stringify(fusion.modeles),
      JSON.stringify(fusion.limites),
      fusion.studentDailyCap,
      fusion.transcription,
      fusion.status,
      maintenant,
    ],
  });
  return fusion;
}

/* ------------------------------------------------------------------- quotas */

export type EtatFournisseur = { requests: number; exhausted: boolean };

export async function etatsFournisseurs(db: Db, jour: string): Promise<Record<string, EtatFournisseur>> {
  const lignes = await db.execute({
    sql: 'SELECT provider, requests, exhausted FROM assistant_provider_days WHERE day = ?',
    args: [jour],
  });
  const etats: Record<string, EtatFournisseur> = {};
  for (const row of lignes.rows) {
    const fournisseur = texte(row.provider);
    if (!fournisseur) continue;
    etats[fournisseur] = { requests: entier(row.requests, 0), exhausted: entier(row.exhausted, 0) === 1 };
  }
  return etats;
}

export function limiteFournisseur(config: ConfigAssistant, fournisseur: Fournisseur): number {
  const personnalisee = config.limites[fournisseur];
  if (typeof personnalisee === 'number' && personnalisee > 0) return personnalisee;
  return FOURNISSEURS[fournisseur].limite;
}

/**
 * La chaîne réellement disponible, dans l'ordre : le premier qui n'a pas atteint
 * son quota du jour est celui qui répond. Si tous sont épuisés, la liste est
 * vide — et l'application le dit honnêtement au lieu d'inventer une réponse.
 */
export function chaineActive(config: ConfigAssistant, etats: Record<string, EtatFournisseur>): Fournisseur[] {
  const ordre = [config.primaryProvider, ...config.chaine.filter((f) => f !== config.primaryProvider)];
  return ordre.filter((fournisseur) => {
    if (!(fournisseur in FOURNISSEURS)) return false;
    const etat = etats[fournisseur];
    if (!etat) return true;
    return !etat.exhausted && etat.requests < limiteFournisseur(config, fournisseur);
  });
}

export async function compterAppelFournisseur(db: Db, fournisseur: Fournisseur, jour: string, quotaAtteint = false): Promise<void> {
  await db.execute({
    sql: `INSERT INTO assistant_provider_days(provider, day, requests, exhausted) VALUES (?, ?, 1, ?)
          ON CONFLICT(provider, day) DO UPDATE SET
            requests = requests + 1,
            exhausted = CASE WHEN ? = 1 THEN 1 ELSE exhausted END`,
    args: [fournisseur, jour, quotaAtteint ? 1 : 0, quotaAtteint ? 1 : 0],
  });
}

export async function marquerQuotaAtteint(db: Db, fournisseur: Fournisseur, jour: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO assistant_provider_days(provider, day, requests, exhausted) VALUES (?, ?, 0, 1)
          ON CONFLICT(provider, day) DO UPDATE SET exhausted = 1`,
    args: [fournisseur, jour],
  });
}

/** Combien de questions reste-t-il à cet étudiant aujourd'hui ? */
export async function questionsRestantes(db: Db, userId: string, jour: string, plafond: number): Promise<number> {
  const ligne = await db.execute({
    sql: 'SELECT requests FROM assistant_user_days WHERE user_id = ? AND day = ?',
    args: [userId, jour],
  });
  const utilisees = entier(ligne.rows[0]?.requests, 0);
  return Math.max(0, plafond - utilisees);
}

export async function compterQuestionEtudiant(db: Db, userId: string, jour: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO assistant_user_days(user_id, day, requests) VALUES (?, ?, 1)
          ON CONFLICT(user_id, day) DO UPDATE SET requests = requests + 1`,
    args: [userId, jour],
  });
}

/* ------------------------------------------------- base de connaissances isolée */

export type ExtraitFormation = {
  formation: string;
  module: string | null;
  lignes: string[];
};

/**
 * Rassemble ce que l'assistant a le droit de lire.
 *
 * DEUX CONDITIONS, et elles sont cumulatives :
 *   1. l'étudiant est RÉELLEMENT inscrit à la formation (table `enrollments`) ;
 *   2. la formation est ASSOCIÉE à l'assistant (table `assistant_kb`, décision du propriétaire).
 * Aucune autre formation ne peut donc fuiter dans une réponse.
 */
export async function contexteAutorise(
  db: Db,
  userId: string,
  formationId: string,
  moduleId: string | null = null,
  limiteLignes = 60
): Promise<ExtraitFormation | null> {
  const droit = await db.execute({
    sql: `SELECT t.title AS formation,
                 (SELECT COUNT(*) FROM enrollments e
                   WHERE e.user_id = ? AND e.training_id = t.id) AS inscrit,
                 (SELECT enabled FROM assistant_kb kb WHERE kb.training_id = t.id) AS kb
          FROM trainings t WHERE t.id = ?`,
    args: [userId, formationId],
  });
  const ligne = droit.rows[0];
  if (!ligne) return null;
  if (entier(ligne.inscrit, 0) !== 1) return null;
  if (entier(ligne.kb, 0) !== 1) return null;

  const lecons = await db.execute({
    sql: `SELECT m.title AS module, m.summary, l.title AS lecon, l.kind, l.duration_min, l.content_text
          FROM course_modules m
          LEFT JOIN course_lessons l ON l.module_id = m.id
          WHERE m.training_id = ? AND (? IS NULL OR m.id = ?)
          ORDER BY m.position, l.position`,
    args: [formationId, moduleId, moduleId],
  });

  const lignes: string[] = [];
  let moduleCourant: string | null = null;
  for (const row of lecons.rows.slice(0, limiteLignes)) {
    const titreModule = texte(row.module);
    if (titreModule && titreModule !== moduleCourant) {
      moduleCourant = titreModule;
      const resume = texte(row.summary);
      lignes.push(`\n— Module : ${titreModule}${resume ? `\n  Résumé : ${resume}` : ''}`);
    }
    const titreLecon = texte(row.lecon);
    if (!titreLecon) continue;
    const duree = entier(row.duration_min, 0);
    lignes.push(`  • Leçon : ${titreLecon}${duree > 0 ? ` (${duree} min)` : ''}`);
    const corps = texte(row.content_text).trim();
    if (corps) lignes.push(`    Contenu : ${corps.slice(0, 1200)}`);
  }
  if (lignes.length === 0) return null;

  return { formation: texte(ligne.formation, 'Formation'), module: moduleId, lignes };
}

/** Les formations associées à l'assistant, pour l'écran de configuration. */
export async function formationsAssociees(db: Db): Promise<Array<{ id: string; titre: string; code: string; associee: boolean }>> {
  const lignes = await db.execute(
    `SELECT t.id, t.title, COALESCE(kb.enabled, 0) AS enabled
     FROM trainings t LEFT JOIN assistant_kb kb ON kb.training_id = t.id
     ORDER BY t.title`
  );
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    titre: texte(row.title, 'Formation'),
    code: '',
    associee: entier(row.enabled, 0) === 1,
  }));
}

export async function definirAssociation(db: Db, formationId: string, associee: boolean, maintenant = Date.now()): Promise<void> {
  await db.execute({
    sql: `INSERT INTO assistant_kb(training_id, enabled, updated_at_ms) VALUES (?, ?, ?)
          ON CONFLICT(training_id) DO UPDATE SET enabled = excluded.enabled, updated_at_ms = excluded.updated_at_ms`,
    args: [formationId, associee ? 1 : 0, maintenant],
  });
}

/* ------------------------------------------------------------------- consignes */

const CONSIGNES_LANGUE: Record<string, string> = {
  fr: 'Réponds en français simple et clair.',
  en: 'Answer in clear, simple English.',
  es: 'Responde en español claro y sencillo.',
  pt: 'Responda em português claro e simples.',
};

/**
 * Les consignes données au moteur. Elles portent la demande la plus récente du
 * propriétaire (7 octobre 2026) : l'assistant s'appuie sur SES contenus, mais ne
 * se contente pas de répéter la leçon que l'étudiant vient d'écouter.
 */
export function promptSysteme(options: {
  nomAssistant: string;
  nomEtudiant: string;
  langue: string;
  formation: string;
  module: string | null;
  contexte: string;
}): string {
  const langue = CONSIGNES_LANGUE[options.langue] ?? CONSIGNES_LANGUE.fr;
  return [
    `Tu es ${options.nomAssistant}, l'assistant pédagogique de DAVAR ACADÉMIE, une école d'art oratoire.`,
    `Tu t'adresses à ${options.nomEtudiant}, étudiant de la formation « ${options.formation} »${options.module ? `, module en cours : « ${options.module} »` : ''}.`,
    '',
    "RÈGLES ABSOLUES :",
    `1. Tu t'appuies EXCLUSIVEMENT sur les contenus de cours fournis ci-dessous. Tu n'inventes jamais un fait, un chiffre ou une méthode qui ne s'y trouve pas.`,
    `2. Tu NE RÉPÈTES PAS la leçon que l'étudiant vient d'écouter. Tu l'éclaires AUTREMENT : un exemple concret et vivant, une reformulation plus simple, un cas pratique qu'il peut appliquer tout de suite, ou une question qui le fait réfléchir.`,
    `3. Tu ne parles QUE de cette formation. Si la question porte sur un autre sujet, tu le dis et tu proposes d'en parler à son coach.`,
    `4. Si la réponse ne figure pas dans les contenus, tu le dis honnêtement et tu proposes que son coach complète sous 48 heures. Tu n'improvises pas.`,
    `5. Style : direct, encourageant, concret. Des phrases courtes. Pas de jargon technique, jamais de mention d'un outil, d'un fournisseur ou d'un modèle.`,
    `6. Quand c'est utile, termine par une seule question ouverte pour vérifier qu'il a compris — jamais un questionnaire.`,
    '',
    langue,
    '',
    'CONTENUS DE COURS AUTORISÉS (extraits) :',
    options.contexte,
  ].join('\n');
}

export type FournisseurJoint = { provider: Fournisseur; modele: string; cleEnvironnement: string; url: string };

/** Les clés viennent de l'environnement du SERVEUR — jamais du navigateur. */
export function jointureFournisseur(fournisseur: Fournisseur, modeles: Record<string, string>): FournisseurJoint | null {
  const modeleDefaut = FOURNISSEURS[fournisseur].modele;
  const modele = (modeles[fournisseur] ?? '').trim() || modeleDefaut;
  switch (fournisseur) {
    case 'groq':
      return { provider: 'groq', modele, cleEnvironnement: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions' };
    case 'openrouter':
      return { provider: 'openrouter', modele, cleEnvironnement: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions' };
    case 'hf':
      return { provider: 'hf', modele, cleEnvironnement: 'HUGGINGFACE_API_KEY', url: 'https://api-inference.huggingface.co/models' };
    case 'gemini':
      return { provider: 'gemini', modele, cleEnvironnement: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta' };
    case 'custom':
      return { provider: 'custom', modele, cleEnvironnement: 'ASSISTANT_CUSTOM_KEY', url: process.env.ASSISTANT_CUSTOM_URL?.trim() ?? '' };
    default:
      return null;
  }
}
