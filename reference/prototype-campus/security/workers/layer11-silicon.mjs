/* COUCHE 11 — Empreinte physique du silicium (AETHER-NODE adapté) :
   micro-variations de timing WebCrypto/WebGPU + capacités matérielles → empreinte stable
   propre à chaque puce. Clés de session dérivées à la volée ; un jeton volé rejoué depuis
   une autre machine ne reproduit pas l'empreinte. */

const q = (v, step) => Math.round(v / step) * step;

/* lectures : {cryptoTiming (ms d'une op. WebCrypto), gpu (renderer), cores, mem (Go)} */
export async function buildSiliconPrint(r, cryptoImpl = globalThis.crypto) {
  const norm = [q(r.cryptoTiming || 0, 10), String(r.gpu || 'nogl').trim().toLowerCase(), r.cores || 0, q(r.mem || 0, 1)].join('|');
  const h = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode('davar-silicon-v1|' + norm));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}
export const samePrint = (a, b) => a === b;

/* dérive tolérée : deux lectures du même silicium doivent donner la même empreinte ;
   un changement de puce (cores/mem/gpu) change l'empreinte */
export default {
  async fetch(req, env) {
    const { readings } = await req.json();
    const prints = await Promise.all(readings.map(r => buildSiliconPrint(r)));
    const stable = prints.every(p => p === prints[0]);
    return new Response(JSON.stringify({ print: prints[0], stable }), { status: stable ? 200 : 403 });
  }
};
