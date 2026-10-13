/* VIDÉOS R2 — URLs signées HMAC-SHA256 (expiration courte, revocabiles).
   R2 n'a pas de signatures natives : le Worker vidéo vérifie le HMAC puis streame
   avec Range passthrough. SHA-256/HMAC en JS pur synchrone (navigateur + Workers + Node),
   validé contre node:crypto dans tests/smoke51.js. */

/* ---- SHA-256 pur (sync) ---- */
const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const rotr = (x, n) => (x >>> n) | (x << (32 - n));
export function sha256(bytes) {
  const u8 = new Uint8Array(bytes);
  const l = u8.length, bitLen = l * 8;
  const padded = new Uint8Array(((l + 8) >> 6 << 6) + 64);
  padded.set(u8); padded[l] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0); dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const w = new Int32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getInt32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t-15],7) ^ rotr(w[t-15],18) ^ (w[t-15] >>> 3);
      const s1 = rotr(w[t-2],17) ^ rotr(w[t-2],19) ^ (w[t-2] >>> 10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0; h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer);
  [h0,h1,h2,h3,h4,h5,h6,h7].forEach((h, i) => ov.setInt32(i*4, h));
  return out;
}
export function hmacSha256(keyBytes, msgBytes) {
  let key = new Uint8Array(keyBytes);
  if (key.length > 64) key = sha256(key);
  const ipad = new Uint8Array(64 + msgBytes.length), opad = new Uint8Array(64 + 32);
  ipad.fill(0x36); opad.fill(0x5c);
  for (let i = 0; i < 64; i++) { const k = key[i] || 0; ipad[i] ^= k; opad[i] ^= k; }
  ipad.set(msgBytes, 64);
  const inner = sha256(ipad);
  opad.set(inner, 64);
  return sha256(opad);
}
const hex = u8 => Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
const te = s => new TextEncoder().encode(s);

/* ---- URLs signées ---- */
export const VIDEO_TTL_MS = 60 * 60 * 1000;   /* 1 h */
export function signVideoUrl(key, { secret, now = Date.now(), ttl = VIDEO_TTL_MS } = {}) {
  const exp = now + ttl;
  const sig = hex(hmacSha256(te(secret), te(key + '|' + exp)));
  return '/v/' + encodeURIComponent(key) + '?exp=' + exp + '&sig=' + sig;
}
export function verifyVideoUrl(path, { secret, now = Date.now() } = {}) {
  const m = String(path || '').match(/^\/v\/([^?]+)\?(.*)$/);
  if (!m) return { ok: false, reason: 'url invalide' };
  const key = decodeURIComponent(m[1]);
  const q = new URLSearchParams(m[2]);
  const exp = parseInt(q.get('exp') || '0', 10);
  if (!exp || exp <= now) return { ok: false, reason: 'lien expiré' };
  const sig = hex(hmacSha256(te(secret), te(key + '|' + exp)));
  if (sig !== q.get('sig')) return { ok: false, reason: 'signature invalide' };
  return { ok: true, key };
}

export default {
  async fetch(req, env) {   /* Worker vidéo : vérifie puis streame R2 (Range passthrough) */
    const url = new URL(req.url);
    const v = verifyVideoUrl(url.pathname + url.search, { secret: env.VIDEO_SECRET });
    if (!v.ok) return new Response(JSON.stringify({ error: v.reason }), { status: 403 });
    const r2 = env.VIDEOS;   /* binding R2 */
    const range = req.headers.get('range');
    const obj = await r2.get(v.key, { range: range || undefined });
    if (!obj) return new Response('introuvable', { status: 404 });
    return new Response(obj.body, { status: range ? 206 : 200, headers: { 'accept-ranges': 'bytes', 'content-type': obj.httpMetadata?.contentType || 'video/mp4' } });
  }
};
