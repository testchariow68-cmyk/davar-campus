/* COUCHE 1 — Authentification furtive Zero-Trust (Cloudflare Access + Tunnel, aucun VPS)
   Règle 1 : aucune confiance implicite. Toute requête vers l'API passe par ce middleware.
   PÉRIMÈTRE (CAPACITY.md) : Access est RÉSERVÉ AU STAFF (gratuit = 50 users max).
   Les étudiants s'authentifient via JWT maison + credentials SSI (couche 5) + Turnstile,
   sinon 3 000 étudiants coûteraient 21 000 $/mois. */

export function decodeJwt(assertion) {
  const parts = String(assertion || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return { header: JSON.parse(atob(b64)), payload: JSON.parse(atob(b64)), signature: parts[2] };
  } catch { return null; }
}

/* Vérification des claims du JWT Cloudflare Access — pure, testable */
export function checkAccessClaims(payload, { now = Date.now(), audience, allowedDomains } = {}) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'claim manquant' };
  if (payload.exp && payload.exp * 1000 <= now) return { ok: false, reason: 'jwt expiré' };
  if (audience && (!payload.aud || ![].concat(audience).includes(payload.aud))) return { ok: false, reason: 'audience invalide' };
  if (payload.type && payload.type !== 'app') return { ok: false, reason: 'type de jwt inattendu' };
  const email = payload.email || '';
  if (allowedDomains && allowedDomains.length) {
    const dom = email.split('@')[1] || '';
    if (!allowedDomains.includes(dom)) return { ok: false, reason: 'domaine non autorisé' };
  }
  return { ok: true, identity: { email, sub: payload.sub } };
}

/* Vérification de signature RS256 via JWKS Cloudflare (WebCrypto, Workers) */
export async function verifySignature(assertion, jwks, cryptoImpl = globalThis.crypto) {
  const dec = decodeJwt(assertion);
  if (!dec) return false;
  const key = (jwks.keys || []).find(k => k.kid === dec.header.kid);
  if (!key) return false;
  const pub = await cryptoImpl.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const [h, p, s] = assertion.split('.');
  const data = new TextEncoder().encode(h + '.' + p);
  const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return cryptoImpl.subtle.verify('RSASSA-PKCS1-v1_5', pub, sig, data);
}

export default {
  async fetch(req, env) {
    const assertion = req.headers.get('cf-access-jwt-assertion');
    if (!assertion) return new Response('{"error":"accès refusé"}', { status: 403 });
    const jwks = await env.ACCESS_JWKS();               /* https://<team>.cloudflareaccess.com/cdn-cgi/access/certs */
    if (!(await verifySignature(assertion, jwks))) return new Response('{"error":"signature invalide"}', { status: 403 });
    const claims = checkAccessClaims(decodeJwt(assertion).payload, { audience: env.ACCESS_AUD, allowedDomains: env.ACCESS_DOMAINS });
    if (!claims.ok) return new Response(JSON.stringify({ error: claims.reason }), { status: 403 });
    return env.ORIGIN.fetch(req);                       /* tunnel interne, invisible de l'extérieur */
  }
};
