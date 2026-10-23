/* COUCHE 5 — Identité auto-souveraine (SSI) : W3C DID + Verifiable Credentials.
  ACA-Py remplacé par une implémentation WebCrypto Ed25519 native (Workers + navigateur, aucun VPS).
   Les credentials vivent dans IndexedDB côté client ; le serveur ne garde que la clé publique DID. */

export const DID_METHOD = 'did:davar';

export function didFromPublicKey(pubB64) { return DID_METHOD + ':' + pubB64; }

/* Adaptateur crypto injectable (WebCrypto en production, node:crypto en tests) */
export function webCryptoEd25519(cryptoImpl = globalThis.crypto) {
  return {
    async generate() {
      const kp = await cryptoImpl.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
      const pub = new Uint8Array(await cryptoImpl.subtle.exportKey('raw', kp.publicKey));
      return { sign: d => cryptoImpl.subtle.sign('Ed25519', kp.privateKey, d), publicKey: btoa(String.fromCharCode(...pub)) };
    },
    async verify(pubB64, data, sig) {
      const raw = Uint8Array.from(atob(pubB64), c => c.charCodeAt(0));
      const pub = await cryptoImpl.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
      return cryptoImpl.subtle.verify('Ed25519', pub, sig, data);
    }
  };
}

/* Émission d'un Verifiable Credential signé (ex. « étudiant certifié », « rôle coach ») */
export async function issueCredential(signer, issuerDid, subjectDid, claims, now = Date.now(), ttlMs = 365 * 86400000) {
  const vc = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential'],
    issuer: issuerDid,
    issuanceDate: new Date(now).toISOString(),
    expirationDate: new Date(now + ttlMs).toISOString(),
    credentialSubject: { id: subjectDid, ...claims }
  };
  const bytes = new TextEncoder().encode(JSON.stringify(vc));
  const sig = await signer.sign(bytes);
  return { vc, proof: { type: 'Ed25519Signature2020', proofValue: btoa(String.fromCharCode(...new Uint8Array(sig))) } };
}

export async function verifyCredential(doc, verifier, now = Date.now()) {
  const { vc, proof } = doc;
  if (!vc || !proof) return { ok: false, reason: 'document incomplet' };
  if (vc.expirationDate && new Date(vc.expirationDate).getTime() <= now) return { ok: false, reason: 'credential expiré' };
  const pubB64 = String(vc.issuer).split(':').pop();
  const sig = Uint8Array.from(atob(proof.proofValue), c => c.charCodeAt(0));
  const ok = await verifier.verify(pubB64, new TextEncoder().encode(JSON.stringify(vc)), sig);
  return ok ? { ok: true } : { ok: false, reason: 'signature invalide' };
}

export default {
  async fetch(req, env) {
    if (req.method === 'POST') {                      /* émission réservée à l'admin via couche 1 */ }
    if (req.method === 'GET') {                       /* résolution publique d'un DID */ }
    return new Response('SSI endpoint', { status: 200 });
  }
};
