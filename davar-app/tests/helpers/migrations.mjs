/**
 * Chargement des migrations pour les tests locaux : une seule source de vérité,
 * pour qu'un nouveau fichier de migration soit pris en compte partout.
 * Aucun accès réseau : les migrations sont lues depuis le dépôt.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, 'turso', 'migrations');

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sqlite.sql'))
    .sort();
}

export function statementsOf(file) {
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    .split(';')
    .map((statement) => statement.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

/** Applique toutes les migrations, dans l'ordre des versions. */
export async function applyAllMigrations(client) {
  for (const file of migrationFiles())
    for (const statement of statementsOf(file)) await client.execute(statement);
  return migrationFiles();
}
