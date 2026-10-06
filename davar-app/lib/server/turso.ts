import { createClient } from '@libsql/client/web';

/** Accès serveur uniquement. Ne jamais importer ce module dans un composant client. */
export function checkedConnection() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  const stage = process.env.APP_ENV;
  const expectedHost = process.env.TURSO_EXPECTED_HOST;
  if (!url || !token || !expectedHost || !['staging', 'production'].includes(stage || ''))
    throw new Error('Turso non configuré côté serveur');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('URL Turso invalide'); }
  if (!['libsql:', 'https:'].includes(parsed.protocol)) throw new Error('Protocole Turso refusé');
  if (parsed.hostname !== expectedHost || (stage === 'production' && parsed.hostname.includes('staging')))
    throw new Error('Cible Turso incohérente avec l’environnement');
  return {url, authToken: token};
}

export async function checkTursoConnection(): Promise<void> {
  const client = createClient(checkedConnection());
  try {
    const result = await client.execute('SELECT 1 AS ok');
    if (Number(result.rows[0]?.ok) !== 1) throw new Error('sonde Turso invalide');
  } finally {
    client.close();
  }
}

type PublicTraining = {id: string; title: string; priceCfa: number};
// Cache de métadonnées publiques par instance, jamais un cache de droits ou de prix de checkout.
// Chaque instance Workers possède son propre cache : ce n'est pas un quota global.
let cached: {expiresAt: number; value: PublicTraining[]} | undefined;
let pending: Promise<PublicTraining[]> | undefined;

export async function getPublishedTrainings(): Promise<PublicTraining[]> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    const client = createClient(checkedConnection());
    try {
      const result = await client.execute(
        'SELECT id, title, price_cfa FROM trainings WHERE published = 1 ORDER BY title LIMIT 30'
      );
      const trainings = result.rows.map((row) => {
        const price = Number(row.price_cfa);
        if (typeof row.id !== 'string' || typeof row.title !== 'string' ||
            !Number.isSafeInteger(price) || price < 0)
          throw new Error('Catalogue Turso invalide');
        return {id: row.id, title: row.title, priceCfa: price};
      });
      cached = {expiresAt: Date.now() + 60_000, value: trainings};
      return trainings;
    } finally { client.close(); }
  })();
  try { return await pending; } finally { pending = undefined; }
}
