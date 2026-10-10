/**
 * CLÉS API — pour que le propriétaire branche ses propres outils (Sheets, scripts,
 * intégrations) sans jamais donner son mot de passe.
 *
 * Deux principes, non négociables :
 *   - la clé en clair n'est montrée QU'UNE FOIS, à la création ; ensuite seule son
 *     empreinte subsiste — même nous ne pouvons pas la relire ;
 *   - une clé se révoque en un geste, et la révocation est datée.
 */
import type { Db } from './auth-core';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

export type CleApi = {
  id: string;
  label: string;
  prefix: string;
  createdAtMs: number;
  lastUsedAtMs: number | null;
  revokedAtMs: number | null;
};

async function empreinte(cle: string): Promise<string> {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cle));
  return [...new Uint8Array(octets)].map((octet) => octet.toString(16).padStart(2, '0')).join('');
}

/** Une clé lisible, avec un préfixe reconnaissable : dvk_… */
export function formeCle(): string {
  const octets = new Uint8Array(24);
  crypto.getRandomValues(octets);
  const corps = [...octets].map((octet) => octet.toString(16).padStart(2, '0')).join('');
  return `dvk_${corps}`;
}

export async function creerCle(
  db: Db,
  options: { label: string; createur: string },
  maintenant = Date.now()
): Promise<{ ok: boolean; erreur?: string; cle?: string; id?: string }> {
  const libelle = options.label.trim();
  if (libelle.length < 2 || libelle.length > 80) return { ok: false, erreur: 'libelle_invalide' };
  const cle = formeCle();
  const id = `key_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await db.execute({
    sql: `INSERT INTO api_keys(id, label, key_hash, prefix, created_by, created_at_ms, last_used_at_ms, revoked_at_ms)
          VALUES (?,?,?,?,?,?,NULL,NULL)`,
    args: [id, libelle, await empreinte(cle), cle.slice(0, 12), options.createur, maintenant],
  });
  return { ok: true, cle, id };
}

export async function listerCles(db: Db): Promise<CleApi[]> {
  const lignes = await db.execute('SELECT id, label, prefix, created_at_ms, last_used_at_ms, revoked_at_ms FROM api_keys ORDER BY created_at_ms DESC');
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    label: texte(row.label),
    prefix: texte(row.prefix),
    createdAtMs: entier(row.created_at_ms) ?? 0,
    lastUsedAtMs: entier(row.last_used_at_ms),
    revokedAtMs: entier(row.revoked_at_ms),
  }));
}

export async function revoquerCle(db: Db, id: string, maintenant = Date.now()): Promise<boolean> {
  const resultat = await db.execute({
    sql: 'UPDATE api_keys SET revoked_at_ms = ? WHERE id = ? AND revoked_at_ms IS NULL',
    args: [maintenant, id],
  });
  return (resultat.rowsAffected ?? 0) > 0;
}

/** Une clé présentée par un outil externe est-elle valable ? La date d'usage est notée. */
export async function cleValide(db: Db, cle: string, maintenant = Date.now()): Promise<boolean> {
  if (typeof cle !== 'string' || !cle.startsWith('dvk_') || cle.length < 20 || cle.length > 200) return false;
  const ligne = await db.execute({
    sql: 'SELECT id FROM api_keys WHERE key_hash = ? AND revoked_at_ms IS NULL',
    args: [await empreinte(cle)],
  });
  const id = texte(ligne.rows[0]?.id);
  if (!id) return false;
  await db.execute({ sql: 'UPDATE api_keys SET last_used_at_ms = ? WHERE id = ?', args: [maintenant, id] });
  return true;
}
