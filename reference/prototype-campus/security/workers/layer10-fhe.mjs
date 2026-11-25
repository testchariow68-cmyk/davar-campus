/* COUCHE 10 — Cryptographie homomorphe : traitement SANS déchiffrement.
   Livré : homomorphie additive réelle (Paillier, BigInt) pour les agrégats sensibles
   (ex. somme de scores de confiance sans jamais déchiffrer chaque score).
   Au déploiement : ComputeFHE compilé WASM dans Workers pour circuits complets (slot pqFhe). */

const B = BigInt;
export function modpow(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
function egcd(a, b) { if (b === 0n) return [1n, 0n, a]; const [x, y, g] = egcd(b, a % b); return [y, x - (a / b) * y, g]; }
export function modinv(a, m) { const [x, , g] = egcd(((a % m) + m) % m, m); if (g !== 1n) throw new Error('non inversible'); return ((x % m) + m) % m; }
function randBits(cryptoImpl, bits) { const u8 = new Uint8Array(Math.ceil(bits / 8)); cryptoImpl.getRandomValues(u8); let n = 0n; for (const b of u8) n = (n << 8n) | B(b); return n | 1n | (1n << B(bits - 1)); }
function isPrime(n, cryptoImpl, k = 24) {
  if (n < 2n) return false; for (const p of [2n, 3n, 5n, 7n, 11n, 13n]) { if (n === p) return true; if (n % p === 0n) return false; }
  let d = n - 1n, r = 0n; while ((d & 1n) === 0n) { d >>= 1n; r++; }
  outer: for (let i = 0; i < k; i++) {
    let a = 2n + (randBits(cryptoImpl, 16) % (n - 3n));
    let x = modpow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let j = 0n; j < r - 1n; j++) { x = x * x % n; if (x === n - 1n) continue outer; }
    return false;
  }
  return true;
}
function prime(bits, cryptoImpl) { let c = randBits(cryptoImpl, bits) | 1n; while (!isPrime(c, cryptoImpl)) c += 2n; return c; }

export function keygen(bits = 512, cryptoImpl = globalThis.crypto) {
  const p = prime(bits, cryptoImpl), q = prime(bits, cryptoImpl);
  const n = p * q, n2 = n * n, lambda = (p - 1n) * (q - 1n) / gcd(p - 1n, q - 1n);   /* lcm(p-1, q-1) */
  const g = n + 1n;
  const mu = modinv((modpow(g, lambda, n2) - 1n) / n, n);
  return { pub: { n, n2, g }, priv: { lambda, mu, n, n2 } };
}
function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
const L = (x, n) => (x - 1n) / n;

export function encrypt(m, pub, cryptoImpl = globalThis.crypto) {
  const r = 2n + (randBits(cryptoImpl, 256) % (pub.n - 2n));
  return (modpow(pub.g, B(m), pub.n2) * modpow(r, pub.n, pub.n2)) % pub.n2;
}
export function decrypt(c, priv) { return L(modpow(c, priv.lambda, priv.n2), priv.n) * priv.mu % priv.n; }
/* opérations HOMOMORPHES : jamais de déchiffrement intermédiaire */
export const cAdd = (c1, c2, pub) => (c1 * c2) % pub.n2;
export const cAddPlain = (c, m, pub) => (c * modpow(pub.g, B(m), pub.n2)) % pub.n2;

export default {
  async fetch(req, env) {   /* agrégat chiffré côté serveur : somme de scores sans déchiffrement */
    const { values } = await req.json();
    const pub = env.FHE_PUB;
    const sum = values.reduce((acc, v) => cAdd(acc, v, pub), 1n);   /* 1n = chiffré de 0 */
    return new Response(JSON.stringify({ encryptedSum: sum.toString() }), { status: 200 });
  }
};
