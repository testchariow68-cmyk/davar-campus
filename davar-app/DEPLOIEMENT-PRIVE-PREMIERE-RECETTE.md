# Déploiement privé — ce que vous lancez, ce que je vérifie

> **Objectif :** voir DAVAR tourner réellement sur Internet, derrière l'accès privé
> Cloudflare, **avant** toute ouverture publique. Coût : **0 FCFA**, Worker Free,
> aucun domaine à acheter. Établi le 6 octobre 2026.

## Pourquoi c'est vous qui lancez la commande

Mon environnement n'a **aucun accès à votre compte Cloudflare** — et il ne doit pas en avoir :
je ne vous demanderai jamais de jeton, de mot de passe ni de secret dans le chat. Le
déploiement se fait donc depuis **votre PC**, où votre session Cloudflare est déjà ouverte. Moi,
je prépare, vous lancez, je vérifie ensuite avec vous ce que la recette donne.

## Prévol déjà exécuté de mon côté (6 octobre 2026)

J'ai construit l'application et l'ai lancée dans le **vrai runtime Cloudflare (workerd)**, en
configuration de production : **12 contrôles sur 12 réussis**.

| Contrôle | Résultat |
|---|---|
| Accueil et connexion servis en coquilles statiques | ✅ (assets gratuits et illimités) |
| Aucune donnée en dur dans le HTML | ✅ le navigateur va la chercher |
| `/campus` sans session → redirection vers la connexion | ✅ 307 |
| Webhook Chariow fermé | ✅ 503 |
| Checkout dans l'application inactif | ✅ 503 |
| Diagnostic sans jeton / avec un mauvais jeton | ✅ 401 (authentification **avant** tout travail) |
| Base injoignable → l'application l'annonce, n'invente rien | ✅ 503 « unavailable » partout |

**Défaut corrigé grâce à ce prévol :** `APP_DIAGNOSTIC_TOKEN` n'était **pas déclaré** comme secret
du Worker. Un secret saisi dans le tableau de bord mais non déclaré dans la configuration
n'atteint jamais l'application : la route aurait répondu « not_ready » pour toujours. Corrigé.

**Limite honnête de ce prévol :** workerd n'a aucun accès au système de fichiers, donc la base
SQLite locale y est injoignable par construction. Les parcours qui dépendent de la base
(inscription, connexion, campus, catalogue réel) ne peuvent se prouver que **sur le Worker
déployé avec le vrai Turso staging** — c'est justement l'étape 5 ci-dessous.

## Ce qui est déjà prêt

| Élément | État |
|---|---|
| Configuration du Worker | `cloudflare.config.ts` — Worker distinct `davar-campus-next-staging-2026`, `APP_ENV=staging`, hôte Turso staging épinglé, `previewUrls:false`, `workersDev:true`, `AUTH_KDF_MODE=client` |
| Secrets attendus par le Worker | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (déjà installés par vous), plus `AUTH_PARAMS_SECRET`, `AUTH_VERIFIER_PEPPER`, `APP_DIAGNOSTIC_TOKEN` — **les cinq sont désormais déclarés** dans la configuration |
| Migration de la base | revue + **répétition locale réussie** (`REVUE-MIGRATIONS-STAGING-002-004.md`) |
| Build Workers | `npm run build:vinext` vérifié |
| Protection privée | Cloudflare Access « tout le trafic » déjà actif sur ce Worker |

## Ordre exact

### 1. Récupérer la version à jour du code (sur votre PC)

Le dépôt GitHub `testchariow68-cmyk/davar-campus` contient le travail. Récupérez la branche
`arena/09f3da07-davar-campus` (ou téléchargez l'archive ZIP de cette branche via GitHub →
bouton **Code** → **Download ZIP**), puis dans le dossier `davar-app` :

```powershell
npm ci
npm run rehearsal:staging     # doit finir par « RÉUSSITE »
```

### 2. Appliquer la migration à la base staging

Suivez `REVUE-MIGRATIONS-STAGING-002-004.md` §6 (inspection d'abord, puis `-Apply` avec la phrase
de confirmation). **Ne passez à l'étape 3 que si la sortie indique 16 tables et 4 reçus.**

### 3. Ajouter les trois secrets manquants

Tableau de bord Cloudflare → votre Worker `davar-campus-next-staging-2026` →
**Settings → Variables and Secrets**. Ajoutez, en cochant **Secret** pour chacun :

| Nom | Valeur | Règle |
|---|---|---|
| `AUTH_PARAMS_SECRET` | une chaîne aléatoire | **32 caractères minimum** |
| `AUTH_VERIFIER_PEPPER` | une autre chaîne aléatoire | **16 caractères minimum** |
| `APP_DIAGNOSTIC_TOKEN` | une troisième chaîne aléatoire | **32 caractères minimum** |

Générez-les sur votre PC, par exemple dans PowerShell :
`-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})`

⚠️ **Ne les collez ni dans ce chat, ni dans un fichier du projet.** Deux secrets existent déjà
(`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) : n'y touchez pas.

### 4. Construire puis publier

```powershell
npx cf deploy --dry-run     # construit sans rien envoyer : doit finir par « Dry run complete »
npx cf deploy               # la vraie publication
```

Ce que la publication fait : elle envoie **le code de l'application** sur le Worker existant.
Elle ne touche ni au Worker de diagnostic, ni à la base de production, ni à vos données.

### 5. Recette immédiate (à me rapporter)

Ouvrez dans une fenêtre **de navigation privée** (aucune session Cloudflare) :

1. `https://davar-campus-next-staging-2026.davaracademie.workers.dev/` → doit **rediriger** vers
   la page de connexion Cloudflare Access (le campus reste privé).
2. Puis, connecté à Access : la page d'accueil doit afficher **« Formations Davar Académie »**,
   le catalogue (catégorie « Davar Académie »), et un bandeau signalant que les paiements
   intégrés ne sont pas activés.
3. `/connexion` → l'écran doit demander un e-mail et un mot de passe, et **aucune erreur** ne doit
   apparaître.
4. `/api/internal/quota` avec l'en-tête `Authorization: Bearer <votre APP_DIAGNOSTIC_TOKEN>` →
   doit renvoyer les compteurs de quotas et confirmer le mode de dérivation `client`.

**Ce qui doit rester fermé** — si l'un de ces points ne l'est pas, on arrête tout :
`/api/chariow/pulse` → **503**, pas de paiement encaissable dans l'application, `/campus` sans
session → redirection vers la connexion.

### 6. Ce que vous me rapportez (jamais un secret)

- Le contenu affiché à l'écran (une capture est parfaite, **vérifiez qu'aucun jeton n'apparaît**).
- La sortie de `npx cf deploy` (les dernières lignes suffisent).
- Toute erreur, mot pour mot.

## Ce qui ne sera pas encore testable à l'étape 5 (et pourquoi)

La recette privée prouve le catalogue, la protection, les états fermés et le diagnostic. Elle ne
prouve **pas encore** le parcours étudiant complet (inscription → e-mail → campus), pour une
raison précise : en environnement de staging, l'application **refuse l'inscription si aucun
service d'e-mail n'est configuré** (aucune fausse promesse de compte). Pour l'essayer pour de
vrai, il faudra ajouter la clé Brevo (gratuite, 300 e-mails/jour) et déclarer
`MAILER_KIND`, `BREVO_API_KEY`, `MAIL_FROM_EMAIL` comme secrets du Worker. C'est l'étape
suivante, après votre retour sur cette première recette.

## Après ce premier déploiement privé

1. Je corrige ce que la recette révèle — c'est le but de l'exercice.
2. Puis je porte le **cœur pédagogique réel** (chapitres, modules, leçons, lecteur vidéo R2 signé,
   progression verrouillée à 100 %, enrichissement silencieux), comme vos documents le prescrivent.
3. Ensuite : exercices et évaluations, certifications, récompenses, administration, temps réel.
4. L'ouverture publique viendra en dernier, après revue explicite du propriétaire.

## Rappels de sécurité

- Le dépôt GitHub est **public** : il ne doit jamais contenir `.env.local`, les ZIP de déploiement
  ni un document avec un identifiant.
- Votre `rapport-audit.md` contient un compte réel et son mot de passe en clair : **changez ce mot
  de passe** et ne partagez plus ce document.
