/**
 * SANTÉ TECHNIQUE — « tout est-il branché, et qu'est-ce qui se consomme ? »
 *
 * Le prototype avait cet écran pour l'analyste : il montrait l'usage RÉEL des
 * passerelles, sans aucune donnée financière. Ici, la même idée, mais sur des
 * faits vérifiables dans NOTRE base et NOTRE configuration :
 *
 *   - ce qui est relié (base, stockage, e-mail, hachage, assistants, vente) et
 *     ce qui ne l'est pas ENCORE — dit franchement, jamais inventé ;
 *   - les quotas des offres gratuites et ce qu'ils consomment aujourd'hui, parce
 *     que la règle du projet est de les protéger, pas de les dépenser ;
 *   - les traces réelles des passerelles : webhooks de vente reçus, achats
 *     vérifiés, exports produits, purges exécutées.
 *
 * Aucun secret n'apparaît ici : on dit « configuré » ou « non configuré », jamais
 * une clé, jamais un jeton.
 */
import { analyseAssistants, type FournisseurAnalyse } from './assistants.ts';
import type { Db } from './auth-core.ts';
import { kdfStatus } from './password-service.ts';
import { quotaSnapshot, type QuotaLine } from './quota.ts';
import { stockagePret } from './stockage.ts';
import { mailerConfigured, mailerKind } from './mailer.ts';

export type EtatService = {
  cle: string;
  nom: string;
  /** « relie » : le service répond ; « en attente » : il reste à configurer. */
  etat: 'relie' | 'en_attente' | 'volontairement_ferme';
  detail: string;
};

export type TracePasserelle = { nom: string; total: number; dernierMs: number | null };

export type SanteTechnique = {
  services: EtatService[];
  quotas: QuotaLine[];
  fournisseurs: FournisseurAnalyse[];
  traces: TracePasserelle[];
  base: { tables: number; migrations: number; derniereMigration: string | null };
};

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null;
}

function entier(valeur: unknown): number {
  const nombre = typeof valeur === 'bigint' ? Number(valeur) : Number(valeur ?? 0);
  return Number.isFinite(nombre) ? Math.trunc(nombre) : 0;
}

export async function santeTechnique(db: Db, maintenant = Date.now()): Promise<SanteTechnique> {
  const [tables, migrations, derniere, quotas, achats, webhooks, exports, purges, analyse] = await Promise.all([
      db.execute("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"),
      db.execute('SELECT COUNT(*) AS n FROM schema_migrations'),
      db.execute('SELECT file FROM schema_migrations ORDER BY version DESC LIMIT 1').catch(() => null),
      quotaSnapshot(db, maintenant).catch(() => [] as QuotaLine[]),
      db.execute('SELECT COUNT(*) AS n, MAX(verified_at_ms) AS d FROM verified_purchases'),
      db.execute('SELECT COUNT(*) AS n, MAX(received_at_ms) AS d FROM pulse_deliveries'),
      db.execute('SELECT COUNT(*) AS n, MAX(at_ms) AS d FROM exports_log'),
      db.execute('SELECT COUNT(*) AS n, MAX(at_ms) AS d FROM purge_log'),
      analyseAssistants(db, maintenant),
    ]);

  const fournisseurs = analyse.fournisseurs;

  const hachage = kdfStatus();
  const dernierFichier = derniere ? texte(derniere.rows[0]?.file) : null;
  const tablesConnues = entier(tables.rows[0]?.n);
  const migrationsAppliquees = entier(migrations.rows[0]?.n);

  const services: EtatService[] = [
    {
      cle: 'base',
      nom: 'Base de données (Turso)',
      etat: tablesConnues > 0 ? 'relie' : 'en_attente',
      detail: `${tablesConnues} tables · ${migrationsAppliquees} migration(s) appliquée(s)${dernierFichier ? ` · dernière : ${dernierFichier}` : ''}`,
    },
    {
      cle: 'stockage',
      nom: 'Stockage des fichiers (R2)',
      etat: stockagePret() ? 'relie' : 'en_attente',
      detail: stockagePret()
        ? 'Les livres, audios, vidéos et ressources peuvent être déposés par la Direction.'
        : 'À relier : sans lui, aucun fichier ne peut être déposé (les textes de leçons, eux, fonctionnent).',
    },
    {
      cle: 'email',
      nom: 'E-mails (Google Apps Script)',
      etat: mailerConfigured() ? 'relie' : 'en_attente',
      detail: mailerConfigured()
        ? `Envoi branché (${mailerKind() === 'apps_script' ? 'Apps Script' : 'Brevo'}) — confirmations d’adresse, invitations, lien après achat.`
        : 'À relier : sans lui, les liens sont affichés à la Direction (aucun e-mail ne part).',
    },
    {
      cle: 'hachage',
      nom: 'Mots de passe',
      etat: 'relie',
      detail: `Dérivation dans le navigateur (${hachage.clientIterations.toLocaleString('fr-FR')} itérations), mode serveur « ${hachage.mode} ». Le mot de passe ne quitte jamais l’appareil.`,
    },
    {
      cle: 'assistants',
      nom: 'Assistants virtuels',
      etat: fournisseurs.some((fournisseur) => fournisseur.cle) ? 'relie' : 'en_attente',
      detail: fournisseurs.some((fournisseur) => fournisseur.cle)
        ? `${fournisseurs.filter((fournisseur) => fournisseur.cle).length} fournisseur(s) sur ${fournisseurs.length} configuré(s), dans l’ordre : ${fournisseurs.map((fournisseur) => fournisseur.nom).join(' → ')}. ${analyse.basculeDuJour}`
        : 'À relier : aucune clé d’assistant n’est posée, le campus répond « je transmets au coach ».',
    },
    {
      cle: 'vente',
      nom: 'Vente des formations (Chariow)',
      etat: 'volontairement_ferme',
      detail:
        'Le lien de vente fonctionne (les étudiants achètent sur la page Chariow). La confirmation automatique par webhook reste fermée tant que vous ne l’avez pas validée : l’accès s’ouvre à la main.',
    },
    {
      cle: 'certificats',
      nom: 'Certificats et e-mails de l’assistant',
      etat: 'relie',
      detail: 'Les demandes de certificat sont transmises à votre Google Apps Script (la plateforme ne garde que le statut).',
    },
  ];

  const traces: TracePasserelle[] = [
    {
      nom: 'Achats vérifiés (Chariow)',
      total: entier(achats.rows[0]?.n),
      dernierMs: achats.rows[0]?.d == null ? null : entier(achats.rows[0]?.d),
    },
    {
      nom: 'Confirmations de vente reçues (webhook)',
      total: entier(webhooks.rows[0]?.n),
      dernierMs: webhooks.rows[0]?.d == null ? null : entier(webhooks.rows[0]?.d),
    },
    {
      nom: 'Exports produits',
      total: entier(exports.rows[0]?.n),
      dernierMs: exports.rows[0]?.d == null ? null : entier(exports.rows[0]?.d),
    },
    {
      nom: 'Purges exécutées',
      total: entier(purges.rows[0]?.n),
      dernierMs: purges.rows[0]?.d == null ? null : entier(purges.rows[0]?.d),
    },
  ];

  return {
    services,
    quotas,
    fournisseurs,
    traces,
    base: { tables: tablesConnues, migrations: migrationsAppliquees, derniereMigration: dernierFichier },
  };
}
