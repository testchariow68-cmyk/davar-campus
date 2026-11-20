import { isDevelopment } from '@/lib/server/http';
import { kdfStatus } from '@/lib/server/password-service';
import { emailBudget } from '@/lib/server/mailer';
import { flushCounters, quotaSnapshot, trackDynamicRequest } from '@/lib/server/quota';
import { currentEnvironment, openDb } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';

function authorized(header: string | null, secret: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(header || '');
  const right = encoder.encode(`Bearer ${secret}`);
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++)
    difference |= (left[i] || 0) ^ (right[i] || 0);
  return difference === 0;
}

/**
 * Diagnostic de quota protégé par APP_DIAGNOSTIC_TOKEN : expose la consommation
 * mesurée face aux budgets des offres gratuites. Aucune donnée personnelle,
 * aucun secret (ni jeton, ni URL de service) n'apparaît dans la réponse.
 */
export async function GET(request: Request) {
  const secret = process.env.APP_DIAGNOSTIC_TOKEN;
  if (!secret || secret.length < 32)
    return Response.json({ error: 'not_ready' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (!authorized(request.headers.get('authorization'), secret))
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  try {
    const db = await openDb();
    await trackDynamicRequest(db);
    await flushCounters(db);
    const lines = await quotaSnapshot(db);
    const environment = currentEnvironment();
    return Response.json(
      {
        environment,
        // Les parts de quota consommées servent de tableau de bord opérateur.
        quotas: lines,
        alerts: lines.filter((line) => line.verdict !== 'ok').map((line) => ({ bucket: line.bucket, verdict: line.verdict })),
        auth: { kdf: kdfStatus() },
        email: emailBudget(),
        devPreview: isDevelopment() ? ['http://localhost:3000'] : [],
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
