/* RÈGLE 4 — Journalisation immuable : hash chain SHA-256 dans Turso (security_events).
   Chaque ligne pointe la précédente ; toute altération casse la chaîne. */

const hex = u8 => Array.from(new Uint8Array(u8)).map(b => b.toString(16).padStart(2, '0')).join('');
const GENESIS = '0'.repeat(64);

const locks = new WeakMap();   /* append sérialisé par journal : jamais deux prev identiques */
export function auditAppend(rows, type, details, now = Date.now(), cryptoImpl = globalThis.crypto) {
  const prevP = locks.get(rows) || Promise.resolve();
  const p = prevP.then(async () => {
    const prev = rows.length ? rows[rows.length - 1].hash : GENESIS;
    const payload = JSON.stringify({ type, details, prev, at: now });
    const hash = hex(await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(payload)));
    const row = { event_type: type, payload, hash, created_at: now };
    rows.push(row);
    return row;
  });
  locks.set(rows, p.catch(() => {}));
  return p;
}

export async function verifyChain(rows, cryptoImpl = globalThis.crypto) {
  let prev = GENESIS;
  for (const row of rows) {
    const p = JSON.parse(row.payload);
    if (p.prev !== prev) return { ok: false, reason: 'chaîne rompue (prev)' };
    const h = hex(await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(row.payload)));
    if (h !== row.hash) return { ok: false, reason: 'hash modifié (contenu)' };
    prev = row.hash;
  }
  return { ok: true };
}
