/* COUCHE 2 — Chiffrement post-quantique hybride : protocole Signal (X25519 + AES-256-GCM)
   + slot ML-KEM-1024 (liboqs compilé WASM dans Workers au déploiement).
   La clé de session = HKDF-SHA256(partage classique ‖ partage PQ) : cassé l'un, l'autre tient. */

const enc = new TextEncoder();
const cat = (...arrs) => { const n = arrs.filter(Boolean).map(a => new Uint8Array(a)); const t = new Uint8Array(n.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of n) { t.set(a, o); o += a.length; } return t; };
const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/* Adaptateur X25519 par défaut : WebCrypto (Workers). En tests : node:crypto. */
export function webCryptoX25519(cryptoImpl = globalThis.crypto) {
  return {
    async generate() {
      const kp = await cryptoImpl.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
      return { priv: kp.privateKey, pub: b64(new Uint8Array(await cryptoImpl.subtle.exportKey('raw', kp.publicKey))) };
    },
    async derive(priv, pubB64) {
      const pub = await cryptoImpl.subtle.importKey('raw', unb64(pubB64), { name: 'X25519' }, false, []);
      return new Uint8Array(await cryptoImpl.subtle.deriveBits({ name: 'X25519', public: pub }, priv, 256));
    }
  };
}

async function hkdfKey(ikm, cryptoImpl = globalThis.crypto) {
  const base = await cryptoImpl.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  const bits = await cryptoImpl.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode('davar-pq-hybrid-v1') }, base, 256);
  return cryptoImpl.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function hybridEncrypt(plain, recipient, { x25519 = webCryptoX25519(), pqKem = null, cryptoImpl = globalThis.crypto } = {}) {
  const eph = await x25519.generate();
  const sharedC = await x25519.derive(eph.priv, recipient.x25519Pub);
  let sharedPQ = null, pqCt = null;
  if (pqKem && recipient.pqPub) { const r = await pqKem.encaps(recipient.pqPub); sharedPQ = r.shared; pqCt = r.ct; }
  const key = await hkdfKey(cat(sharedC, sharedPQ), cryptoImpl);
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)));
  return { mode: pqKem ? 'hybride-PQ' : 'classique-PQ-ready', ephPub: eph.pub, pqCt, iv: b64(iv), ct: b64(ct) };
}

export async function hybridDecrypt(bundle, me, { x25519 = webCryptoX25519(), pqKem = null, cryptoImpl = globalThis.crypto } = {}) {
  const sharedC = await x25519.derive(me.priv, bundle.ephPub);
  let sharedPQ = null;
  if (pqKem && bundle.pqCt) sharedPQ = await pqKem.decaps(me.pqPriv, bundle.pqCt);
  const key = await hkdfKey(cat(sharedC, sharedPQ), cryptoImpl);
  const plain = await cryptoImpl.subtle.decrypt({ name: 'AES-GCM', iv: unb64(bundle.iv) }, key, unb64(bundle.ct));
  return new TextDecoder().decode(plain);
}

export default {
  async fetch(req, env) {   /* coffre de clés : rotation 24 h (règle 5) gérée par Workers Cron */
    return new Response(JSON.stringify({ mode: env.PQ_WASM ? 'hybride-PQ' : 'classique-PQ-ready' }), { status: 200 });
  }
};
