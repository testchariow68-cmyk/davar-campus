# HISTORIQUE — architecture des bases et bascule (option multi-base en pause)

**Décision actuelle :** Turso seule base applicative cible ; réplication/failover CockroachDB → D1 **en pause**, sans suppression de ressources ou de code. Se reporter à `TURSO-SEUL-PLAN.md`. Le texte ci-dessous décrit l'ancienne option, non un plan d'exécution en vigueur. Aucun raccordement du campus public n'a été réalisé.

**État :** diagnostic staging `SELECT 1` opérationnel sur les trois bases (confirmé par le propriétaire), et socle de migrations + réplication fictive testé **localement** (`backend/LOCAL-DATA-FOUNDATION.md`). Le campus actuel est un prototype statique qui persiste un objet `S` complet dans `localStorage` (`js/data.js:396–412`). Il n’est pas connecté au backend de données ni aux trois bases. Ce document **ne signifie pas que la plateforme utilise déjà ces bases**. Ne pas activer la production ou migrer les données de démonstration sans validation, credentials privés et tests de restauration.

## Ordre de service demandé

1. Turso, base principale.
2. CockroachDB, secours si Turso est indisponible.
3. Cloudflare D1, secours si les deux précédentes sont indisponibles.
4. IndexedDB local sur l'appareil, cache de lecture et file d'attente si toutes les bases sont indisponibles ou si le réseau client est coupé.

**Une seule base distante à la fois pour les lectures et écritures applicatives.** Le navigateur ne détient jamais les jetons des trois fournisseurs. Seul un backend authentifié route les opérations, applique rôles/autorisations, reçoit les webhooks et vérifie les paiements. L'état de session/auth ne doit pas être considéré comme sûr parce qu'il est en cache IndexedDB.

## Paramètres de bascule

- Sonde côté backend toutes les **30 secondes**, timeout **2 000 ms** ; **3 échecs consécutifs** avant de quitter la source courante (environ 90 secondes + latence). Ne jamais basculer après un simple échec.
- Une source candidate doit répondre ET avoir un **journal/snapshot vérifié au moins à la révision validée**. Ne jamais lire une sauvegarde obsolète comme si elle était à jour.
- Une seule source traite les commandes à la fois : sélection atomique par *lease* + numéro de génération (*fencing token*) côté backend ; les commandes portant l'ancien numéro sont rejetées. Sans coordination partagée et sans mécanisme de promotion empêchant l'ancien primaire de reprendre des écritures, **pas de bascule automatique sûre en déploiement multi-instance**.
- Le retour automatique vers une source préférée se fait **après rattrapage intégral, vérification de la révision, prise du verrou exclusif, puis promotion**. Deux ou trois sondes de succès consécutives évitent les allers-retours. Tant que le rattrapage échoue, rester sur la source actuelle ; ne jamais effacer la file locale.
- Si aucun secours n'est à jour, l'API refuse les écritures sensibles et le navigateur passe en **mode local explicite**, lit le dernier snapshot autorisé et empile les opérations permises. Ne pas afficher « paiement confirmé », « certificat émis » ou « compte créé » avant accusé signé du serveur.

## Choix validé et hébergement recommandé

Le propriétaire a **autorisé la réplication technique vers les secours**, tandis que les lectures et écritures de l'application restent sur une seule base active. Je recommande **Cloudflare Workers + Durable Object unique pour le contrôle de bascule**, Hyperdrive pour CockroachDB, liaison D1 native, connexion libSQL/HTTP à Turso via secret côté Worker. Cette recommandation minimise les composants à héberger et s'accorde au souhait d'un plan gratuit : CockroachDB est explicitement pris en charge par [Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/cockroachdb/) ; [Hyperdrive est inclus en Free à hauteur de 100 000 requêtes/jour](https://developers.cloudflare.com/hyperdrive/platform/pricing/) ; [les Durable Objects SQLite sont disponibles sur Workers Free](https://developers.cloudflare.com/durable-objects/platform/pricing/).

**Réserve importante** : Cloudflare est alors le fournisseur commun du Worker et de D1. Si Cloudflare lui-même tombe, Turso et CockroachDB peuvent être sains mais inaccessibles *via ce Worker* : le navigateur passe en local. Pour une disponibilité réellement indépendante de Cloudflare, ajouter une seconde API hors Cloudflare (coût/exploitation supplémentaires). Les Cron Triggers de Workers ne descendent pas à 30 secondes : utiliser une **alarme Durable Object** réarmée toutes les 30 s pour le contrôle unique, avec validation de la précision et des coûts avant production. La persistance et le fencing inter-instances ne sont **pas** implémentés par `failover-policy.mjs` : le Durable Object/service de coordination doit encore les assurer, ainsi que l'écriture du journal et la reprise après crash.

## Synchronisation : règle validée et condition de sécurité

Si l'on **interdit toute écriture sur une base inactive, y compris la réplication**, ses données seront en retard dès la première écriture sur la base active. Il est donc impossible de garantir simultanément (1) zéro écriture sur les secours, (2) bascule instantanée, (3) données à jour sans perte. Options :

- **A — recommandée :** une seule base pour le trafic applicatif ; réplication technique/journal sécurisé vers les secours en arrière-plan, les écritures de réplication ne sont pas des commandes applicatives. Vérifier le retard maximal et refuser la promotion d'une cible en retard.
- **B — littérale :** aucune écriture sur les secours ; sauvegardes/snapshots réguliers avec gel des mutations durant la copie. Entre deux snapshots, impossible de promouvoir un secours en sécurité : file locale et attente du rattrapage ou intervention opérateur. Disponibilité réduite mais règle stricte respectée.

Des données et migrations compatibles doivent exister dans SQLite/libSQL (Turso/D1) **et** PostgreSQL (CockroachDB). Conserver le même modèle logique, clés stables, journal immuable, idempotence des opérations et révisions monotones. Migration avec validation des comptes, accès aux cours, montants des ventes, statut des certificats, sans recopier les mots de passe en clair du prototype.

## Mode local IndexedDB

- Snapshot chiffré ou strictement limité aux données non sensibles de l'utilisateur courant ; purge à déconnexion/changement de compte. Le cache **n'est pas une autorité** sur les droits d'accès.
- File d'opérations unitaires `{operationId UUID, utilisateur, type, payload, baseVersion, crééÀ, tentatives}`. Écrire l'opération dans IndexedDB **avant** de l'annoncer comme mise en attente ; si le stockage échoue, avertir l'utilisateur.
- Au retour réseau : synchroniser dans l'ordre, avec accusé durable et idempotent par `operationId` côté serveur. Supprimer une entrée uniquement après accusé du serveur ; reprendre proprement en cas de crash/rechargement. Une erreur de conflit s'affiche et ne doit pas être écrasée silencieusement.
- Ne jamais mettre en file hors ligne des actes irréversibles : validation de paiement, émission/révocation de certificat, création de droits, suppression de compte, élévation de rôle ou actions administratives sensibles.
- Les lectures ne proviennent **que de la source active annoncée par l'API**, ou du snapshot local clairement identifié « hors ligne » ; aucune fusion opportuniste avec une base secondaire.

## Protection des quotas

- Une sonde SQL même `SELECT 1` et le trafic de réplication **consomment potentiellement** des ressources/facturation ; « 30 secondes » et « zéro consommation » ne sont pas simultanément garantissables. Une seule boucle de santé côté serveur/cluster (pas une sonde par téléphone ou onglet) : 2 880 sondes/jour/source, environ 86 400/mois/source avant autres appels, et plus si les secours sont aussi sondés. Prévoir des budgets et compter les RU/lignes par fournisseur ; ne pas confondre requêtes et lignes lues/écrites.
- Index sur toutes les clés de recherche (id utilisateur, formation, `operationId`), colonnes sélectionnées explicitement, pagination, cache court des listes publiques, agrégation des métriques, écriture seulement à l'événement, pas à chaque rendu ni heartbeat client. Sondes minimales et backoff des fournisseurs hors service, **si** un backoff plus long que 30 s est autorisé par l'exigence.
- Garde budgétaire à 80 % et 95 % des enveloppes, arrêt des tâches facultatives et alertes ; jamais sacrifier les opérations critiques en changeant de base pour économiser sans vérifier son retard et son budget. Une facturation zéro absolue ne peut être promise avec une limite gratuite : vérifier les réglages de plafond chez chaque fournisseur.

**Quotas indicatifs vérifiés sur les pages officielles (à revalider au déploiement)** : Turso Free 500 M lignes lues/mois, 10 M lignes écrites/mois, 5 Go ([Turso](https://turso.tech/pricing)) ; CockroachDB Basic 50 M RU/mois et 10 Gio ([CockroachDB](https://www.cockroachlabs.com/pricing/)) ; Cloudflare D1 Workers Free 5 M lignes lues/**jour**, 100 000 écrites/**jour**, 5 Go ([D1](https://developers.cloudflare.com/d1/platform/pricing/)). Le chiffre « 150 M lectures/jour » pour D1 est incorrect : c'est approximativement **150 M/mois** si l'utilisation quotidienne reste à 5 M.

## Ressources de test reçues (1er octobre 2026)

Les trois ressources staging sont identifiées : D1 `436b9bcc-defa-459c-a60b-0c7af6ff11a3`, Turso `libsql://davar-campus-staging-davar-academie.aws-eu-west-1.turso.io`, cluster CockroachDB `0d5289ae-5d2e-4187-b3df-478d0d023e18` relié au binding Hyperdrive `8e492523d22b4224af272f22bcc4352e`. Ce sont des identifiants/adresse non secrets, **pas des accès**. La procédure détaillée, la configuration Worker et les étapes bloquantes sont dans `backend/STAGING.md`. Aucun fournisseur n'a encore été contacté par l'app.

## Avancement concret dans le dépôt

- `backend/failover-policy.mjs` : politique isolée à sources ordonnées, sondes timeout 2 s, 3 échecs, retour après 3 succès et validation de révision, repli local si aucune source à jour. Elle requiert `promote` (verrou atomique persistant) et `caughtUp` (preuve de rattrapage), volontairement non simulés en production.
- `backend/failover-policy.test.mjs` : 6 scénarios mockés passants, dont fournisseur en retard, absence de quorum et timeout. **Aucune base externe sollicitée, aucun jeton enregistré.**
- `backend/LOCAL-DATA-FOUNDATION.md` : scripts SQL préparés pour les deux dialectes, 15 tests SQLite de migration/réplication fictive + garde quotas en tests JS. Aucun schéma appliqué aux fournisseurs réels.
- Le campus reste dans son mode démo localStorage, volontairement non connecté au prototype de politique : pas d’écriture de données réelles et pas d’affichage trompeur d’une bascule active.

## Mise en œuvre par étapes

1. Choix préliminaires : réplication technique autorisée, Workers recommandé. Créer les instances des trois bases, un Worker/DO, Hyperdrive et des environnements **staging**, sans jamais inclure leurs accès dans le code côté navigateur. Vérifier la politique de coûts/plafonds Cloudflare et l’acceptation du point commun Cloudflare.
2. Définir modèle/version de schéma communs, auth serveur, migrations, endpoints transactionnels et tests de conformité de chaque adaptateur.
3. Tester sur jeux de données fictifs : 3 pannes consécutives, timeouts 2 s, promotions, retours, secours en retard, split-brain, conflits et plafonds de quota.
4. Ajouter le cache et la file IndexedDB ; tests sur deux appareils et reconnexion, jamais de paiement confirmé hors ligne.
5. Sauvegarder et migrer les données **réelles** seulement après approbation distincte ; aucune purge de production n'est autorisée par ce document.
