/**
 * ÉCHANGES — conversations entre un étudiant, l'assistant et son coach.
 *
 * Le prototype (et le cycle de vie du propriétaire) fixe deux durées :
 *   90 jours pour les conversations avec l'assistant,
 *   12 mois pour celles avec le coach (exception : litige ou obligation).
 * Elles sont posées dès l'ouverture de la conversation et jamais repoussées.
 */
import type { Db } from './auth-core';
import { PURGE_COACH_MS, PURGE_IA_MS, type Mode } from './assistant.ts';

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

function identifiant(prefixe: string, maintenant: number): string {
  return `${prefixe}_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export type Conversation = {
  id: string;
  userId: string;
  formationId: string;
  moduleId: string | null;
  mode: Mode;
  resolue: boolean;
  iaValidee: boolean;
  atMs: number;
  updatedAtMs: number;
};

export type Message = {
  id: string;
  auteur: 'student' | 'ai' | 'coach' | 'sys';
  texte: string;
  atMs: number;
  provider: string | null;
  modele: string | null;
  valide: boolean;
};

/** Ouvre (ou retrouve) la conversation ouverte d'un étudiant sur un module et un mode. */
export async function ouvrirConversation(
  db: Db,
  options: { userId: string; formationId: string; moduleId?: string | null; mode: Mode },
  maintenant = Date.now()
): Promise<string> {
  const existante = await db.execute({
    sql: `SELECT id FROM conversations
          WHERE user_id = ? AND training_id = ? AND COALESCE(module_id,'') = COALESCE(?,'')
            AND mode = ? AND resolved = 0
          ORDER BY updated_at_ms DESC LIMIT 1`,
    args: [options.userId, options.formationId, options.moduleId ?? null, options.mode],
  });
  const trouvee = texte(existante.rows[0]?.id);
  if (trouvee) return trouvee;

  const id = identifiant('cnv', maintenant);
  const duree = options.mode === 'ai' ? PURGE_IA_MS : PURGE_COACH_MS;
  await db.execute({
    sql: `INSERT INTO conversations(id, user_id, training_id, module_id, mode, resolved, ai_validated, created_at_ms, updated_at_ms, purge_after_ms)
          VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
    args: [id, options.userId, options.formationId, options.moduleId ?? null, options.mode, maintenant, maintenant, maintenant + duree],
  });
  return id;
}

export async function ajouterMessage(
  db: Db,
  options: {
    conversationId: string;
    auteur: Message['auteur'];
    texte: string;
    provider?: string | null;
    modele?: string | null;
    valide?: boolean;
  },
  maintenant = Date.now()
): Promise<string> {
  const id = identifiant('msg', maintenant);
  await db.execute({
    sql: `INSERT INTO conversation_messages(id, conversation_id, author, text, at_ms, provider, model, validated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      options.conversationId,
      options.auteur,
      options.texte,
      maintenant,
      options.provider ?? null,
      options.modele ?? null,
      options.valide ? 1 : 0,
    ],
  });
  await db.execute({
    sql: 'UPDATE conversations SET updated_at_ms = ? WHERE id = ?',
    args: [maintenant, options.conversationId],
  });
  return id;
}

export async function messagesDeConversation(db: Db, conversationId: string): Promise<Message[]> {
  const lignes = await db.execute({
    sql: 'SELECT id, author, text, at_ms, provider, model, validated FROM conversation_messages WHERE conversation_id = ? ORDER BY at_ms',
    args: [conversationId],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id) ?? '',
    auteur: (texte(row.author) ?? 'sys') as Message['auteur'],
    texte: texte(row.text) ?? '',
    atMs: entier(row.at_ms) ?? 0,
    provider: texte(row.provider),
    modele: texte(row.model),
    valide: entier(row.validated) === 1,
  }));
}

export type ConversationAvecContexte = Conversation & {
  etudiant: string;
  courriel: string;
  formation: string;
  module: string | null;
  dernierMessage: string | null;
  nbMessages: number;
};

/** Les conversations d'un étudiant, pour « Mes questions ». */
export async function conversationsDeEtudiant(db: Db, userId: string, limite = 40): Promise<ConversationAvecContexte[]> {
  const lignes = await db.execute({
    sql: `SELECT c.id, c.user_id, c.training_id, c.module_id, c.mode, c.resolved, c.ai_validated,
                 c.created_at_ms, c.updated_at_ms,
                 t.title AS formation, m.title AS module,
                 (SELECT text FROM conversation_messages cm WHERE cm.conversation_id = c.id ORDER BY at_ms DESC LIMIT 1) AS dernier,
                 (SELECT COUNT(*) FROM conversation_messages cm WHERE cm.conversation_id = c.id) AS nb
          FROM conversations c
          LEFT JOIN trainings t ON t.id = c.training_id
          LEFT JOIN course_modules m ON m.id = c.module_id
          WHERE c.user_id = ?
          ORDER BY c.updated_at_ms DESC LIMIT ?`,
    args: [userId, Math.min(Math.max(limite, 1), 100)],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id) ?? '',
    userId: texte(row.user_id) ?? '',
    formationId: texte(row.training_id) ?? '',
    moduleId: texte(row.module_id),
    mode: (texte(row.mode) ?? 'ai') as Mode,
    resolue: entier(row.resolved) === 1,
    iaValidee: entier(row.ai_validated) === 1,
    atMs: entier(row.created_at_ms) ?? 0,
    updatedAtMs: entier(row.updated_at_ms) ?? 0,
    etudiant: '',
    courriel: '',
    formation: texte(row.formation) ?? 'Aide',
    module: texte(row.module),
    dernierMessage: texte(row.dernier),
    nbMessages: entier(row.nb) ?? 0,
  }));
}

/** Toutes les conversations, pour la supervision du coach et du propriétaire. */
export async function toutesConversations(db: Db, options: { seulementEnAttente?: boolean; limite?: number } = {}): Promise<
  ConversationAvecContexte[]
> {
  const filtre = options.seulementEnAttente
    ? `AND c.resolved = 0 AND (
         (c.mode = 'coach' AND EXISTS (SELECT 1 FROM conversation_messages cm WHERE cm.conversation_id = c.id AND cm.author = 'student')
           AND NOT EXISTS (SELECT 1 FROM conversation_messages cm WHERE cm.conversation_id = c.id AND cm.author = 'coach'))
         OR (c.mode = 'ai' AND EXISTS (SELECT 1 FROM conversation_messages cm WHERE cm.conversation_id = c.id AND cm.author = 'ai')
           AND c.ai_validated = 0)
       )`
    : '';
  const lignes = await db.execute({
    sql: `SELECT c.id, c.user_id, c.training_id, c.module_id, c.mode, c.resolved, c.ai_validated,
                 c.created_at_ms, c.updated_at_ms,
                 u.display_name AS etudiant, u.email_normalized AS courriel,
                 t.title AS formation, m.title AS module,
                 (SELECT text FROM conversation_messages cm WHERE cm.conversation_id = c.id ORDER BY at_ms DESC LIMIT 1) AS dernier,
                 (SELECT COUNT(*) FROM conversation_messages cm WHERE cm.conversation_id = c.id) AS nb
          FROM conversations c
          JOIN users u ON u.id = c.user_id
          LEFT JOIN trainings t ON t.id = c.training_id
          LEFT JOIN course_modules m ON m.id = c.module_id
          WHERE 1 = 1 ${filtre}
          ORDER BY c.updated_at_ms DESC LIMIT ?`,
    args: [Math.min(Math.max(options.limite ?? 80, 1), 300)],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id) ?? '',
    userId: texte(row.user_id) ?? '',
    formationId: texte(row.training_id) ?? '',
    moduleId: texte(row.module_id),
    mode: (texte(row.mode) ?? 'ai') as Mode,
    resolue: entier(row.resolved) === 1,
    iaValidee: entier(row.ai_validated) === 1,
    atMs: entier(row.created_at_ms) ?? 0,
    updatedAtMs: entier(row.updated_at_ms) ?? 0,
    etudiant: texte(row.etudiant) ?? 'Étudiant',
    courriel: texte(row.courriel) ?? '',
    formation: texte(row.formation) ?? 'Aide',
    module: texte(row.module),
    dernierMessage: texte(row.dernier),
    nbMessages: entier(row.nb) ?? 0,
  }));
}

/** Le coach répond, valide ou corrige. Il n'est jamais bloqué par l'assistant. */
export async function repondreCommeCoach(db: Db, conversationId: string, texteReponse: string, maintenant = Date.now()): Promise<void> {
  await ajouterMessage(db, { conversationId, auteur: 'coach', texte: texteReponse }, maintenant);
  await db.execute({
    sql: "UPDATE conversations SET ai_validated = 1, updated_at_ms = ? WHERE id = ?",
    args: [maintenant, conversationId],
  });
}

export async function validerReponseIA(db: Db, conversationId: string, maintenant = Date.now()): Promise<void> {
  await db.execute({
    sql: 'UPDATE conversations SET ai_validated = 1, updated_at_ms = ? WHERE id = ?',
    args: [maintenant, conversationId],
  });
  await db.execute({
    sql: "UPDATE conversation_messages SET validated = 1 WHERE conversation_id = ? AND author = 'ai'",
    args: [conversationId],
  });
}

export async function marquerResolue(db: Db, conversationId: string, maintenant = Date.now()): Promise<void> {
  await db.execute({
    sql: 'UPDATE conversations SET resolved = 1, updated_at_ms = ? WHERE id = ?',
    args: [maintenant, conversationId],
  });
}

/** Combien de conversations attendent une intervention humaine ? */
export async function compterEnAttente(db: Db): Promise<{ coach: number; iaNonValidee: number }> {
  const coach = await db.execute(
    `SELECT COUNT(*) AS n FROM conversations c
     WHERE c.mode = 'coach' AND c.resolved = 0
       AND EXISTS (SELECT 1 FROM conversation_messages cm WHERE cm.conversation_id = c.id AND cm.author = 'student')
       AND NOT EXISTS (SELECT 1 FROM conversation_messages cm WHERE cm.conversation_id = c.id AND cm.author = 'coach')`
  );
  const ia = await db.execute(
    `SELECT COUNT(*) AS n FROM conversations c
     WHERE c.mode = 'ai' AND c.resolved = 0 AND c.ai_validated = 0
       AND EXISTS (SELECT 1 FROM conversation_messages cm WHERE cm.conversation_id = c.id AND cm.author = 'ai')`
  );
  return { coach: entier(coach.rows[0]?.n) ?? 0, iaNonValidee: entier(ia.rows[0]?.n) ?? 0 };
}

/** Purge du cycle de vie : les conversations dépassées disparaissent, avec leurs messages. */
export async function purgerEchanges(db: Db, maintenant = Date.now()): Promise<number> {
  const aPurger = await db.execute({
    sql: 'SELECT id FROM conversations WHERE purge_after_ms <= ? AND resolved = 1',
    args: [maintenant],
  });
  let supprimees = 0;
  for (const row of aPurger.rows) {
    const id = texte(row.id);
    if (!id) continue;
    await db.execute({ sql: 'DELETE FROM conversation_messages WHERE conversation_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM conversations WHERE id = ?', args: [id] });
    supprimees += 1;
  }
  return supprimees;
}
