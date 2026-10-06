# DAVAR — correctif local pour Worker privé sur Cloudflare Workers Free

**État : non déployé.** La migration Turso sur `davar-campus-staging` a été rapportée réussie et contrôlée en lecture seule (9 tables, 3 index, reçu valide ; zéro ligne dans les tables métier). Le propriétaire a choisi **catalogue vide pour la première recette privée**. Aucune formation, aucun compte, paiement ou droit n'est ajouté par ce kit.

## Ce que modifie le kit

Une seule configuration, `cloudflare.config.ts`, pour le Worker **distinct** `davar-campus-next-staging-2026` :

- Garde l'adresse gratuite du Worker en `*.workers.dev` (`workersDev:true`) ; **n'achète et n'ajoute aucun domaine personnalisé**. L'utilisateur confirme qu'Access protège **tout le trafic** de ce Worker ; recontrôler après déploiement sans session.
- Désactive les URL d'aperçu inutiles (`previewUrls:false`) ; aucune route ou domaine personnalisé ajouté.
- Épingle `APP_ENV=staging` et le nom d'hôte exact de `davar-campus-staging`, sans référence à la production.
- Déclare `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN` comme **secrets Cloudflare** ; leurs valeurs ne figurent ni dans le code ni dans ce kit. Créer ultérieurement un jeton Turso **distinct, lecture seule, limité à cette base et à durée finie** ; ne jamais réutiliser le jeton lecture-écriture de migration.
- N'ajoute aucune ressource D1/KV/Images ou Workers Paid. Chariow Pulse reste désactivé tant que `CHARIOW_ENABLE_PULSE` n'est pas explicitement `true` (ne pas l'activer). Le diagnostic privé sans secret dédié répondra 503.

Le script `install-free-worker-config.ps1` ne fait **aucune requête réseau**. Il vérifie les SHA-256 de l'ancien fichier et du nouveau, refuse un fichier modifié, sauvegarde l'ancien en `.before-free-staging.bak` et ne remplace que cette configuration dans le dossier `Downloads\davar-app-deploiement-prive`. Il ne lit ni ne modifie `.env.local`.

## Conditions strictes avant le futur `cf deploy`

1. Prévoir la configuration des **deux secrets** uniquement dans le tableau de bord du Worker Cloudflare, avec URL staging et **jeton applicatif lecture seule**. Confirmer leur présence par leurs NOMS, jamais leurs valeurs. Garder la politique Access **All traffic** active sur ce Worker ; ne pas toucher au Worker de diagnostic.
2. Tester localement le nouveau fichier/config/build (`cf deploy --dry-run` ne téléverse pas). Préparer les commandes avec le propriétaire, **ne pas** exécuter `cf deploy` tant que le plan précis et les secrets n'ont pas été vérifiés.
3. Dès le déploiement, retester depuis une session anonyme la redirection/refus Access sur `/`, `/campus`, `/api/chariow/pulse` ; depuis la session autorisée : `/` doit afficher **« Aucune formation publiée pour le moment »** (Turso connecté, table vide), et non une erreur générique ; autres routes sensibles restent fermées. En cas d'exposition ou d'erreur : retirer immédiatement la route/version, sans modifier Turso.

Ne pas coller de jeton ni de capture d'écran contenant un jeton dans le chat. Conserver la sauvegarde SQLite déjà téléchargée sur le PC et l'ancienne configuration `.bak`.
