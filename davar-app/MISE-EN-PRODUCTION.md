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

## 3. Les trois prérequis à obtenir d'abord (rien ne marche sans eux)

### a) La base Turso de PRODUCTION
Vos documents indiquent qu'une base de production distincte existe. Il me faut **son hôte exact**
(quelque chose comme `davar-campus-production-<compte>.<region>.turso.io`) et **un jeton d'écriture
temporaire** pour y appliquer le schéma — jeton que vous supprimerez juste après. **Ne me les
envoyez pas** : ils se saisissent dans votre terminal et dans le tableau de bord Cloudflare.

Ensuite, créez un **second jeton, lecture-écriture, limité à cette base**, qui servira de secret
applicatif au Worker. Le jeton de migration, lui, se supprime.

### b) L'envoi des e-mails (Brevo, gratuit — 300 e-mails/jour)
Sans lui, **l'inscription est refusée en 503** : c'est volontaire, on ne crée pas un compte dont
on ne peut pas confirmer l'adresse. Il faut :
- un compte Brevo (gratuit, sans carte) ;
- une **adresse d'expédition vérifiée** (Brevo refuse d'expédier depuis une adresse non vérifiée) ;
- la clé API.

*Variante sans Brevo :* vous avez déjà des URL Google Apps Script dans votre projet ; le code
sait aussi envoyer par Apps Script (`MAILER_KIND=apps_script`) si l'URL et un jeton d'au moins
16 caractères sont fournis.

### c) Les liens d'achat Chariow des formations
Le catalogue réel compte 4 formations, et **une seule a aujourd'hui son lien de vente**
(`Devenir un excellent orateur`, produit `prd_6wx1czzp`). Les trois autres (Marketing Digital,
Excel & Analyse de données, Créer son entreprise en Côte d'Ivoire) n'ont **aucun lien** dans le
code : elles resteraient « bientôt disponible » et non achetables — l'outil de catalogue refuse
de les publier sans lien, pour ne pas afficher une formation qu'on ne peut pas acheter.
Vos liens sont dans le prototype, sous **Paramètres → Paiement & intégrations externes**.

## 4. La séquence exacte

```powershell
# 0. Récupérer la version à jour du code (branche arena/09f3da07-davar-campus), puis :
npm ci
npm run rehearsal:staging        # répétition locale de la migration — doit finir par « RÉUSSITE »
npm test                         # 53 tests — doivent tous passer

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
| `BREVO_API_KEY` | clé API Brevo |
| `MAIL_FROM_EMAIL` | adresse d'expédition **vérifiée** dans Brevo |

⚠️ Si vous modifiez un secret dans le tableau de bord, Cloudflare **republie une version** du
Worker : faites-le avant la recette finale, puis recontrôlez.

## 5. Le catalogue et les accès, sans attendre le webhook

```powershell
# Importer le catalogue réel (les formations sans lien restent non publiées)
node --experimental-strip-types scripts\production-ops.mjs catalog            # aperçu
node --experimental-strip-types scripts\production-ops.mjs catalog --apply

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
| Catalogue public et boutons d'achat Chariow | ✅ pour les formations ayant un lien |
| Création de compte + confirmation par e-mail | ✅ (à condition de faire le 3b) |
| Connexion, sessions, campus, progression enregistrée | ✅ |
| Accès après achat Chariow **automatique** | ❌ **fermé** tant que le Pulse n'est pas éprouvé → accès accordé par vous avec `grant` |
| Contenu des cours | ⚠️ **le contenu réel du prototype (30 vidéos, 7,1 h) n'est pas encore importé** : le campus affichera les formations et les quelques leçons présentes |
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

## 8. Ce qui reste à faire juste après, dans l'ordre

1. Importer le **contenu réel des cours** (vidéos du prototype) et le lecteur adapté.
2. Éprouver le **Pulse Chariow** sur une vraie vente, puis l'activer (`CHARIOW_ENABLE_PULSE=true`
   + `CHARIOW_PULSE_SECRET`, `CHARIOW_PULSE_ID`, `CHARIOW_STORE_ID`, `CHARIOW_API_KEY`).
3. Porter la **V4 étudiante** (l'exemple de dashboard n'étant pas venu, je m'appuie sur le
   prototype et vos notes, et vous corrigez).
4. Exercices, évaluations, certificats, récompenses, administration, temps réel.
5. La **vitrine publique** `site/` (SEO), absente du dépôt.
