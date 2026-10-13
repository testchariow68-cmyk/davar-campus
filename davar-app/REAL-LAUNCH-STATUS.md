# DAVAR Campus — mise en service réelle de `davar-app/`

**Décision utilisateur :** application Next.js `davar-app/`, cible publique progressive, Turso **seule** base applicative ; **paiements dans l'app reportés** jusqu'à ce que le reste fonctionne. Une base Turso de production **distincte** existe selon le propriétaire ; des accès sandbox Flutterwave et MoneyFusion existent, mais le statut LIVE est inconnu, **aucun identifiant/secret n'a été fourni ici**. Le propriétaire **refuse Workers Paid pour l'instant**. **L'accès étudiant après achat Chariow externe doit être automatisé**, avant les paiements intégrés (choix explicite du propriétaire). Le webhook est codé en mode fermé, **pas encore opérationnel ni branché sur le marchand** ; CinetPay est exclu. Aucune création de base ou purge.

## Mise à jour du 6 octobre 2026 — authentification et campus réellement utilisables (en local)

Nouvelle tranche livrée sur la branche `arena/09f3da07-davar-campus` : voir
[`MISE-EN-SERVICE.md`](MISE-EN-SERVICE.md) pour le détail, les commandes et les
preuves. En résumé, et sans embellissement :

- **Comptes réels, serveur uniquement** : inscription, confirmation d'e-mail à
  usage unique, connexion/session hachée, déconnexion, suspension, limitation de
  débit en base, contrôle d'origine obligatoire. Mot de passe PBKDF2-HMAC-SHA256
  à 600 000 itérations (plancher 210 000 hors développement), Argon2id non
  portable sans dépendance native — point à revoir avec l'hébergeur.
- **Campus réel** : `/campus` et `/campus/formation/<id>` lisent les modules,
  leçons et la progression ; une formation non achetée renvoie 404 ; la
  progression exige une inscription vérifiée.
- **Achat Chariow externe automatisé** : le rattachement de la vente au compte
  n'a lieu qu'après confirmation de l'e-mail, de façon idempotente. Vérifié en
  local sur le cas « achat avant création du compte ».
- **Migration 002 additive** (`turso/migrations/002_auth_campus.sqlite.sql`),
  jamais appliquée à une base hébergée ; `scripts/staging-schema.mjs` devient un
  manifeste fermé couvrant 001+002 (empreintes et DDL revus).
- **Toujours interdit tant que non prouvé** : Pulse Chariow activé
  (`CHARIOW_ENABLE_PULSE` reste `false` → 503), envoi d'e-mails réel
  (hors développement, l'inscription est refusée plutôt que de créer un compte
  invérifiable), paiements Flutterwave/MoneyFusion, reset de mot de passe,
  déploiement. **Aucune base hébergée n'a été lue ni écrite ; rien n'est en
  ligne.**
- **Blocage du plan Cloudflare gratuit : LEVÉ, sans payer et sans affaiblir le
  hachage.** PBKDF2 à 600 000 itérations coûte ~121 ms de CPU, au-delà des 10 ms
  par requête de Workers Free : le hachage est donc **délégué** à un service
  auto-hébergeable livré dans ce dépôt (`auth-kdf-service/`, zéro dépendance,
  signature HMAC, plafond journalier), destiné à une offre gratuite mesurée en
  temps CPU mensuel (Oracle Always Free, Cloud Run free tier, ou la machine de
  l'opérateur). Le reste tient dans les offres gratuites Cloudflare/Turso/Brevo.
  Voir **[`ARCHITECTURE-GRATUITE.md`](ARCHITECTURE-GRATUITE.md)** : objectif tenu
  de 0 € jusqu'à 3 000 étudiants actifs, avec budget de charge chiffré et
  protection des quotas (`/api/internal/quota`).

## État honnête de ce livrable

- **Pas de mise en ligne ni d'écriture hébergée.** Le diagnostic staging précédent prouve la connectivité à Turso du Worker de diagnostic, pas de cette application Next.js ni de la base Turso de production.
- Nouvelle proposition de schéma versionné `turso/migrations/001_core.sqlite.sql` : utilisateurs/sessions et email vérifié, formations liées au produit Chariow, achats vérifiés et livraisons Pulse uniques, inscriptions liées à une vente, intentions/événements des paiements futurs. Elle est testée **sur SQLite en mémoire seulement** ; elle n'est pas appliquée à Turso. Aucun compte, paiement, cours ni accès inséré. Le fichier `turso/schema.sql` antérieur **n'est pas à appliquer** : il contient des choix abandonnés, dont CinetPay et un moteur de purge.
- Nouveau module serveur `lib/server/turso.ts` et route privée `GET /api/internal/turso-readiness` : requête `SELECT 1` uniquement ; secret de diagnostic requis, contrôle de `APP_ENV`, de l'hôte attendu et refus d'une URL staging en environnement production. La **page d'accueil** peut maintenant lire `trainings` publiées sur Turso (maximum 30, cache de 60 s par instance) et affiche un état indisponible sans mentir si le schéma/base n'est pas prêt. Aucune information d'étudiant ni droit d'accès n'est lu ; aucun bouton de paiement n'est actif. L'accès en lecture et le build ne démontrent ni les droits d'écriture ni la compatibilité d'un schéma hébergé. Ne pas réutiliser un jeton lecture seule pour des opérations d'administration.
- **Parcours publics verrouillés par défaut** : les pages de connexion/inscription n'appellent plus Supabase ; le proxy et le layout refusent l'accès au campus tant que l'auth serveur Turso n'est pas implémentée. Les routes d'ancien checkout et webhook CinetPay répondent 503 ; le callback Supabase répond 410. Le webhook Chariow reste **fermé par défaut** (`CHARIOW_ENABLE_PULSE=false`, donc 503), même si son circuit serveur est désormais préparé : signature HMAC des octets bruts, identifiants du Pulse/livraison et événement contrôlés, relecture `GET /v1/sales/{id}` avec clé API, rapprochement boutique/vente/produit/email/montant et statut payé, puis transaction libSQL pour achat + livraison + droit seulement si email du compte déjà vérifié. Achat pré-inscription : reçu en attente de réclamation par un compte dont l'email est confirmé. Il manque encore **l'authentification et le branchement de la réclamation**, la recette Turso staging, les essais de vrais Pulse/Get Sale, la politique de retrait en cas de remboursement et le déploiement. **Ne pas configurer cette URL côté marchand ni activer le drapeau avant ces validations** ; sinon les livraisons rencontreraient des 503.
- Flutterwave/MoneyFusion ne sont **pas encore intégrés** : avoir des comptes sandbox n'autorise pas à facturer. En particulier, il manque la création d'intention côté serveur, le calcul du montant depuis le catalogue de confiance, la vérification de signature et du statut auprès du fournisseur, la déduplication persistante, et l'attribution atomique du droit d'accès. Le journal Chariow est proposé localement, sans preuve d'écriture hébergée ni traitement d'une vente réelle. Ne jamais considérer un retour navigateur `?paid=1` comme preuve de paiement.
- `lib/supabase/*`, `lib/payments/cinetpay.ts`, les composants et les documents historiques sont **conservés** pour inspection, mais retirés du chemin actif. Aucun fichier utilisateur n'a été purgé. `.env.local` n'a été ni ouvert, ni copié, ni modifié. Le build de validation est effectué sur une **copie sans fichiers `.env*`**.

Contrat utilisé : [sécurité Pulse](https://chariow.dev/fr/guides/pulse-security) (HMAC-SHA256 du corps brut ; `whsec_` distinct de la clé API ; ID de livraison absent des essais), [format Pulse](https://chariow.dev/fr/guides/pulses) (`successful.sale`) et [Get Sale](https://chariow.dev/api-reference/sales/get-sale.md) (`data` et vente détaillée). Les exemples de guides ne remplacent pas une recette sur le compte marchand.

## Vérifications faites

- `python3 -m unittest -q tests/test_turso_core.py` : **9 tests SQLite locaux réussis** (dont rejouement des requêtes du journal Chariow et achat antérieur au compte vérifié). `node --experimental-strip-types --test tests/chariow-*.test.mjs` sous Node 22 : **5 tests réussis**, signature sur octets bruts et comparaison Pulse/Get Sale. TypeScript `tsc --noEmit` sur copie sans `.env*` : réussi.
- `Next.js 16.3.6` : **build complet après ajout du webhook réussi sous Node 22 avec Webpack** (`npm run build -- --webpack`) sur copie sans `.env*` ; la route `/api/chariow/pulse` figure dans les sorties. Une tentative avec le Turbopack par défaut a été tuée par l'environnement pendant la compilation (`Killed`) : **le build Turbopack récent n'est pas validé**. **Aucun test de transaction Turso distante, de vrai Pulse ou du runtime Workers n'a été effectué.**

## Préparation au premier déploiement privé (2 octobre 2026)

Le propriétaire a choisi **un déploiement privé d'abord**, et a autorisé **la préparation** d'une migration staging après inventaire/présentation des commandes, **pas son exécution immédiate**. Voir [`DEPLOIEMENT-PRIVE-STAGING.md`](DEPLOIEMENT-PRIVE-STAGING.md) pour les barrières précises. `vite.config.ts` et `cloudflare.config.ts` préparent un Worker distinct sans D1/KV/Images, avec `workersDev:false` et `previewUrls:false`. `vinext` et ses dépendances (React Server DOM épinglé sur React 19.2.8) sont ajoutés sans supprimer Next.js. Build vinext et typage réussis sur copie **sans `.env*`** ; test local Workers : accueil/connexion 200, campus 307, Chariow et sonde sans configuration 503. Le propriétaire a préparé un Worker à l'URL `https://davar-campus-next-staging-2026.davaracademie.workers.dev/` : trois requêtes anonymes sur `/`, la sonde et le webhook sont toutes redirigées (302) vers Cloudflare Access. Cette vérification confirme la protection de ces chemins sans connexion, **pas le déploiement du code DAVAR** ni l'accès authentifié. Les accès Cloudflare et Turso staging restent absents des variables d'environnement de cette session ; **aucun déploiement, lecture ou écriture Turso hébergée**. `scripts/staging-inventory.mjs` est prêt pour un inventaire strictement en lecture seule lorsque l'accès privé sera présent. Aucune migration n'a été exécutée.

## Hébergement choisi (non déployé)

Le propriétaire a délégué le choix. **Cible retenue : Cloudflare Workers pour `davar-app/`, sous un Worker et une route distincts du diagnostic staging**, car Cloudflare est déjà utilisé pour le diagnostic et évite d'engager sans accord un hébergeur commercial supplémentaire. Cloudflare recommande actuellement **vinext** pour les apps Next.js 16 existantes, mais le qualifie de **bêta** : https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ . **Le propriétaire refuse Workers Paid pour le moment** : Workers Free limite le temps CPU par requête à 10 ms (https://developers.cloudflare.com/workers/platform/limits/) ; impossible de considérer ce quota comme validé pour un Next.js SSR authentifié ou un hash de mot de passe Argon2id sans mesure réelle. Aucun compromis sur la sécurité des mots de passe n'est autorisé pour respecter ce plafond. Avant une ouverture publique, prouver les performances sur le plan choisi ou revoir l'hébergement/le mode d'authentification avec le propriétaire. Après ajout de `"type": "module"`, l'outil `vinext check` exécuté sur une copie du projet **sans `.env*`** rapporte **100 % compatibles sur les éléments qu'il analyse (9 pris en charge, 0 problème)**. Le build natif Next.js 16.3.6 passe aussi sous Node 22. **Ce contrôle statique ne démontre ni compatibilité runtime, ni sécurité des paiements, ni hash Argon2id sur Workers.** Ne pas déployer avant build/essais sur Workers et revue des coûts/quotas. Alternative si un blocage vinext persiste : hébergement Next.js natif sur Vercel, **mais** la formule Hobby y est limitée à l'usage personnel non commercial : https://vercel.com/docs/plans/hobby ; demander accord sur un plan commercial avant ce changement.

## Étapes obligatoires avant un vrai lancement public

1. Valider en environnement privé Cloudflare Workers la compatibilité vinext et les limites du runtime (notamment le hash Argon2id) ; préparer authentification serveur, mot de passe sécurisé, sessions hashées et cookies sécurisés, rôles, anti-CSRF/rate-limit et vérification d'e-mail. L'email du compte doit être confirmé avant de rattacher une vente ; aucun accès au cours sur seule possession d'une adresse, ni sur retour navigateur non vérifié.
2. Réviser le schéma proposé avec les fonctions réellement voulues, préciser la conservation des données (aucune purge automatique activée), préparer migration/checksum transactionnels, inventaire et restauration ; tester **sur Turso staging**, uniquement sur comptes/données fictifs et avec accord d'écriture distinct. Ne pas appliquer le SQL à la base Turso production avant test et revue séparée.
3. **Priorité décidée :** rendre réels les cours et l'authentification/permissions avec email vérifié ; mapper les produits Chariow sur les formations Turso staging ; tester sur staging le Pulse signé, Get Sale, les réessais, les achats avant compte, le lien après confirmation d'email et le retrait des accès lors d'un litige/remboursement. Le serveur ne doit réclamer une vente que pour son email vérifié. Contrôler également le comportement à chaud des transactions libSQL et l'efficacité sous Workers Free ; maintenir le webhook désactivé jusqu'à réussite et revue. Les ventes antérieures au branchement du Pulse nécessiteraient une procédure de rapprochement séparée vérifiée par API, non implémentée.
4. **Plus tard, après le cœur fonctionnel et Chariow externe :** implémenter/tester Flutterwave et MoneyFusion dans l'app en sandbox, puis en LIVE uniquement avec justificatifs d'état et revue de production. Paiement non confirmé = aucun droit accordé ; zéro simulation présentée comme réel. Pas de CinetPay.
5. Vérifier autorisations multi-utilisateurs, cours/progression, erreurs/réessais, sauvegarde/restauration, coûts et observabilité ; déployer d'abord sous environnement privé, puis seulement après revue de sécurité, du domaine, des secrets et du plan de retour arrière, demander validation explicite pour ouvrir les fonctionnalités publiques achevées.

**Conclusion : première tranche de code préparée et verrouillée. L'application n'est PAS encore opérationnelle pour des comptes ou paiements réels.** Ne pas déployer cette branche comme un lancement public : elle affiche volontairement des écrans d'attente et refuse les opérations sensibles.
