/**
 * Catalogue de démonstration (Phase 0).
 * En Phase 1 : remplacé par la table `trainings` de Supabase.
 * Paiement principal : Chariow (lien de checkout par formation + webhook de déblocage).
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
    price: 45000,
    level: "Tous niveaux",
    chariowUrl: "https://d-ueo.mychariow.co/prd_6wx1czzp/checkout",
  },
  {
    id: "t-marketing",
    code: "MD-101",
    abbr: "MKT",
    title: "Marketing Digital — Fondamentaux",
    desc: "Maîtrisez les canaux digitaux, construisez une stratégie de contenu et mesurez vos performances.",
    mono: "MD",
    hue: 268,
    hours: 14,
    price: 45000,
    level: "Débutant → Intermédiaire",
  },
  {
    id: "t-excel",
    code: "EX-201",
    abbr: "EXD",
    title: "Excel & Analyse de données",
    desc: "Des bases solides aux tableaux de bord : l'outil n°1 de l'analyse de données en entreprise.",
    mono: "EX",
    hue: 210,
    hours: 10,
    price: 35000,
    level: "Tous niveaux",
  },
  {
    id: "t-entreprendre",
    code: "CE-301",
    abbr: "CEC",
    title: "Créer son entreprise en Côte d'Ivoire",
    desc: "De l'idée au registre de commerce : formalités, financement, fiscalité et premiers clients.",
    mono: "CE",
    hue: 38,
    hours: 12,
    price: 55000,
    level: "Débutant",
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
