/**
 * Protection des quotas — SERVEUR UNIQUEMENT.
 *
 * Principe directeur du projet : « les quotas se protègent, ils ne se
 * dépensent pas ». Ce module compte les opérations réellement coûteuses
 * (requêtes dynamiques, écritures, hachages délégués, e-mails) et compare la
 * consommation aux budgets des offres gratuites, AVANT de les atteindre.
 *
 * Deux niveaux :
 *  - `countOp` : incrément local par instance (Worker), vidé en base tous les
 *    `QUOTA_FLUSH_EVERY` appels (par défaut 20). Coût : ~1 écriture Turso pour
 *    20 opérations comptées, soit ~5 % du budget d'écritures mensuel à
 *    3 000 étudiants actifs.
 *  - `quotaSnapshot` : lecture agrégée, réservée au diagnostic protégé.
 */
import type { Db } from './auth-core.ts';

export type { Db };

export type QuotaVerdict = 'ok' | 'warning' | 'critical' | 'exhausted';

export type QuotaBudget = { name: string; period: 'day' | 'month'; limit: number; hard: boolean };

/** Budgets des offres gratuites retenues (surchargeables par variables d'environnement). */
export const DEFAULT_BUDGETS: Record<string, QuotaBudget> = {
  // Cloudflare Workers Free : 100 000 requêtes dynamiques/jour (les assets
  // statiques sont gratuits et illimités, donc non comptés ici).
  'worker.requests': { name: 'worker.requests', period: 'day', limit: 100_000, hard: true },
  // Turso Free : 10 millions de lignes écrites et 500 millions de lignes lues par mois.
  'turso.rows_written': { name: 'turso.rows_written', period: 'month', limit: 10_000_000, hard: true },
  'turso.rows_read': { name: 'turso.rows_read', period: 'month', limit: 500_000_000, hard: false },
  // Brevo Free : 300 e-mails par jour, transactionnel et marketing confondus.
  'email.sent': { name: 'email.sent', period: 'day', limit: 300, hard: true },
  // Hachages délégués au service gratuit : plafond volontairement bas, c'est
  // l'opération la plus coûteuse en CPU de tout le système.
  'kdf.operations': { name: 'kdf.operations', period: 'day', limit: 3_000, hard: true },
};

const ENV_NAMES: Record<string, string> = {
  'worker.requests': 'QUOTA_DAILY_WORKER_REQUESTS',
  'turso.rows_written': 'QUOTA_MONTHLY_ROWS_WRITTEN',
  'turso.rows_read': 'QUOTA_MONTHLY_ROWS_READ',
  'email.sent': 'QUOTA_DAILY_EMAILS',
  'kdf.operations': 'QUOTA_DAILY_KDF',
};

export function budgetFor(name: keyof typeof DEFAULT_BUDGETS): QuotaBudget {
  const fallback = DEFAULT_BUDGETS[name];
  const raw = process.env[ENV_NAMES[name]]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return { ...fallback, limit: parsed };
}

export function windowTagFor(period: 'day' | 'month', now = Date.now()): string {
  const iso = new Date(now).toISOString();
  return period === 'day' ? iso.slice(0, 10) : iso.slice(0, 7);
}

export function verdictFor(used: number, limit: number): QuotaVerdict {
  if (limit <= 0) return 'exhausted';
  const ratio = used / limit;
  if (ratio >= 1) return 'exhausted';
  if (ratio >= 0.9) return 'critical';
  if (ratio >= 0.7) return 'warning';
  return 'ok';
}

/* ------------------------------------------------- comptage local par instance */

type Pending = { bucket: string; windowTag: string; count: number };
const pending = new Map<string, Pending>();
const FLUSH_EVERY = (() => {
  const raw = Number(process.env.QUOTA_FLUSH_EVERY);
  return Number.isInteger(raw) && raw >= 1 && raw <= 1000 ? raw : 20;
})();

/**
 * Compte une opération. Renvoie `false` si le budget dur est déjà atteint dans
 * la fenêtre courante en mémoire — l'appelant doit alors refuser l'opération.
 * N'effectue aucune requête base : le vidage se fait par lots.
 */
export function countOp(name: keyof typeof DEFAULT_BUDGETS, units = 1, now = Date.now()): boolean {
  const budget = budgetFor(name);
  const windowTag = windowTagFor(budget.period, now);
  const key = `${name}:${windowTag}`;
  const entry = pending.get(key) ?? { bucket: name, windowTag, count: 0 };
  const allowed = !budget.hard || entry.count + units <= budget.limit;
  entry.count += units;
  pending.set(key, entry);
  return allowed;
}

/**
 * Réinitialise les compteurs en mémoire de l'instance. Utile aux tests et après
 * un changement volontaire de budget ; n'efface jamais l'historique en base.
 */
export function resetLocalCounters(): void {
  pending.clear();
}

export function pendingTotals(): { bucket: string; windowTag: string; count: number }[] {
  return [...pending.values()].map((entry) => ({ ...entry }));
}

/** Écrit les compteurs accumulés (une seule écriture par lot). Ne lève jamais. */
export async function flushCounters(db: Db, now = Date.now()): Promise<void> {
  if (pending.size === 0) return;
  const batch = [...pending.values()];
  pending.clear();
  try {
    await db.batch(
      batch.map((entry) => ({
        sql: `INSERT INTO ops_counters(bucket, window_tag, count, updated_at_ms) VALUES (?, ?, ?, ?)
              ON CONFLICT(bucket) DO UPDATE SET
                count = CASE WHEN ops_counters.window_tag = excluded.window_tag
                             THEN ops_counters.count + excluded.count ELSE excluded.count END,
                window_tag = excluded.window_tag,
                updated_at_ms = excluded.updated_at_ms`,
        args: [entry.bucket, entry.windowTag, entry.count, now],
      })),
      'write'
    );
  } catch {
    // Un compteur perdu ne doit jamais casser une requête étudiante : la
    // protection reste assurée par les plafonds locaux et la supervision.
  }
}

/** Enregistre un événement coûteux (jamais de contenu personnel). Ne lève jamais. */
export async function recordOpEvent(
  db: Db,
  kind: 'kdf_hash' | 'kdf_verify' | 'email_sent' | 'email_refused',
  now = Date.now()
): Promise<void> {
  try {
    await db.execute({
      sql: 'INSERT INTO ops_events(kind, window_tag, occurred_at_ms) VALUES (?, ?, ?)',
      args: [kind, windowTagFor('day', now), now],
    });
  } catch {
    /* journalisation best-effort */
  }
}

/* ------------------------------------------------------------- état agrégé */

export type QuotaLine = {
  bucket: string;
  windowTag: string;
  used: number;
  limit: number;
  verdict: QuotaVerdict;
  period: 'day' | 'month';
};

/** Consommation enregistrée, comparée aux budgets gratuits. Aucune écriture. */
export async function quotaSnapshot(db: Db, now = Date.now()): Promise<QuotaLine[]> {
  const lines: QuotaLine[] = [];
  for (const name of Object.keys(DEFAULT_BUDGETS)) {
    const budget = budgetFor(name);
    const windowTag = windowTagFor(budget.period, now);
    let used = 0;
    try {
      const result = await db.execute({
        sql: 'SELECT count FROM ops_counters WHERE bucket = ? AND window_tag = ?',
        args: [name, windowTag],
      });
      used = Number(result.rows[0]?.count ?? 0) || 0;
    } catch {
      used = 0;
    }
    lines.push({
      bucket: name,
      windowTag,
      used,
      limit: budget.limit,
      verdict: verdictFor(used, budget.limit),
      period: budget.period,
    });
  }
  return lines;
}

/* ------------------------------------------- comptage des requêtes dynamiques */

let sinceFlush = 0;

/**
 * À appeler une fois par requête dynamique servie (les assets statiques sont
 * gratuits et illimités chez Cloudflare : ils ne sont donc PAS comptés).
 * Le vidage en base se fait par lots de `QUOTA_FLUSH_EVERY`, ce qui revient à
 * ~1 écriture Turso pour 20 requêtes : le quota d'écritures est protégé.
 */
export async function trackDynamicRequest(db?: Db, now = Date.now()): Promise<boolean> {
  const allowed = countOp('worker.requests', 1, now);
  sinceFlush += 1;
  if (db && (sinceFlush >= FLUSH_EVERY || !allowed)) {
    sinceFlush = 0;
    await flushCounters(db, now);
  }
  return allowed;
}

/** Écrit compteurs et journal avant une réponse de diagnostic (jamais bloquant). */
export async function trackKdfOperation(
  db: Db,
  kind: 'kdf_hash' | 'kdf_verify',
  now = Date.now()
): Promise<void> {
  await recordOpEvent(db, kind, now);
}
