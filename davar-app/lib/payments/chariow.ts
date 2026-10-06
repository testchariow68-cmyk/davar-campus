/** ARCHIVE HISTORIQUE — NON UTILISÉE PAR LE WEBHOOK ACTIF.
 * Ne pas utiliser ces mappings démo pour attribuer un droit ; voir
 * chariow-signature.ts, chariow-validate.ts, lib/server/chariow-ledger.ts.
 * Intégration Chariow (paiement principal).
 * Documentation : https://chariow.dev — Pulses = webhooks signés.
 *
 * Contrat Pulse (vente réussie) :
 *  - Headers : x-chariow-signature (sha256=HMAC-SHA256(corps brut, whsec_…)),
 *              x-pulse-id, x-pulse-delivery-id (clé d'idempotence), x-pulse-event.
 *  - Corps : JSON compact { event, sale, product, customer, store, checkout }.
 *  - Le secret de signature est propre à chaque Pulse (≠ clé API) :
 *    Chariow → Automatisations → Pulses → votre Pulse → Aperçu → Secret de signature.
 */
import { TRAININGS, type Training } from "@/lib/trainings";

export const CHAROW_API_BASE = "https://api.chariow.com/v1";

/**
 * Vérifie la signature d'un Pulse. Toujours sur le corps BRUT (jamais resérialisé).
 * Implémentation Web Crypto (crypto.subtle) : portable Vercel (Node/Edge)
 * ET Cloudflare Workers — aucun verrou d'hébergeur.
 */
export async function verifyPulseSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expected =
    "sha256=" +
    [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  /* Comparaison en temps constant (sans timingSafeEqual, absent du Web Crypto). */
  const a = enc.encode(signatureHeader);
  const b = enc.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Extrait l'id produit Chariow (prd_…) d'un lien de checkout. */
export function productIdFromCheckoutUrl(url: string | undefined): string | null {
  const m = url?.match(/\/(prd_[a-z0-9]+)\//i);
  return m ? m[1] : null;
}

/** Retrouve la formation correspondant à un produit Chariow. */
export function trainingFromProductId(productId: string | undefined): Training | null {
  if (!productId) return null;
  return (
    TRAININGS.find((t) => productIdFromCheckoutUrl(t.chariowUrl) === productId) ?? null
  );
}

/** Appel API Chariow (clé API Bearer) — vérification serveur côté boutique. */
export async function chariowApi<T>(path: string): Promise<T> {
  const key = process.env.CHARIOW_API_KEY;
  if (!key) throw new Error("CHARIOW_API_KEY manquante");
  const res = await fetch(`${CHAROW_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Chariow API ${res.status} : ${await res.text()}`);
  return (await res.json()) as T;
}

/** Types du payload Pulse « successful.sale ». */
export interface PulseSalePayload {
  event: string;
  note?: string; // présent uniquement sur les pulses de test
  sale: {
    id: string;
    status: string;
    amount: { value: number; currency: string; formatted: string };
    custom_metadata?: Record<string, string> | null;
    completed_at?: string | null;
  };
  product: { id: string; name: string; url: string; price: { value: number; currency: string } };
  customer: { id: string; name: string; email: string; phone?: string; country?: string };
  store: { id: string; name: string; url: string };
  checkout: { url: string };
}
