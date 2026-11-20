/**
 * VENTES — les achats réellement encaissés, et la chaîne qui leur donne un accès.
 *
 * Le prototype disait la règle : « paiement confirmé → webhook → compte identifié
 * → formation attribuée ». C'est exactement ce que rejoue cet écran, sur les
 * données du campus :
 *
 *   - la vente vient de Chariow (achat hors app — décision du propriétaire) ;
 *   - le webhook signé crée le reçu dans `verified_purchases` et sa livraison
 *     dans `pulse_deliveries` ;
 *   - le compte est identifié par l'adresse d'achat, et seulement s'il est
 *     confirmé ;
 *   - la formation s'ajoute alors toute seule, une seule fois.
 *
 * Aucun montant n'est additionné entre devises différentes : les totaux sont
 * donnés devise par devise, jamais mélangés.
 */
import type { Db } from './auth-core.ts';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : defaut;
}

function entier(valeur: unknown): number {
  const nombre = typeof valeur === 'bigint' ? Number(valeur) : Number(valeur ?? 0);
  return Number.isFinite(nombre) ? Math.trunc(nombre) : 0;
}

function instant(valeur: unknown): number | null {
  if (valeur == null) return null;
  const nombre = typeof valeur === 'bigint' ? Number(valeur) : Number(valeur);
  return Number.isFinite(nombre) && nombre > 0 ? Math.trunc(nombre) : null;
}

/** Les francs CFA s'écrivent « FCFA » ; tout le reste garde sa devise. */
export function formaterMontant(valeurTexte: string, devise: string): string {
  const code = devise.trim().toUpperCase();
  const nombre = Number(String(valeurTexte).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(nombre)) return `${valeurTexte} ${code}`.trim();
  const arrondi = Math.round(nombre * 100) / 100;
  if (code === 'XOF' || code === 'XAF') return `${Math.round(arrondi).toLocaleString('fr-FR')} FCFA`;
  return `${arrondi.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`;
}

export type LigneVente = {
  saleId: string;
  acheteur: string;
  /** Le nom du compte quand il existe, sinon null. */
  etudiant: string | null;
  compteIdentifie: boolean;
  /** Le compte existe, mais son adresse n'est pas encore confirmée. */
  compteNonConfirme: boolean;
  formation: string;
  montantTexte: string;
  devise: string;
  montantAffiche: string;
  verifieMs: number;
  /** Le webhook du système de vente est bien arrivé (rien n'est cru sur parole). */
  webhookMs: number | null;
  /** L'accès a été rattaché au compte, à cette date. */
  attribueeMs: number | null;
};

export type TotauxParDevise = {
  devise: string;
  ventes: number;
  montant: number;
  montantAffiche: string;
  panierMoyenAffiche: string;
};

export type AnalyseVentes = {
  lignes: LigneVente[];
  total: number;
  trenteJours: number;
  /** Achats vérifiés dont le compte n'existe pas encore : c'est la file à surveiller. */
  sansCompte: LigneVente[];
  attribuees: number;
  parDevise: TotauxParDevise[];
};

const JOUR_MS = 24 * 60 * 60 * 1000;

export async function analyseVentes(db: Db, maintenant = Date.now()): Promise<AnalyseVentes> {
  const resultat = await db.execute(
    `SELECT p.sale_id, p.buyer_email_normalized, p.amount_value_text, p.currency, p.verified_at_ms,
            t.title AS formation,
            u.id AS user_id, u.display_name, u.email_verified_at_ms,
            (SELECT MAX(d.received_at_ms) FROM pulse_deliveries d WHERE d.sale_id = p.sale_id) AS webhook_ms,
            (SELECT MAX(e.acquired_at_ms) FROM enrollments e WHERE e.sale_id = p.sale_id) AS attribuee_ms
     FROM verified_purchases p
     JOIN trainings t ON t.id = p.training_id
     LEFT JOIN users u ON u.email_normalized = p.buyer_email_normalized
     WHERE u.id IS NULL OR u.is_test = 0
     ORDER BY p.verified_at_ms DESC LIMIT 300`
  );

  const lignes: LigneVente[] = resultat.rows.map((ligne) => {
    const montantTexte = texte(ligne.amount_value_text, '—');
    const devise = texte(ligne.currency, '');
    return {
      saleId: texte(ligne.sale_id),
      acheteur: texte(ligne.buyer_email_normalized, '—'),
      etudiant: texte(ligne.display_name) || null,
      compteIdentifie: ligne.user_id != null,
      compteNonConfirme: ligne.user_id != null && ligne.email_verified_at_ms == null,
      formation: texte(ligne.formation, 'Formation retirée du catalogue'),
      montantTexte,
      devise,
      montantAffiche: formaterMontant(montantTexte, devise),
      verifieMs: entier(ligne.verified_at_ms),
      webhookMs: instant(ligne.webhook_ms),
      attribueeMs: instant(ligne.attribuee_ms),
    };
  });

  // Totaux devise par devise : additionner des francs et des dollars donnerait
  // un chiffre qui ne veut rien dire.
  const devises = new Map<string, { ventes: number; montant: number }>();
  for (const ligne of lignes) {
    const code = ligne.devise.toUpperCase() || '—';
    const nombre = Number(String(ligne.montantTexte).replace(/\s/g, '').replace(',', '.'));
    const cumul = devises.get(code) ?? { ventes: 0, montant: 0 };
    cumul.ventes += 1;
    if (Number.isFinite(nombre)) cumul.montant += nombre;
    devises.set(code, cumul);
  }

  const seuil = maintenant - 30 * JOUR_MS;
  return {
    lignes,
    total: lignes.length,
    trenteJours: lignes.filter((ligne) => ligne.verifieMs >= seuil).length,
    sansCompte: lignes.filter((ligne) => !ligne.compteIdentifie),
    attribuees: lignes.filter((ligne) => ligne.attribueeMs != null).length,
    parDevise: [...devises.entries()].map(([devise, cumul]) => ({
      devise,
      ventes: cumul.ventes,
      montant: Math.round(cumul.montant * 100) / 100,
      montantAffiche: formaterMontant(String(cumul.montant), devise),
      panierMoyenAffiche: formaterMontant(String(cumul.montant / Math.max(1, cumul.ventes)), devise),
    })),
  };
}
