# DAVAR — travailler depuis votre ordinateur sans copier `.env.local`

**Non : ne copiez, n'envoyez et n'ouvrez pas `.env.local` pour cette opération.** L'archive `davar-app-deploiement-prive.zip` est construite par liste blanche ; elle ne contient aucun fichier `.env*`, aucune base ou clé. L'application et le Worker ne doivent utiliser que **le Turso staging existant** au premier palier.

## Sur votre ordinateur (PowerShell Windows)

1. Téléchargez l'archive depuis cette conversation et décompressez-la dans un dossier privé. Si vous avez déjà un dossier du projet avec `.env.local`, **utilisez un autre dossier**, propre, pour ne pas faire charger ce fichier par Vite/Next/Cloudflare.
2. Vérifiez que Node.js est en version **22.18 ou ultérieure** : `node --version`. Depuis le dossier extrait :

   ```powershell
   npm ci
   npm run build:vinext
   npx cf auth login
   npx cf auth whoami
   ```

   L'auth Cloudflare se fait dans votre navigateur. Ne copiez pas ici la sortie contenant votre identité, code de connexion ou jeton. Assurez-vous que le compte sélectionné est celui qui contient `davar-campus-next-staging-2026`. **Ne lancez pas encore `npx cf deploy`** : l'identité du Worker et sa protection doivent être recroisées avant l'envoi du code.
3. Préparez uniquement les accès **lecture seule** à la base Turso *staging* existante sur votre propre ordinateur. Si vous utilisez le CLI Turso, connectez-vous localement (`turso auth login`) et créez un jeton court strictement limité à cette base :

   ```powershell
   $env:APP_ENV = 'staging'
   $env:TURSO_DATABASE_URL = (turso db show --url NOM_BASE_STAGING).Trim()
   $env:TURSO_EXPECTED_HOST = ([uri]$env:TURSO_DATABASE_URL).Host
   $env:TURSO_AUTH_TOKEN = (turso db tokens create NOM_BASE_STAGING --read-only --expiration 7d).Trim()
   node scripts/staging-inventory.mjs
   ```

   Remplacez `NOM_BASE_STAGING` par **le nom existant** (pas celui de production). Le script refuse tout hôte sans `staging` dans son nom, toute configuration sans `APP_ENV=staging` et n'effectue que des `SELECT` sur les métadonnées. Si le nom de l'hôte réel n'inclut pas `staging`, **arrêtez-vous** pour faire vérifier l'identité de la base ; ne contournez pas le garde-fou. Ne collez pas le jeton ni sa sortie dans le chat.
4. Après l'inventaire, retirez les variables sensibles de la session PowerShell :

   ```powershell
   Remove-Item Env:TURSO_AUTH_TOKEN -ErrorAction SilentlyContinue
   Remove-Item Env:TURSO_DATABASE_URL -ErrorAction SilentlyContinue
   Remove-Item Env:TURSO_EXPECTED_HOST -ErrorAction SilentlyContinue
   Remove-Item Env:APP_ENV -ErrorAction SilentlyContinue
   ```

5. Transmettez seulement : « build OK/échec », « compte Cloudflare du Worker confirmé : oui/non », la **liste des noms de tables et empreintes** affichées par le script (sans données personnelles ni secrets), et l'URL Worker déjà connue. Nous présenterons le SQL de migration, la sauvegarde et le retour arrière pour accord séparé. **Aucune écriture Turso ni déploiement applicatif n'est demandé par ces étapes.**

Si votre système n'est pas Windows ou si le CLI Turso n'est pas installé, indiquez-le simplement : nous adapterons les commandes. Si PowerShell affiche une erreur, transmettez le message après avoir retiré tout secret ou valeur de variable privée.
