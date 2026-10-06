// https://chariow.dev/en/guides/pulse-security : HMAC-SHA256 du corps brut,
// secret propre au Pulse (whsec_), aucun horodatage dans la signature.
export async function verifyPulseSignature(rawBytes: Uint8Array, received: string | null, secret: string): Promise<boolean> {
  if (!received || !/^sha256=[0-9a-f]{64}$/.test(received) || !secret.startsWith('whsec_')) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const message = new Uint8Array(new ArrayBuffer(rawBytes.byteLength));
  message.set(rawBytes);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC',key,message));
  const expected = 'sha256=' + [...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
  // Les deux chaînes ont déjà la même taille ; éviter les comparaisons précoces.
  const a=encoder.encode(received), b=encoder.encode(expected);
  let difference=0;
  for (let i=0;i<a.length;i++) difference|=a[i]^b[i];
  return difference===0;
}
