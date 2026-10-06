import {bindings, defineConfig, defineWorker} from 'cf/config';

/** Préparation seulement. Ne PAS déployer avant :
 * - inventaire du compte et confirmation du nom libre ;
 * - Cloudflare Access « All traffic » actif sur ce Worker OU protection
 *   globale préalable ; accès non authentifié testé après ouverture ;
 * - configuration privée Turso staging et validation du plan Free.
 * workersDev:true garde l'URL gratuite workers.dev pour la recette privée ;
 * impératif : Cloudflare Access « All traffic » sur ce Worker AVANT deploy.
 * previewUrls:false désactive les aperçus inutiles.
 * Recontrôler la protection et la route après publication.
 */
export default defineConfig({
  worker: defineWorker({
    name: 'davar-campus-next-staging-2026',
    entrypoint: 'vinext/server/fetch-handler',
    compatibilityDate: '2026-10-02',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: true,
    previewUrls: false,
    assets: {notFoundHandling:'none'},
    env: {
      ASSETS: bindings.assets(),
      // Valeurs non secrètes épinglées au staging : ne pas confondre production.
      APP_ENV: bindings.text('staging'),
      TURSO_EXPECTED_HOST: bindings.text('davar-campus-staging-davar-academie.aws-eu-west-1.turso.io'),
      // Hachage délégué : le Worker gratuit n'a que 10 ms de CPU par requête,
      // l'opération coûteuse vit sur l'offre gratuite décrite dans
      // ARCHITECTURE-GRATUITE.md (service auth-kdf-service/).
      AUTH_KDF_MODE: bindings.text('remote'),
      // Ces valeurs sont saisies dans le tableau de bord Cloudflare, pas dans le code.
      TURSO_DATABASE_URL: bindings.secret(),
      TURSO_AUTH_TOKEN: bindings.secret(),
      AUTH_KDF_URL: bindings.secret(),
      AUTH_KDF_TOKEN: bindings.secret(),
    },
  }),
});
