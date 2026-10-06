# Mise en service réelle — le chemin le plus court, sans mensonge

> Décision du propriétaire : **aller droit au déploiement public**, sans passer par la recette
> privée. Ce document dit exactement ce que cela implique, ce qui est prêt, ce qui manque, et
> les commandes. Établi le 6 octobre 2026.

## 1. Pourquoi c'est vous qui déployez, et pas moi

Mon environnement n'a **aucun accès à votre compte Cloudflare** — et il ne doit pas en avoir :
je ne vous demanderai jamais un jeton, un mot de passe ou un secret dans le chat. La publication
se fait depuis **votre PC**, où votre session Cloudflare est déjà ouverte. Moi, je prépare, je
vérifie, je corrige.

## 2. Ce que votre propre protocole exigeait — et le choix que vous faites

Vos documents demandaient une **recette privée d'abord** (`DEPLOIEMENT-PRIVE-STAGING.md`, barrière 5).
Aller directement en public signifie que **le premier contact réel avec le runtime se fera devant
de vrais étudiants**. C'est votre décision et elle est défendable : l'application a été vérifiée
dans le vrai runtime Cloudflare en local (**12 contrôles sur 12**), la migration a été rejouée
(**24 contrôles au vert**), et les 53 tests Node passent. Ce n'est pas une garantie de terrain,
c'est ce qu'on peut prouver sans compte Cloudflare.

En revanche, **une chose n'est pas négociable** : ne mettez **pas** Cloudflare Access devant ce
Worker public. Vos propres documents l'ont identifié comme le piège mortel (limite gratuite de
50 utilisateurs → 21 000 $/mois à 3 000 étudiants). Le campus se protège par sa propre
authentification : mots de passe dérivés dans le navigateur, sessions signées, quotas et
limitations de débit.

## 2 bis. Parcours réel vérifié de bout en bout (6 octobre 2026)

Avant de vous laisser ouvrir au public, j'ai rejoué le **parcours complet d'un étudiant**, avec un
simulateur local du relais e-mail qui applique **exactement** le contrat du script fourni.
**12 contrôles sur 12 réussis :**

| Étape | Résultat |
|---|---|
| Paramètres de dérivation (600 000 itérations) | ✅ |
| Inscription — mot de passe dérivé dans le navigateur | ✅ 201 |
| Aucun lien de confirmation renvoyé au navigateur (il part par e-mail) | ✅ |
| Connexion **avant** confirmation | ✅ refusée (403) |
| E-mail remis au relais, destinataire et lien conformes | ✅ |
| Lien de confirmation conforme à l'origine publique configurée | ✅ |
| Adresse confirmée, puis connexion | ✅ 200 |
| Campus accessible, message honnête sans accès | ✅ |
| Accès accordé (`grant`), formation visible sur le campus | ✅ |
| Cours ouvert : 2 modules, 5 leçons, progression 0/5 | ✅ |

Le contenu affiché est exact : les leçons dont la ressource n'est pas encore en ligne annoncent
« Ressource pas encore publiée » au lieu d'un lecteur vide.

## 3. Les prérequis à obtenir d'abord (rien ne marche sans eux)

### a) La base Turso de PRODUCTION
Vos documents indiquent qu'une base de production distincte existe. Il me faut **son hôte exact**
(quelque chose comme `davar-campus-production-<compte>.<region>.turso.io`) et **un jeton d'écriture
temporaire** pour y appliquer le schéma — jeton que vous supprimerez juste après. **Ne me les
envoyez pas** : ils se saisissent dans votre terminal et dans le tableau de bord Cloudflare.

Ensuite, créez un **second jeton, lecture-écriture, limité à cette base**, qui servira de secret
applicatif au Worker. Le jeton de migration, lui, se supprime.

### b) L'envoi des e-mails — votre choix : Google Apps Script
Sans relais d'e-mail, **l'inscription est refusée en 503** : c'est volontaire, on ne crée pas un
compte dont on ne peut pas confirmer l'adresse.

**Le script est prêt à coller : `apps-script/Relais-e-mail.gs`.** Marche à suivre :

1. Ouvrez <https://script.google.com> depuis le compte Google de l'académie → **Nouveau projet**.
2. Effacez tout et collez le contenu du fichier.
3. **Projet → Propriétés du script** → ajoutez `DAVAR_MAIL_SECRET` = une longue chaîne aléatoire
   (32 caractères ou plus). C'est votre jeton.
4. **Déployer → Nouveau déploiement → Application Web** : exécuter en tant que **moi**, accès
   **tout le monde** (c'est le jeton, pas la connexion Google, qui protège l'accès).
   Google affiche un avertissement : c'est votre propre script → *Paramètres avancés* → *Accéder*.
5. Copiez l'**URL de l'application Web** (elle finit par `/exec`).

Puis, dans le tableau de bord Cloudflare, en **Secret** :
`MAIL_APPS_SCRIPT_URL` (l'URL `/exec`) et `MAIL_APPS_SCRIPT_TOKEN` (la valeur de l'étape 3).
Le `MAILER_KIND` est déjà réglé sur `apps_script` dans la configuration.

Le script fourni : refuse tout appel sans le bon jeton (comparaison à durée constante), vérifie
l'adresse du destinataire, applique un **plafond de 250 envois par jour** pour ne jamais faire
bloquer votre compte Google, et répond en JSON. Le contrat `{secret, to, subject, text}` est
**figé par un test** : si un côté change, l'autre casse bruyamment au lieu de casser en silence.

### c) Le catalogue : une seule formation, décision prise
Votre décision est appliquée : **seule « Devenir un excellent orateur » reste au catalogue**,
avec son lien Chariow (`prd_6wx1czzp`). Les trois autres ont été retirées du code. Si le lien a
changé, envoyez-le et je le remplace.

Deux outils pour cela :
- `catalog` **refuse de publier** une formation sans lien d'achat : une formation visible mais
  non achetable serait un mensonge ;
- `catalog --apply --prune` retire du catalogue ce qui n'est plus déclaré — mais une formation
  **déjà achetée n'est jamais supprimée** : elle est seulement dépubliée, car une vente est une
  pièce comptable.



## 4. La séquence exacte

```powershell
# 0. Récupérer la version à jour du code (branche arena/09f3da07-davar-campus), puis :
npm ci
npm run rehearsal:staging        # répétition locale de la migration — doit finir par « RÉUSSITE »
npm test                         # 63 tests — doivent tous passer

# 1. Schéma de la base de PRODUCTION (inspection d'abord, écriture ensuite)
& .\scripts\run-production-schema.ps1
& .\scripts\run-production-schema.ps1 -Apply     # tapez : APPLIQUER DAVAR PRODUCTION

# 2. Déployer le Worker public (Worker DISTINCT de la recette)
$env:DAVAR_DEPLOY_TARGET = 'production'
$env:DAVAR_PRODUCTION_DB_HOST = '<hôte exact de votre base de production>'
$env:DAVAR_PUBLIC_ORIGIN = 'https://davar-campus-production-2026.<votre-sous-domaine>.workers.dev'
npx cf deploy --dry-run          # construit sans rien envoyer
npx cf deploy                    # publication réelle
```

Puis, dans le tableau de bord Cloudflare → Worker `davar-campus-production-2026` →
**Settings → Variables and Secrets**, à saisir en **Secret** :

| Nom | Contenu |
|---|---|
| `TURSO_DATABASE_URL` | URL libsql de la base de production |
| `TURSO_AUTH_TOKEN` | le jeton applicatif lecture-écriture créé à l'étape 3a |
| `AUTH_PARAMS_SECRET` | chaîne aléatoire de 32 caractères minimum |
| `AUTH_VERIFIER_PEPPER` | chaîne aléatoire de 16 caractères minimum |
| `APP_DIAGNOSTIC_TOKEN` | chaîne aléatoire de 32 caractères minimum |
| `MAIL_APPS_SCRIPT_URL` | l'URL `/exec` de votre script Google Apps Script (étape 3b) |
| `MAIL_APPS_SCRIPT_TOKEN` | le secret `DAVAR_MAIL_SECRET` de ce script (16 caractères minimum) |

`DAVAR_MAILER` est facultatif : sans lui, le relais **Google Apps Script** est utilisé. Une valeur
inconnue fait **échouer la construction** plutôt que d'envoyer un e-mail par un chemin non prévu.

⚠️ Si vous modifiez un secret dans le tableau de bord, Cloudflare **republie une version** du
Worker : faites-le avant la recette finale, puis recontrôlez.

## 4 bis. Graver votre compte propriétaire (Super Admin)

Sans ce compte, personne ne peut diriger la plateforme : ni ajouter un cours, ni une leçon, ni
nommer un membre d'équipe. Il se crée **une fois**, directement dans la base :

```powershell
# La cible doit être explicite. Pour la production :
$env:DAVAR_OPS_TARGET = 'production'
$env:TURSO_DATABASE_URL = '<URL libsql de la base de production>'
$env:TURSO_AUTH_TOKEN  = '<jeton applicatif>'
$env:TURSO_EXPECTED_HOST = '<hôte exact de la base>'

node --experimental-strip-types scripts\create-admin.mjs
```

Le script demande l'e-mail, le nom affiché, puis le mot de passe en **saisie masquée**. Le mot de
passe ne quitte jamais votre machine : il est dérivé sur place (PBKDF2-SHA256, 600 000 itérations,
exactement comme le navigateur d'un étudiant) et seule la clé dérivée est écrite. Rien n'est
journalisé, rien n'est transmis.

Trois garanties : le compte est marqué **admin**, son adresse est **déjà confirmée** (vous êtes le
propriétaire, il n'y a aucun e-mail à valider), et le script **refuse de créer un second
propriétaire** — le projet en prévoit un seul. Pour changer le mot de passe plus tard, relancez-le
avec la **même adresse** : il met à jour au lieu de dupliquer.

## 4 ter. L'Espace Direction : diriger sans ligne de commande

Une fois connecté, l'adresse **`/direction`** (ou le bouton « Direction » en haut du campus) ouvre
l'espace du propriétaire :

| Écran | Ce que vous y faites |
|---|---|
| **Vue d'ensemble** | Chiffres réels : étudiants, adresses confirmées, accès, achats, contenu. Plus la purge du contenu d'essai. |
| **Formations** | Créer une formation, l'enregistrer, l'ouvrir ou la fermer, la supprimer. |
| **Construire** | Ajouter vos modules et vos leçons, choisir leur type (vidéo, texte, exercice, séance en direct), leur durée, leur adresse de ressource, et les réordonner. |
| **Étudiants** | Voir qui est inscrit, ouvrir un accès à la main, le retirer, suspendre ou réactiver un compte. |
| **Équipe** | Nommer un membre du staff, ou transférer la propriété. |

Deux règles y sont appliquées par le serveur, jamais par le navigateur :

- **une formation vide ne s'ouvre pas** : sans au moins une leçon, l'ouverture est refusée avec le
  compte exact (« l'étudiant paierait pour une page blanche ») ;
- **la progression ne se supprime pas en silence** : si un étudiant a déjà terminé une leçon ou un
  module, la suppression est refusée — vous pouvez en revanche renommer la leçon ou remplacer sa
  ressource, ce qui ne réinitialise rien.

## 5. Le catalogue et les accès, sans attendre le webhook

```powershell
# Importer le catalogue (une seule formation ouverte à la vente)
node --experimental-strip-types scripts\production-ops.mjs catalog            # aperçu
node --experimental-strip-types scripts\production-ops.mjs catalog --apply
# …et nettoyer ce qui ne serait plus déclaré, si besoin :
node --experimental-strip-types scripts\production-ops.mjs catalog --apply --prune

# Servir un acheteur réel : il crée son compte, confirme son e-mail, PUIS vous accordez l'accès
node --experimental-strip-types scripts\production-ops.mjs whois --email acheteur@exemple.com
node --experimental-strip-types scripts\production-ops.mjs grant --email acheteur@exemple.com --training t-orateur --apply
```

Ces deux commandes demandent `DAVAR_OPS_TARGET=production`, l'URL et un jeton de la base, et
refusent tout hôte de recette. Elles **n'écrivent rien sans `--apply`**, refusent un compte non
confirmé ou suspendu, sont idempotentes, et tracent l'accès (`staff_grant`). Après un
remboursement : `revoke --email … --training … --apply` (la vente vérifiée reste en base comme
pièce comptable, seul l'accès est retiré).

## 6. Ce que les étudiants auront réellement, le jour de l'ouverture

| Fonction | État à l'ouverture |
|---|---|
| Catalogue public + bouton d'achat Chariow | ✅ « Devenir un excellent orateur » |
| Création de compte + confirmation par e-mail | ✅ vérifiée de bout en bout (à condition de faire le 3b) |
| Connexion, sessions, campus, progression enregistrée | ✅ |
| Accès après achat Chariow **automatique** | ❌ **fermé** tant que le Pulse n'est pas éprouvé → accès accordé par vous avec `grant` |
| Contenu des cours | ⚠️ **le contenu du prototype (30 vidéos, 7,1 h) n'est pas importé** : l'étudiant voit 2 modules / 5 leçons, les vidéos annoncent honnêtement « Ressource pas encore publiée » |
| Exercices, évaluations, certificats, récompenses, avis | ❌ à porter |
| Paiement dans l'application | ❌ volontairement inactif |

**Autrement dit : à l'ouverture, le campus est un catalogue + un espace étudiant fonctionnel, pas
encore l'expérience complète du prototype.** C'est utilisable pour accueillir des étudiants et
tenir la promesse « acheter → accéder aux cours », à condition d'importer le contenu des cours.

## 7. Après la publication : la recette que vous me rapportez

1. En navigation privée : `/` doit répondre **sans** blocage Cloudflare Access.
2. Le catalogue doit afficher les formations publiées, avec le bouton Chariow.
3. `/inscription` doit accepter une inscription **et** envoyer l'e-mail de confirmation.
4. Le lien reçu doit confirmer l'adresse, puis la connexion doit mener au campus.
5. `/api/chariow/pulse` doit répondre **503** (fermé), et `/campus` sans session doit rediriger.
6. `GET /api/internal/quota` avec l'en-tête `Authorization: Bearer <APP_DIAGNOSTIC_TOKEN>` doit
   renvoyer les compteurs et le mode de dérivation `client`.

Rapportez-moi les messages exacts (captures bienvenues, **vérifiez qu'aucun jeton n'y apparaît**).
Je corrige immédiatement.

## 7 bis. Vider le contenu d'essai (demande du propriétaire, 6 octobre 2026)

« Purge tout le contenu : leçons, statistiques, livres… la plateforme doit être vide car tout était
pour tester. » Deux façons, au choix :

```powershell
# a) depuis l'Espace Direction : onglet Vue d'ensemble → « Vider le contenu d'essai » → tapez VIDER
# b) en ligne de commande, sur la base visée :
node --experimental-strip-types scripts\production-ops.mjs purge --confirm VIDER          # aperçu
node --experimental-strip-types scripts\production-ops.mjs purge --confirm VIDER --apply
node --experimental-strip-types scripts\production-ops.mjs purge --confirm VIDER --all --apply  # + comptes étudiants
```

Ce qui part : modules, leçons, progressions, accès, compteurs et journal d'exploitation. Les
**formations** restent (votre catalogue). Les formations vidées sont **refermées** : une formation
vide ne doit pas rester ouverte à la vente. Deux refus nets : sans le mot de confirmation `VIDER`,
et dès qu'un **achat vérifié** existe — une vente est une pièce comptable, elle ne se purge pas.

En local, l'équivalent est `npm run db:dev -- --empty`. Et **`--seed` n'installe plus aucun contenu
de test** : il n'enregistre que le catalogue, formations **fermées**. L'ancien contenu de
démonstration (2 modules, 5 leçons, un étudiant fictif) n'existe plus que derrière le drapeau
explicite `--demo`, réservé aux essais hors ligne.

## 8. Ce qui reste à faire juste après, dans l'ordre

1. Importer le **contenu réel des cours** (vidéos du prototype) et le lecteur adapté.
2. Éprouver le **Pulse Chariow** sur une vraie vente, puis l'activer (`CHARIOW_ENABLE_PULSE=true`
   + `CHARIOW_PULSE_SECRET`, `CHARIOW_PULSE_ID`, `CHARIOW_STORE_ID`, `CHARIOW_API_KEY`).
3. Porter la **V4 étudiante** (l'exemple de dashboard n'étant pas venu, je m'appuie sur le
   prototype et vos notes, et vous corrigez).
4. Exercices, évaluations, certificats, récompenses, administration, temps réel.
5. La **vitrine publique** `site/` (SEO), absente du dépôt.
