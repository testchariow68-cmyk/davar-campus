/**
 * EXPORTS ET FACTURES — « Exports + factures derrière le mot de passe ».
 *
 * Un export fait SORTIR des données personnelles de la plateforme : il exige donc
 * le mot de passe du propriétaire, même s'il est déjà connecté, et il est
 * journalisé (quoi, combien de lignes, qui, quand). C'est la seule manière
 * honnête de tenir la promesse « derrière le mot de passe ».
 */
import { verifyPassword, type Db } from './auth-core.ts';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

export const TYPES_EXPORT = ['etudiants', 'ventes', 'progressions', 'avis', 'certifications', 'devoirs'] as const;
export type TypeExport = (typeof TYPES_EXPORT)[number];

export const LIBELLES_EXPORT: Record<TypeExport, string> = {
  etudiants: 'Étudiants',
  ventes: 'Ventes',
  progressions: 'Progressions',
  avis: 'Avis',
  certifications: 'Certifications',
  devoirs: 'Devoirs rendus',
};

/** Le mot de passe du propriétaire, vérifié à l'instant du geste. */
export async function motDePasseProprietaireValide(db: Db, userId: string, motDePasse: string): Promise<boolean> {
  if (typeof motDePasse !== 'string' || motDePasse.length < 1 || motDePasse.length > 300) return false;
  const ligne = await db.execute({ sql: 'SELECT password_hash FROM users WHERE id = ?', args: [userId] });
  const empreinte = texte(ligne.rows[0]?.password_hash);
  if (!empreinte) return false;
  const verdict = await verifyPassword(motDePasse, empreinte);
  return verdict.ok;
}

/** Cellules d'un CSV français : point-virgule, et guillemets doublés. */
export function cellule(valeur: unknown): string {
  const brut = valeur === null || valeur === undefined ? '' : String(valeur);
  if (/[";\n\r]/.test(brut)) return `"${brut.replace(/"/g, '""')}"`;
  return brut;
}

export function texteCsv(entetes: string[], lignes: Array<Array<unknown>>): string {
  const corps = [entetes.map(cellule).join(';'), ...lignes.map((ligne) => ligne.map(cellule).join(';'))];
  // Le BOM permet à Excel d'ouvrir le fichier en UTF-8 sans abîmer les accents.
  return `\uFEFF${corps.join('\r\n')}\r\n`;
}

export type TableExport = { entetes: string[]; lignes: Array<Array<unknown>> };

/** Les données, telles qu'elles sont — sans arrondir et sans rien inventer. */
export async function construireExport(db: Db, kind: TypeExport): Promise<TableExport> {
  switch (kind) {
    case 'etudiants': {
      const lignes = await db.execute(
        `SELECT u.display_name, u.email_normalized, u.status, u.created_at_ms, u.last_login_at_ms,
                (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS formations
         FROM users u WHERE u.role = 'student' AND u.is_test = 0 ORDER BY u.created_at_ms DESC`
      );
      return {
        entetes: ['Nom', 'Adresse e-mail', 'Statut', 'Inscrit le', 'Dernière connexion', 'Formations'],
        lignes: lignes.rows.map((row) => [
          texte(row.display_name),
          texte(row.email_normalized),
          texte(row.status),
          dateIso(entier(row.created_at_ms)),
          dateIso(entier(row.last_login_at_ms)),
          entier(row.formations) ?? 0,
        ]),
      };
    }
    case 'ventes': {
      const lignes = await db.execute(
        `SELECT p.sale_id, p.buyer_email_normalized, t.title AS formation, p.amount_value_text, p.currency, p.verified_at_ms
         FROM verified_purchases p JOIN trainings t ON t.id = p.training_id ORDER BY p.verified_at_ms DESC`
      );
      return {
        entetes: ['Référence de vente', 'Acheteur', 'Formation', 'Montant', 'Devise', 'Vérifiée le'],
        lignes: lignes.rows.map((row) => [
          texte(row.sale_id),
          texte(row.buyer_email_normalized),
          texte(row.formation),
          texte(row.amount_value_text),
          texte(row.currency),
          dateIso(entier(row.verified_at_ms)),
        ]),
      };
    }
    case 'progressions': {
      const lignes = await db.execute(
        `SELECT u.display_name, u.email_normalized, t.title AS formation,
                (SELECT COUNT(*) FROM course_lessons l JOIN course_modules m ON m.id = l.module_id WHERE m.training_id = t.id) AS total,
                (SELECT COUNT(*) FROM lesson_completions c JOIN course_lessons l ON l.id = c.lesson_id
                   JOIN course_modules m ON m.id = l.module_id WHERE m.training_id = t.id AND c.user_id = u.id) AS faites,
                e.acquired_at_ms
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         JOIN trainings t ON t.id = e.training_id
         WHERE u.is_test = 0
         ORDER BY u.display_name`
      );
      return {
        entetes: ['Étudiant', 'Adresse e-mail', 'Formation', 'Leçons faites', 'Leçons au total', 'Accès depuis'],
        lignes: lignes.rows.map((row) => [
          texte(row.display_name),
          texte(row.email_normalized),
          texte(row.formation),
          entier(row.faites) ?? 0,
          entier(row.total) ?? 0,
          dateIso(entier(row.acquired_at_ms)),
        ]),
      };
    }
    case 'avis': {
      const lignes = await db.execute(
        `SELECT r.step, r.words, r.kind, r.body, r.at_ms, u.display_name, u.email_normalized, t.title AS formation
         FROM reviews r JOIN users u ON u.id = r.user_id JOIN trainings t ON t.id = r.training_id
         ORDER BY r.at_ms DESC`
      );
      return {
        entetes: ['Étudiant', 'Adresse e-mail', 'Formation', 'Avis n°', 'Mots', 'Type', 'Texte', 'Reçu le'],
        lignes: lignes.rows.map((row) => [
          texte(row.display_name),
          texte(row.email_normalized),
          texte(row.formation),
          entier(row.step) ?? 1,
          entier(row.words) ?? 0,
          texte(row.kind),
          texte(row.body),
          dateIso(entier(row.at_ms)),
        ]),
      };
    }
    case 'certifications': {
      const lignes = await db.execute(
        `SELECT c.code, c.holder_name, c.formation_title, c.status, c.issued_at_ms, u.email_normalized
         FROM certificates c JOIN users u ON u.id = c.user_id ORDER BY c.issued_at_ms DESC`
      );
      return {
        entetes: ['Code', 'Titulaire', 'Adresse e-mail', 'Formation', 'Statut', 'Délivré le'],
        lignes: lignes.rows.map((row) => [
          texte(row.code),
          texte(row.holder_name),
          texte(row.email_normalized),
          texte(row.formation_title),
          texte(row.status),
          dateIso(entier(row.issued_at_ms)),
        ]),
      };
    }
    case 'devoirs': {
      const lignes = await db.execute(
        `SELECT s.status, s.note, s.feedback, s.at_ms, u.display_name, u.email_normalized, a.title AS evaluation, t.title AS formation
         FROM submissions s
         JOIN users u ON u.id = s.user_id
         JOIN lesson_assessments a ON a.id = s.assessment_id
         JOIN trainings t ON t.id = s.training_id
         ORDER BY s.at_ms DESC`
      );
      return {
        entetes: ['Étudiant', 'Adresse e-mail', 'Formation', 'Évaluation', 'Statut', 'Note rendue', 'Retour', 'Rendu le'],
        lignes: lignes.rows.map((row) => [
          texte(row.display_name),
          texte(row.email_normalized),
          texte(row.formation),
          texte(row.evaluation),
          texte(row.status),
          texte(row.note),
          texte(row.feedback),
          dateIso(entier(row.at_ms)),
        ]),
      };
    }
    default:
      return { entetes: [], lignes: [] };
  }
}

function dateIso(atMs: number | null): string {
  if (!atMs) return '';
  return new Date(atMs).toISOString().slice(0, 16).replace('T', ' ');
}

export async function journaliserExport(db: Db, kind: string, lignes: number, acteur: string, maintenant = Date.now()): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO exports_log(id, kind, rows, actor, at_ms) VALUES (?,?,?,?,?)',
    args: [`exp_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`, kind, lignes, acteur, maintenant],
  });
}

export async function derniersExports(db: Db, limite = 20): Promise<Array<{ kind: string; rows: number; atMs: number }>> {
  const lignes = await db.execute({
    sql: 'SELECT kind, rows, at_ms FROM exports_log ORDER BY at_ms DESC LIMIT ?',
    args: [Math.min(Math.max(limite, 1), 100)],
  });
  return lignes.rows.map((row) => ({
    kind: texte(row.kind),
    rows: entier(row.rows) ?? 0,
    atMs: entier(row.at_ms) ?? 0,
  }));
}

export type Facture = {
  numero: string;
  reference: string;
  acheteur: string;
  formation: string;
  montant: string;
  devise: string;
  verifieeLeMs: number;
};

/**
 * FACTURE — une pièce par vente vérifiée. Le numéro est stable et calculé à partir
 * de la date de la vente et de son rang : la même vente donne toujours la même
 * facture, jamais deux numéros différents.
 */
export async function factureDeVente(db: Db, saleId: string): Promise<Facture | null> {
  const ligne = await db.execute({
    sql: `SELECT p.sale_id, p.buyer_email_normalized, p.amount_value_text, p.currency, p.verified_at_ms,
                 t.title AS formation,
                 (SELECT COUNT(*) FROM verified_purchases q WHERE q.verified_at_ms < p.verified_at_ms) AS rang
          FROM verified_purchases p JOIN trainings t ON t.id = p.training_id
          WHERE p.sale_id = ?`,
    args: [saleId],
  });
  const row = ligne.rows[0];
  if (!row) return null;
  const atMs = entier(row.verified_at_ms) ?? 0;
  const annee = new Date(atMs).getUTCFullYear();
  const rang = (entier(row.rang) ?? 0) + 1;
  return {
    numero: `DAV-${annee}-${String(rang).padStart(4, '0')}`,
    reference: texte(row.sale_id),
    acheteur: texte(row.buyer_email_normalized),
    formation: texte(row.formation),
    montant: texte(row.amount_value_text),
    devise: texte(row.currency),
    verifieeLeMs: atMs,
  };
}

export async function ventesPourFactures(db: Db, limite = 100): Promise<Facture[]> {
  const lignes = await db.execute({
    sql: `SELECT p.sale_id FROM verified_purchases p ORDER BY p.verified_at_ms DESC LIMIT ?`,
    args: [Math.min(Math.max(limite, 1), 500)],
  });
  const factures: Facture[] = [];
  for (const row of lignes.rows) {
    const facture = await factureDeVente(db, texte(row.sale_id));
    if (facture) factures.push(facture);
  }
  return factures;
}
