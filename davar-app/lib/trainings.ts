/**
 * Catalogue de référence : il est importé dans la table `trainings` de Turso
 * (voir `scripts/production-ops.mjs catalog`), qui reste la source de vérité.
 *
 * Décision du propriétaire (6 octobre 2026) : une seule formation est ouverte à
 * la vente — « Devenir un excellent orateur », dont le lien de checkout Chariow
 * existe déjà. Les trois autres ont été retirées du catalogue faute de lien
 * d'achat : une formation visible mais non achetable serait un mensonge.
 *
 * PRIX (propriétaire, 6 octobre 2026) : 39 900 FCFA. Ce prix sert à VOS DOSSIERS
 * et à votre page de vente — il n'est JAMAIS affiché dans l'application : la
 * personne achète sur votre page, puis entre ici avec son adresse d'achat.
 *
 * LIEN D'ACHAT VÉRIFIÉ : le propriétaire a confirmé le 6 octobre 2026 que
 * `https://d-ueo.mychariow.co/prd_6wx1czzp/checkout` est bien le bon lien de
 * checkout de cette formation, et que `prd_6wx1czzp` est bien le produit qui lui
 * correspondra dans Chariow. Ne pas modifier l'un sans l'autre : c'est cet
 * identifiant `prd_` qui rattachera automatiquement une vente à la formation.
 */
export interface Training {
  id: string;
  code: string;
  abbr: string; // abréviation officielle (figure sur les certificats)
  title: string;
  desc: string;
  mono: string;
  hue: number;
  hours: number;
  price: number; // FCFA net
  level: string;
  chariowUrl?: string; // lien de checkout Chariow de la formation
}

export const TRAININGS: Training[] = [
  {
    id: "t-orateur",
    code: "OR-101",
    abbr: "ORA",
    title: "Devenir un excellent orateur",
    desc: "La formation signature DAVAR : vaincre le trac, structurer un discours, captiver n'importe quel auditoire.",
    mono: "OR",
    hue: 268,
    hours: 12,
    price: 39900,
    level: "Tous niveaux",
    chariowUrl: "https://d-ueo.mychariow.co/prd_6wx1czzp/checkout",
  },
];

/** Coaching personnel — réservation via Chariow (lien modifiable côté admin en Phase 1). */
export const COACHING_BOOKING_URL = "https://d-ueo.mychariow.co/prd_ma8xximn/booking";

/** Intégrations Google Apps Script (modifiables dans le dashboard admin). */
export const APPS_SCRIPT = {
  mailUrl:
    "https://script.google.com/macros/s/AKfycbzCZv3WlIplI_QDlvNEDnQ4t5K7bVIdnFMcXhQb6KWQlNbImfOb1-fgQ1cuJFHHOb_G3Q/exec",
  certUrl:
    "https://script.google.com/macros/s/AKfycbyQ3KuAXQHjPliEMCWjq_seH1enje5G3Jv1P2Y3wUVLSwhTvLhH1RslpZGqwRYigfBX/exec",
};

// CinetPay conservé en secours uniquement (l'utilisateur n'a pas de registre de commerce).
export const AGG_RATE = { af: 0.025, int: 0.035 }; // taux indicatifs CinetPay
export const XOF_PER_EUR = 655.957; // parité fixe
