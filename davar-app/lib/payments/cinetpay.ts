/**
 * Couche CinetPay (agrégateur sans abonnement).
 * Mobile money Afrique + cartes Visa/Mastercard (Europe & international).
 * Les frais sont supportés par l'étudiant : le montant envoyé inclut les frais.
 *
 * Sandbox : créez un compte sur https://web.cinetpay.com — les clés de test
 * sont fournies dans le dashboard (mode TEST).
 */
const BASE =
  process.env.CINETPAY_BASE_URL || "https://api-checkout.cinetpay.com/v2";

export function cinetpayConfigured() {
  return !!(process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID);
}

export interface PaymentRequest {
  amount: number; // FCFA, frais inclus
  currency?: "XOF" | "EUR" | "USD";
  description: string;
  customer: { id: string; name?: string; surname?: string; email?: string };
  metadata?: string;
  notify_url: string;
  return_url: string;
}

/** Crée un paiement et retourne l'URL de checkout CinetPay. */
export async function createCinetPayPayment(opts: PaymentRequest) {
  const apikey = process.env.CINETPAY_API_KEY;
  const site_id = process.env.CINETPAY_SITE_ID;
  if (!apikey || !site_id)
    throw new Error(
      "CINETPAY_API_KEY / CINETPAY_SITE_ID manquantes (.env.local)"
    );

  const body = new URLSearchParams({
    apikey,
    site_id,
    amount: String(opts.amount),
    currency: opts.currency || "XOF",
    description: opts.description,
    customer_id: opts.customer.id.slice(0, 36),
    customer_email: opts.customer.email || "",
    customer_name: opts.customer.name || "",
    customer_surname: opts.customer.surname || "",
    notify_url: opts.notify_url,
    return_url: opts.return_url,
    metadata: opts.metadata || "",
    lang: "fr",
  });

  const res = await fetch(`${BASE}/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await res.json();
  if (json.code !== "0")
    throw new Error(`CinetPay : ${json.message || "erreur inconnue"}`);
  return json as {
    code: string;
    message: string;
    data: { payment_url: string; cpm_trans_id: string };
  };
}

/** Vérifie le statut d'une transaction (source de vérité pour le webhook). */
export async function checkPaymentStatus(cpm_trans_id: string) {
  const apikey = process.env.CINETPAY_API_KEY;
  const site_id = process.env.CINETPAY_SITE_ID;
  if (!apikey || !site_id) throw new Error("CinetPay non configuré");
  const body = new URLSearchParams({ apikey, site_id, cpm_trans_id });
  const res = await fetch(`${BASE}/payment/status`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  return res.json();
}
