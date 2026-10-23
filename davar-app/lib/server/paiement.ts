/**
 * PAIEMENT DANS L'APPLICATION.
 *
 * Le premier achat se fait HORS de l'application, chez Chariow : le Pulse
 * rattache la formation au compte (voir `chariow-ledger.ts`). Les achats
 * SUIVANTS se font ici, et le prototype nomme cette voie « la voie
 * universelle » : mobile money (Wave, Orange Money, MTN MoMo, Moov Money) et
 * carte bancaire, par un seul fournisseur.
 *
 * Pourquoi Flutterwave et pas Money Fusion ? Parce que Money Fusion n'accepte
 * les appels que depuis des adresses IP déclarées à l'avance (« Seules les
 * adresses IP enregistrées pourront consommer l'API. Toute IP non déclarée
 * sera automatiquement bloquée. » — docs.moneyfusion.net). Une application
 * hébergée sur les Workers n'a PAS d'IP fixe : une IP dédiée existe chez
 * Cloudflare, mais elle est réservée aux comptes Enterprise (Aegis), ce qui
 * romprait la règle « zéro franc avant 3 000 étudiants ». Flutterwave, lui,
 * authentifie par clé secrète : aucune contrainte d'IP.
 *
 * Le branchement Money Fusion reste prêt ci-dessous (`voiePaiement`) : le jour
 * où un serveur à IP fixe existera, il suffira de poser la clé et d'écrire
 * l'appel — l'écran, lui, existe déjà.
 */
import type { Db } from './auth-core';
import { notifier } from './notifications.ts';
import { lireReglages } from './settings.ts';
import { envoyerScenario } from './courriels.ts';

export type VoiePaiement = 'flutterwave' | null;

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim().length > 0 ? valeur.trim() : null;
}

function entier(valeur: unknown): number {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  const nombre = Number(valeur);
  return Number.isFinite(nombre) ? Math.trunc(nombre) : 0;
}

function identifiant(prefixe: string): string {
  const maintenant = Date.now().toString(36);
  const hasard = Math.random().toString(36).slice(2, 10);
  return `${prefixe}_${maintenant}${hasard}`;
}

/**
 * Les clés du fournisseur, telles que le propriétaire les a saisies dans son
 * espace. Elles ne sont ni en dur dans le code, ni dans un fichier : c'est lui
 * qui les pose, et lui seul peut les retirer.
 */
export async function lireClesPaiement(
  db: Db
): Promise<{ actif: boolean; cle: string | null; secret: string | null }> {
  const reglages = await lireReglages(db);
  return {
    actif: reglages['paiement.flutterwave.actif'] === '1',
    cle: texte(reglages['paiement.flutterwave.cle']),
    secret: texte(reglages['paiement.flutterwave.webhook']),
  };
}

/**
 * La voie réellement ouverte. Une clé absente n'est jamais simulée : l'écran
 * le dit et le bouton refuse d'encaisser.
 */
export async function voiePaiement(db: Db): Promise<VoiePaiement> {
  const cles = await lireClesPaiement(db);
  return cles.actif && cles.cle ? 'flutterwave' : null;
}

/* ------------------------------------------------------------------ intentions */

export type Intention = {
  id: string;
  userId: string;
  trainingId: string;
  montantCfa: number;
  devise: string;
  statut: string;
  providerRef: string | null;
};

/** Une intention = « cette personne veut acheter cette formation, à ce prix ». */
export async function creerIntention(
  db: Db,
  options: { userId: string; trainingId: string; montantCfa: number; devise: string; provider: string }
): Promise<string> {
  const id = identifiant('pay');
  await db.execute({
    sql: `INSERT INTO payment_intents(id, user_id, training_id, provider, provider_ref, amount_cfa, currency, status, created_at_ms)
          VALUES (?,?,?,?,?,?,?, 'pending', ?)`,
    args: [
      id,
      options.userId,
      options.trainingId,
      options.provider,
      null,
      options.montantCfa,
      options.devise,
      Date.now(),
    ],
  });
  return id;
}

export async function lireIntention(db: Db, id: string): Promise<Intention | null> {
  const lignes = await db.execute({
    sql: `SELECT id, user_id, training_id, amount_cfa, currency, status, provider_ref
          FROM payment_intents WHERE id = ?`,
    args: [id],
  });
  const row = lignes.rows[0];
  if (!row) return null;
  return {
    id: texte(row.id) ?? id,
    userId: texte(row.user_id) ?? '',
    trainingId: texte(row.training_id) ?? '',
    montantCfa: entier(row.amount_cfa),
    devise: texte(row.currency) ?? 'XOF',
    statut: texte(row.status) ?? 'pending',
    providerRef: texte(row.provider_ref),
  };
}

/* ----------------------------------------------------------------- flutterwave */

const FLUTTERWAVE = 'https://api.flutterwave.com/v3';

export type OuverturePaiement = { ok: true; lien: string; reference: string } | { ok: false; erreur: string };

/**
 * Ouvre un paiement Flutterwave. Le navigateur est envoyé sur la page
 * d'encaissement du fournisseur : aucune carte, aucun numéro ne transite par
 * notre application.
 */
export async function ouvrirPaiementFlutterwave(
  db: Db,
  options: {
    reference: string;
    montantCfa: number;
    devise: string;
    email: string;
    nom: string;
    telephone: string;
    trainingId: string;
    retourUrl: string;
  }
): Promise<OuverturePaiement> {
  const cles = await lireClesPaiement(db);
  if (!cles.actif || !cles.cle) return { ok: false, erreur: 'paiement_non_configure' };

  const reponse = await fetch(`${FLUTTERWAVE}/payments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cles.cle}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      tx_ref: options.reference,
      amount: options.montantCfa,
      currency: options.devise,
      // Mobile money d'Afrique francophone ET carte bancaire : un seul guichet.
      payment_options: 'card, mobilemoneyfranco',
      redirect_url: options.retourUrl,
      customer: { email: options.email, phonenumber: options.telephone, name: options.nom },
      customizations: {
        title: 'Davar Académie',
        description: 'Formation en art oratoire',
      },
      meta: { training_id: options.trainingId },
    }),
  });

  if (!reponse.ok) return { ok: false, erreur: 'fournisseur_indisponible' };
  const donnees = (await reponse.json().catch(() => ({}))) as {
    status?: string;
    data?: { link?: string };
  };
  const lien = typeof donnees.data?.link === 'string' ? donnees.data.link : '';
  if (donnees.status !== 'success' || !lien) return { ok: false, erreur: 'fournisseur_refuse' };
  return { ok: true, lien, reference: options.reference };
}

export type Verification = {
  ok: boolean;
  statut: string | null;
  montant: number | null;
  devise: string | null;
  reference: string | null;
};

/**
 * Vérifie une transaction AVANT d'ouvrir quoi que ce soit. Une réponse
 * « réussie » venue du navigateur ne prouve rien : seul l'appel au fournisseur
 * fait foi. Le montant et la devise sont comparés à l'intention — jamais à ce
 * que le client a bien voulu annoncer.
 */
export async function verifierTransactionFlutterwave(db: Db, transactionId: string): Promise<Verification> {
  const cles = await lireClesPaiement(db);
  if (!cles.cle) return { ok: false, statut: null, montant: null, devise: null, reference: null };

  const reponse = await fetch(`${FLUTTERWAVE}/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: { authorization: `Bearer ${cles.cle}` },
  });
  if (!reponse.ok) return { ok: false, statut: null, montant: null, devise: null, reference: null };
  const donnees = (await reponse.json().catch(() => ({}))) as {
    status?: string;
    data?: { status?: string; amount?: number; currency?: string; tx_ref?: string };
  };
  const data = donnees.data ?? {};
  return {
    ok: donnees.status === 'success' && data.status === 'successful',
    statut: typeof data.status === 'string' ? data.status : null,
    montant: typeof data.amount === 'number' ? data.amount : null,
    devise: typeof data.currency === 'string' ? data.currency : null,
    reference: typeof data.tx_ref === 'string' ? data.tx_ref : null,
  };
}

/* ------------------------------------------------------------------ attribution */

export type ResultatAttribution = 'attribue' | 'deja' | 'ecart' | 'inconnu';

/**
 * Attribue la formation une fois le paiement confirmé. Trois refus possibles,
 * tous silencieux pour l'étudiant mais tracés :
 *   - le montant ou la devise ne correspond pas à l'intention ;
 *   - l'intention est inconnue ;
 *   - la formation est déjà attribuée (le paiement est tout de même enregistré).
 *
 * L'écriture passe par `payment_events` : un même événement de fournisseur
 * n'attribue JAMAIS deux fois, même rejoué.
 */
export async function attribuerApresPaiement(
  db: Db,
  options: { provider: string; eventId: string; intentionId: string; montant: number; devise: string }
): Promise<ResultatAttribution> {
  const intention = await lireIntention(db, options.intentionId);
  if (!intention) return 'inconnu';
  if (intention.montantCfa !== options.montant || intention.devise !== options.devise) return 'ecart';

  const maintenant = Date.now();
  const inscrit = await db.execute({
    sql: `SELECT 1 FROM payment_events WHERE provider = ? AND event_id = ?`,
    args: [options.provider, options.eventId],
  });
  if (inscrit.rows.length > 0) return 'deja';

  // Un achat confirmé dans l'application rejoint le MÊME registre que les
  // achats Chariow : une seule table raconte qui a payé quoi. C'est aussi ce
  // qui rend l'attribution possible — une inscription exige une vente
  // vérifiée, et la vérification, ici, est l'appel au fournisseur.
  const courriel = await db.execute({
    sql: 'SELECT email_normalized FROM users WHERE id = ?',
    args: [intention.userId],
  });
  const acheteur = texte(courriel.rows[0]?.email_normalized) ?? '';

  await db.batch(
    [
      {
        sql: `INSERT INTO payment_events(provider, event_id, intent_id, received_at_ms) VALUES (?,?,?,?)`,
        args: [options.provider, options.eventId, intention.id, maintenant],
      },
      {
        sql: `UPDATE payment_intents SET status = 'verified' WHERE id = ?`,
        args: [intention.id],
      },
      {
        sql: `INSERT INTO verified_purchases(sale_id, buyer_email_normalized, training_id, amount_value_text, currency, verified_at_ms)
              VALUES (?,?,?,?,?,?)
              ON CONFLICT(sale_id) DO NOTHING`,
        args: [
          intention.id,
          acheteur,
          intention.trainingId,
          String(intention.montantCfa),
          intention.devise,
          maintenant,
        ],
      },
      {
        sql: `INSERT INTO enrollments(user_id, training_id, source, sale_id, acquired_at_ms)
              VALUES (?,?, 'verified_purchase', ?, ?)
              ON CONFLICT(user_id, training_id) DO NOTHING`,
        args: [intention.userId, intention.trainingId, intention.id, maintenant],
      },
    ],
    'write'
  );

  const formation = await db.execute({ sql: 'SELECT title FROM trainings WHERE id = ?', args: [intention.trainingId] });
  const titreFormation = typeof formation.rows[0]?.title === 'string' ? formation.rows[0].title : 'votre formation';
  await notifier(db, {
    userId: intention.userId,
    kind: 'paiement',
    titre: 'Formation activée ✓',
    corps: `Paiement confirmé : « ${titreFormation} » a été ajoutée à votre compte.`,
  });

  // Le reçu par e-mail : la facture est nommée dans le texte du prototype, et
  // reste téléchargeable depuis l'écran de succès.
  if (acheteur) {
    await envoyerScenario(db, 'paiement-confirme', acheteur, {
      titre: titreFormation,
      userId: intention.userId,
    });
  }

  return 'attribue';
}
