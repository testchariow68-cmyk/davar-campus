import {verifyPulseSignature} from '@/lib/payments/chariow-signature';
import {matchVerifiedChariowSale} from '@/lib/payments/chariow-validate';
import {recordVerifiedChariowSale} from '@/lib/server/chariow-ledger';

export const dynamic = 'force-dynamic';
const reply=(code:number)=>Response.json({ok:code===200},{status:code,headers:{'Cache-Control':'no-store'}});

async function readBounded(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const reader=request.body?.getReader();
  if (!reader) return null;
  const chunks:Uint8Array[]=[];
  let length=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if (done) break;
      length+=value.byteLength;
      if (length>maxBytes) {await reader.cancel(); return null;}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  if (!length) return null;
  const bytes=new Uint8Array(length);
  let offset=0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

/** Désactivé par défaut. Ne configurer le Pulse marchand qu'après tests Turso
 * staging et revue de la configuration ; aucune 2xx avant écriture durable.
 */
export async function POST(request: Request) {
  if (process.env.CHARIOW_ENABLE_PULSE!=='true') return reply(503);
  const secret=process.env.CHARIOW_PULSE_SECRET;
  const pulseId=process.env.CHARIOW_PULSE_ID;
  const apiKey=process.env.CHARIOW_API_KEY;
  const storeId=process.env.CHARIOW_STORE_ID;
  if (!secret?.startsWith('whsec_') || !pulseId?.startsWith('pulse_') ||
      !apiKey?.startsWith('sk_') || !storeId?.startsWith('str_')) return reply(503);
  if (request.headers.get('x-pulse-id')!==pulseId ||
      request.headers.get('x-pulse-event')!=='successful.sale') return reply(401);
  const deliveryId=request.headers.get('x-pulse-delivery-id');
  // Pulse d'essai Chariow = pas d'ID livraison ; il ne crée jamais de droits.
  if (!deliveryId || !/^[a-zA-Z0-9_-]{4,160}$/.test(deliveryId)) return reply(401);
  let raw:Uint8Array;
  try {
    if (Number(request.headers.get('content-length'))>65536) return reply(413);
    const bounded=await readBounded(request,65536);
    if (!bounded) return reply(413);
    raw=bounded;
    if (!await verifyPulseSignature(raw,request.headers.get('x-chariow-signature'),secret)) return reply(401);
  } catch {return reply(503);}
  let pulse:unknown;
  try {pulse=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch {return reply(422);}
  const saleId=(pulse && typeof pulse==='object' && 'sale' in pulse &&
    pulse.sale && typeof pulse.sale==='object' && 'id' in pulse.sale) ? pulse.sale.id : null;
  if (typeof saleId!=='string' || !/^sal_[a-zA-Z0-9_-]{3,100}$/.test(saleId)) return reply(422);
  try {
    const response=await fetch(`https://api.chariow.com/v1/sales/${encodeURIComponent(saleId)}`,{
      headers:{Authorization:`Bearer ${apiKey}`},cache:'no-store',signal:AbortSignal.timeout(6000)});
    if (!response.ok) return reply(503);
    const apiResponse=await response.json();
    // Contrat GET Sale : {data: SaleResource}, jamais l'objet Pulse seul.
    const apiSale=(apiResponse && typeof apiResponse==='object' && 'data' in apiResponse) ? apiResponse.data : null;
    const sale=matchVerifiedChariowSale(pulse,apiSale,storeId);
    if (!sale || sale.saleId!==saleId) return reply(503);
    await recordVerifiedChariowSale(sale,deliveryId);
    return reply(200);
  } catch {return reply(503);}
}
