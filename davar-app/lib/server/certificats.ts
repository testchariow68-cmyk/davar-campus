/**
 * CERTIFICATS — demandés, validés à la main, vérifiables par un code public.
 *
 * Décisions du propriétaire, écrites dans ses documents :
 *   - le certificat ne se télécharge pas tout seul : il se DEMANDE ;
 *   - la direction valide, ou refuse avec un motif ;
 *   - le nom du porteur est FIGÉ au moment de la validation : un changement de
 *     profil ne réécrit jamais un certificat déjà délivré ;
 *   - la vérification est publique, par code, et ne révèle rien d'autre que le
 *     nom du porteur, la formation et la date.
 */
import type { Db } from './auth-core';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown, defaut = 0): number {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return defaut;
}

export type Certificat = {
  id: string;
  code: string;
  holderName: string;
  formationTitle: string;
  issuedAtMs: number;
  status: string;
};

export type DemandeCertificat = { id: string; formation: string; statut: string; motif: string | null; atMs: number };

export async function demanderCertificat(
  db: Db,
  options: { userId: string; formationId: string; holderName: string },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string }> {
  const nom = options.holderName.trim();
  if (nom.length < 2 || nom.length > 120) return { ok: false, erreur: 'nom_invalide' };

  const droit = await db.execute({
    sql: 'SELECT 1 AS ok FROM enrollments WHERE user_id = ? AND training_id = ?',
    args: [options.userId, options.formationId],
  });
  if (droit.rows.length === 0) return { ok: false, erreur: 'non_inscrit' };

  const deja = await db.execute({
    sql: "SELECT status FROM certificate_requests WHERE user_id = ? AND training_id = ? AND status IN ('pending','approved')",
    args: [options.userId, options.formationId],
  });
  if (deja.rows.length > 0) return { ok: false, erreur: 'demande_deja_en_cours' };

  await db.execute({
    sql: `INSERT INTO certificate_requests(id, user_id, training_id, holder_name, status, at_ms)
          VALUES (?,?,?,?,'pending',?)`,
    args: [`creq_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`, options.userId, options.formationId, nom, maintenant],
  });
  return { ok: true };
}

/** Un code lisible et unique : CERT-2026-0147, comme dans le prototype. */
export function codeCertificat(annee: number, sequence: number): string {
  return `CERT-${annee}-${String(sequence).padStart(4, '0')}`;
}

async function prochainNumero(db: Db, annee: number): Promise<number> {
  const ligne = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM certificates WHERE code LIKE ?",
    args: [`CERT-${annee}-%`],
  });
  return entier(ligne.rows[0]?.n) + 1;
}

export async function deciderCertificat(
  db: Db,
  options: { requestId: string; decision: 'approved' | 'refused'; motif: string; decideur: string },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string; code?: string }> {
  const demande = await db.execute({
    sql: 'SELECT user_id, training_id, holder_name, status FROM certificate_requests WHERE id = ?',
    args: [options.requestId],
  });
  const ligne = demande.rows[0];
  if (!ligne) return { ok: false, erreur: 'demande_introuvable' };
  if (texte(ligne.status) !== 'pending') return { ok: false, erreur: 'deja_decidee' };

  if (options.decision === 'refused') {
    const motif = options.motif.trim();
    if (motif.length < 5) return { ok: false, erreur: 'motif_obligatoire' };
    await db.execute({
      sql: "UPDATE certificate_requests SET status = 'refused', motif = ?, decided_at_ms = ?, decided_by = ? WHERE id = ?",
      args: [motif, maintenant, options.decideur, options.requestId],
    });
    return { ok: true };
  }

  const formation = await db.execute({
    sql: 'SELECT title FROM trainings WHERE id = ?',
    args: [texte(ligne.training_id)],
  });
  const titreFormation = texte(formation.rows[0]?.title, 'Formation DAVAR');
  const annee = new Date(maintenant).getUTCFullYear();
  const code = codeCertificat(annee, await prochainNumero(db, annee));

  await db.execute({
    sql: `INSERT INTO certificates(id, code, user_id, training_id, holder_name, formation_title, request_id, issued_at_ms, status)
          VALUES (?,?,?,?,?,?,?,?,'active')`,
    args: [
      `cert_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      code,
      texte(ligne.user_id),
      texte(ligne.training_id),
      texte(ligne.holder_name, 'Titulaire'),
      titreFormation,
      options.requestId,
      maintenant,
    ],
  });
  await db.execute({
    sql: "UPDATE certificate_requests SET status = 'approved', decided_at_ms = ?, decided_by = ? WHERE id = ?",
    args: [maintenant, options.decideur, options.requestId],
  });
  return { ok: true, code };
}

export async function certificatsDeEtudiant(db: Db, userId: string): Promise<Certificat[]> {
  const lignes = await db.execute({
    sql: 'SELECT id, code, holder_name, formation_title, issued_at_ms, status FROM certificates WHERE user_id = ? ORDER BY issued_at_ms DESC',
    args: [userId],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    code: texte(row.code),
    holderName: texte(row.holder_name),
    formationTitle: texte(row.formation_title),
    issuedAtMs: entier(row.issued_at_ms),
    status: texte(row.status, 'active'),
  }));
}

export async function demandesDeEtudiant(db: Db, userId: string): Promise<DemandeCertificat[]> {
  const lignes = await db.execute({
    sql: `SELECT r.id, r.status, r.motif, r.at_ms, t.title AS formation
          FROM certificate_requests r JOIN trainings t ON t.id = r.training_id
          WHERE r.user_id = ? ORDER BY r.at_ms DESC`,
    args: [userId],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    formation: texte(row.formation, 'Formation'),
    statut: texte(row.status, 'pending'),
    motif: texte(row.motif) || null,
    atMs: entier(row.at_ms),
  }));
}

export async function demandesEnAttente(db: Db, limite = 60): Promise<
  Array<{ id: string; etudiant: string; courriel: string; formation: string; holderName: string; atMs: number }>
> {
  const lignes = await db.execute({
    sql: `SELECT r.id, r.holder_name, r.at_ms, u.display_name, u.email_normalized, t.title AS formation
          FROM certificate_requests r
          JOIN users u ON u.id = r.user_id
          JOIN trainings t ON t.id = r.training_id
          WHERE r.status = 'pending' ORDER BY r.at_ms LIMIT ?`,
    args: [Math.min(Math.max(limite, 1), 200)],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    etudiant: texte(row.display_name, 'Étudiant'),
    courriel: texte(row.email_normalized),
    formation: texte(row.formation, 'Formation'),
    holderName: texte(row.holder_name),
    atMs: entier(row.at_ms),
  }));
}

/**
 * VÉRIFICATION PUBLIQUE — ne révèle que le nécessaire : le nom du porteur, la
 * formation, la date, et si le certificat est toujours valide. Rien de plus.
 */
export async function verifierCertificat(
  db: Db,
  code: string
): Promise<{ trouve: boolean; valide: boolean; holderName?: string; formationTitle?: string; issuedAtMs?: number }> {
  const propre = code.trim().toUpperCase().slice(0, 40);
  if (propre.length < 6) return { trouve: false, valide: false };
  const lignes = await db.execute({
    sql: 'SELECT holder_name, formation_title, issued_at_ms, status FROM certificates WHERE UPPER(code) = ?',
    args: [propre],
  });
  const ligne = lignes.rows[0];
  if (!ligne) return { trouve: false, valide: false };
  return {
    trouve: true,
    valide: texte(ligne.status, 'active') === 'active',
    holderName: texte(ligne.holder_name),
    formationTitle: texte(ligne.formation_title),
    issuedAtMs: entier(ligne.issued_at_ms),
  };
}
