import { checkTursoConnection, currentEnvironment } from '@/lib/server/turso';
import { DEFAULT_PBKDF2_ITERATIONS, pbkdf2Iterations } from '@/lib/server/auth-core';
import { mailerConfigured } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

function reply(body: object, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function authorized(header: string | null, secret: string) {
  const enc = new TextEncoder();
  const left = enc.encode(header || '');
  const right = enc.encode(`Bearer ${secret}`);
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++)
    difference |= (left[i] || 0) ^ (right[i] || 0);
  return difference === 0;
}

/**
 * Diagnostic manuel protégé : aucune table applicative lue, aucune écriture.
 * Rapporte aussi la configuration d'authentification (jamais de secret).
 */
export async function GET(request: Request) {
  const secret = process.env.APP_DIAGNOSTIC_TOKEN;
  if (!secret || secret.length < 32) return reply({ error: 'not_ready' }, 503);
  if (!authorized(request.headers.get('authorization'), secret))
    return reply({ error: 'unauthorized' }, 401);

  let kdf: { iterations: number | null; target: number; policy: 'ok' | 'below_target' | 'invalid' } = {
    iterations: null,
    target: DEFAULT_PBKDF2_ITERATIONS,
    policy: 'invalid',
  };
  try {
    const iterations = pbkdf2Iterations();
    kdf = {
      iterations,
      target: DEFAULT_PBKDF2_ITERATIONS,
      policy: iterations >= DEFAULT_PBKDF2_ITERATIONS ? 'ok' : 'below_target',
    };
  } catch {
    kdf = { iterations: null, target: DEFAULT_PBKDF2_ITERATIONS, policy: 'invalid' };
  }

  try {
    await checkTursoConnection();
    return reply(
      {
        provider: 'turso',
        environment: currentEnvironment(),
        status: 'ok',
        auth: { kdf, emailDelivery: mailerConfigured() ? 'configured' : 'not_configured' },
      },
      200
    );
  } catch {
    return reply({ provider: 'turso', environment: process.env.APP_ENV, status: 'unavailable' }, 503);
  }
}
