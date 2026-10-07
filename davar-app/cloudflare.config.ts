import {bindings, defineConfig, defineWorker} from 'cf/config';

/**
 * Cible de déploiement — UN SEUL fichier, deux profils explicitement séparés.
 *
 *   (rien)                          → staging  (valeur sûre par défaut)
 *   DAVAR_DEPLOY_TARGET=staging     → Worker privé de recette, derrière Access
 *   DAVAR_DEPLOY_TARGET=production  → Worker PUBLIC du campus, sans Access
 *
 * Pourquoi une variable et pas deux fichiers : l'outil `cf` ne lit qu'un seul
 * `cloudflare.config.ts`. Deux fichiers imposeraient de renommer des fichiers à
 * la main — c'est exactement le genre de manipulation qui mélange un jour la
 * production et la recette. Ici, la cible doit être écrite noir sur blanc pour
 * la production, et toute valeur inconnue arrête le déploiement.
 */
const target = (process.env.DAVAR_DEPLOY_TARGET ?? 'staging').trim();
if (target !== 'staging' && target !== 'production')
  throw new Error(`DAVAR_DEPLOY_TARGET inconnu : « ${target} » (valeurs admises : staging, production)`);

const production = target === 'production';

/** Relais d'e-mail : `apps_script` (choix du propriétaire) ou `brevo`. */
const mailerKind = (process.env.DAVAR_MAILER ?? 'apps_script').trim();
if (mailerKind !== 'brevo' && mailerKind !== 'apps_script')
  throw new Error(`DAVAR_MAILER inconnu : « ${mailerKind} » (valeurs admises : apps_script, brevo)`);

const STAGING_HOST = 'davar-campus-staging-davar-academie.aws-eu-west-1.turso.io';
const productionHost = (process.env.DAVAR_PRODUCTION_DB_HOST ?? '').trim();
const STAGING_ORIGIN = 'https://davar-campus-next-staging-2026.davaracademie.workers.dev';

/**
 * Origine publique, OBLIGATOIRE en production : c'est elle qui construit les
 * liens de confirmation envoyés par e-mail (le projet refuse de fabriquer un
 * lien à partir d'une valeur fournie par le client). Sans elle, l'inscription
 * échouerait en 503 « origin_not_configured » — mieux vaut arrêter le
 * déploiement ici que découvrir cela devant un étudiant.
 */
const publicOrigin = (process.env.DAVAR_PUBLIC_ORIGIN ?? '').trim();
if (production && !/^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(publicOrigin))
  throw new Error(
    'DAVAR_PUBLIC_ORIGIN requise pour la production, au format https://hote (ex. https://davar-campus-production-2026.<votre-sous-domaine>.workers.dev).'
  );

if (target === 'production') {
  if (!productionHost)
    throw new Error(
      'DAVAR_PRODUCTION_DB_HOST absente : indiquez l’hôte de la base Turso de PRODUCTION (ex. davar-campus-<compte>.aws-eu-west-1.turso.io).'
    );
  if (/staging/i.test(productionHost))
    throw new Error(`DAVAR_PRODUCTION_DB_HOST ressemble à du staging : « ${productionHost} ». Déploiement refusé.`);
  if (productionHost === STAGING_HOST)
    throw new Error('La base staging ne peut pas être déployée en production. Déploiement refusé.');
}

export default defineConfig({
  worker: defineWorker({
    // Un Worker DISTINCT par environnement : la production ne peut pas écraser la recette.
    name: production ? 'davar-campus-production-2026' : 'davar-campus-next-staging-2026',
    entrypoint: 'vinext/server/fetch-handler',
    compatibilityDate: '2026-10-02',
    compatibilityFlags: ['nodejs_compat'],
    // URL gratuite *.workers.dev : le propriétaire n'a pas encore de domaine enregistré.
    workersDev: true,
    previewUrls: false,
    assets: {notFoundHandling: 'none'},
    env: {
      ASSETS: bindings.assets(),
      // Valeur non secrète et vérifiable : elle conditionne les refus de sécurité
      // (inscription sans e-mail, hôte Turso attendu, cookies sécurisés).
      APP_ENV: bindings.text(production ? 'production' : 'staging'),
      TURSO_EXPECTED_HOST: bindings.text(production ? productionHost : STAGING_HOST),
      // Dérivation côté client : le navigateur paie le coût CPU (PBKDF2 600 000
      // itérations) et le Worker ne fait qu'une vérification bon marché (~2,6 ms),
      // compatible avec les 10 ms de Cloudflare Workers Free. Aucun hébergement
      // supplémentaire, donc rien à louer.
      AUTH_KDF_MODE: bindings.text('client'),
      // Ces valeurs sont saisies dans le tableau de bord Cloudflare, jamais ici.
      // Une liaison déclarée est la seule façon dont le secret atteint le Worker :
      // un secret saisi mais NON déclaré ici reste inerte.
      TURSO_DATABASE_URL: bindings.secret(),
      TURSO_AUTH_TOKEN: bindings.secret(),
      AUTH_PARAMS_SECRET: bindings.secret(),
      AUTH_VERIFIER_PEPPER: bindings.secret(),
      APP_DIAGNOSTIC_TOKEN: bindings.secret(),
      // Origine publique : indispensable aux liens envoyés par e-mail.
      APP_PUBLIC_ORIGIN: bindings.text(production ? publicOrigin : STAGING_ORIGIN),
      // Coût de la vérification serveur, rendu explicite (défaut du code : 10 000).
      AUTH_VERIFIER_ITERATIONS: bindings.text('10000'),
      // Chariow : identifiants du Pulse et de la boutique. Sans eux, le webhook
      // ne peut PAS authentifier une livraison et refuse tout (comportement fermé
      // volontaire). À saisir avant d'activer CHARIOW_ENABLE_PULSE.
      CHARIOW_PULSE_ID: bindings.secret(),
      CHARIOW_STORE_ID: bindings.secret(),
      // Envoi des e-mails de confirmation. En production, l'inscription REFUSE
      // de créer un compte sans service d'e-mail : aucune fausse promesse.
      MAILER_KIND: bindings.text(mailerKind),
      BREVO_API_KEY: bindings.secret(),
      MAIL_FROM_EMAIL: bindings.secret(),
      MAIL_FROM_NAME: bindings.text('Davar Académie'),
      // Chariow Pulse : à n'activer qu'après un essai signé réussi.
      CHARIOW_ENABLE_PULSE: bindings.text('false'),
      CHARIOW_PULSE_SECRET: bindings.secret(),
      CHARIOW_API_KEY: bindings.secret(),
      // Relais d'e-mail par Google Apps Script : le script prêt à coller est
      // dans apps-script/RelaisE-mail.gs. Sans ces deux valeurs, l'inscription
      // est refusée (503) — volontairement, plutôt que de créer un compte dont
      // l'adresse ne peut pas être confirmée.
      MAIL_APPS_SCRIPT_URL: bindings.secret(),
      MAIL_APPS_SCRIPT_TOKEN: bindings.secret(),
      // Assistant virtuel : les clés des moteurs gratuits. Elles vivent ICI, côté
      // serveur, et ne sont JAMAIS exposées au navigateur — une clé lisible depuis
      // une page serait copiable par n'importe quel étudiant. Une seule clé suffit
      // pour démarrer ; les autres deviennent des relais quand un quota est atteint.
      GROQ_API_KEY: bindings.secret(),
      GEMINI_API_KEY: bindings.secret(),
      OPENROUTER_API_KEY: bindings.secret(),
      HUGGINGFACE_API_KEY: bindings.secret(),
      // Moteur personnalisé : n'est utilisé que si les deux sont posés.
      ASSISTANT_CUSTOM_URL: bindings.secret(),
      ASSISTANT_CUSTOM_KEY: bindings.secret(),
    },
  }),
});
