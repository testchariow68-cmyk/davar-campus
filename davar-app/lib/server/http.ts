/**
 * Garde-fous HTTP — SERVEUR UNIQUEMENT, sans dépendance à Next ni à la base.
 * Ce module est volontairement autonome pour être testable directement
 * (`npm test`) et réutilisable sous Node comme sous Workers.
 */

export function isDevelopment(): boolean {
  const env = process.env.APP_ENV;
  if (env === 'development' || env === 'staging' || env === 'production') return env === 'development';
  return process.env.NODE_ENV !== 'production';
}

export function jsonNoStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Refuse toute requête modifiante dont l'origine déclarée ne correspond pas à
 * l'hôte servi (protection CSRF, en complément du cookie SameSite=Lax).
 * L'absence d'en-tête Origin est un refus.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const candidates = [request.headers.get('host'), request.headers.get('x-forwarded-host')]
    .flatMap((value) => (value ? value.split(',') : []))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (candidates.includes(originHost)) return true;
  // Aperçu de développement : l'hôte transmis peut être réécrit par le proxy.
  // Tolérance strictement limitée au développement, jamais en staging/production.
  return isDevelopment() && originHost.endsWith('.e2b.app');
}

export function clientIp(request: Request): string {
  const direct = request.headers.get('cf-connecting-ip');
  if (direct) return direct.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

/**
 * Origine à utiliser dans les liens envoyés par e-mail. Hors développement,
 * `APP_PUBLIC_ORIGIN` est obligatoire : sans elle, l'appelant doit échouer en
 * mode fermé plutôt que de fabriquer un lien approximatif.
 */
export function linkOrigin(request: Request): string | null {
  const configured = publicOrigin();
  if (configured) return configured;
  if (!isDevelopment()) return null;
  const declared = request.headers.get('origin');
  if (declared) {
    try {
      const url = new URL(declared);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      /* origine illisible : on retombe sur l'URL de la requête */
    }
  }
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

/** Origine publique configurée pour les liens d'e-mail (jamais déduite du client). */
export function publicOrigin(): string | null {
  const configured = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!isDevelopment() && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Corps JSON borné (1 Mio max) ; renvoie null si absent, trop gros ou invalide. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 1_048_576) return null;
  try {
    const raw = await request.text();
    if (!raw || raw.length > 1_048_576) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
