# Conformité aux documents du projet — lecture complète et écart réel

> **Source de référence :** dossier Drive `workspace-01a10e9f-b31a-7076-9432-4ee5051bcb82`
> (`davar-app/`, `davar-campus/`, `site/`, `.config/`, `uploads/`, archives ZIP).
> Ce document est la **traçabilité** : à chaque décision écrite dans vos documents, on
> indique ce que contient réellement le code aujourd'hui. Établi le 6 octobre 2026.

---

## 1. Ce qu'est le projet (tel que vos documents le décrivent)

| Élément | Rôle | Emplacement |
|---|---|---|
| `davar-campus/` | **Prototype interactif** complet (localStorage) — référence d'expérience et de design. Ne persiste rien côté serveur. | Drive `davar-campus/` |
| `davar-app/` | **La vraie application** (Next.js + Turso) — à finaliser. | Drive `davar-app/` **et** dépôt GitHub |
| `site/` | **Vitrine publique** (SEO, sans lien vers l'app) : « la plateforme est privée, on y entre uniquement après achat ». | Drive `site/` |

Deux domaines séparés : vitrine publique d'un côté, application privée de l'autre.

## 2. Décisions figées par vos documents

1. **Turso = seule base applicative** (décision du 2 octobre 2026). Réplication CockroachDB/D1 **en pause**, sans suppression de code ni de ressources. Aucune nouvelle base, aucune purge, aucune migration distante sans accord distinct.
2. **Cloudflare Workers** pour l'application ; **Workers Free**, le propriétaire **refuse Workers Paid**. Pas de VPS. Next.js servi via **vinext** (recommandé par Cloudflare pour Next 16, encore en bêta).
3. **Supabase abandonné**, **CinetPay banni** (0 occurrence), **aucune purge automatique** activée, `turso/schema.sql` historique **jamais à appliquer**.
4. **Fichiers** : Cloudflare R2 avec **URLs signées HMAC-SHA256 (1 h)**, jamais de lien permanent. Décision la plus récente de `CAPACITY.md` : **R2 devient l'hébergeur vidéo** (encodage maîtrisé, streaming progressif par requêtes Range) — les 10 Go gratuits bornent le catalogue (~56 h à 400 kbps pour les 7,1 h actuelles), YouTube « non répertorié » restant réservé aux teasers publics, jamais au contenu payant.
5. **Pièges de quota identifiés par vos soins** : ne jamais mettre Cloudflare Access devant les étudiants (limite 50 utilisateurs) ; jamais d'IA ni de Durable Object par requête ; vidéos = risque de stockage n°1.
6. **Priorité décidée** : rendre réels les cours et l'authentification/permissions avec e-mail vérifié, puis l'accès automatique après achat Chariow **externe** ; les paiements intégrés (Flutterwave/MoneyFusion) viennent **après**.
7. **V4 côté étudiant : en attente** de votre exemple de navigation/dashboard avant de coder (consigne explicite dans `SPEC-V4-NOTES.md`).

## 3. Règles produit à ne pas enfreindre (vos documents)

- Marque : **« DAVAR ACADÉMIE »** — jamais « DAVAR CAMPUS » sous le logo.
- Jamais les mots **« WebAuthn »**, **« VAPID »**, **« Support »** côté étudiant → « empreinte digitale », « activer les notifications », icône casque.
- **Certificat jamais téléchargeable** : vérification par code uniquement.
- **Aucun jargon technique**, aucune info interne visible par l'étudiant.
- Exercice **non bloquant**, évaluation **bloquante** (score minimum 80 %, validation humaine).
- **Enrichissement silencieux** : une formation enrichie ne réinitialise jamais une progression et n'envoie jamais de notification.
- Un rachat **n'ajoute qu'une formation** au compte existant — jamais un doublon d'étudiant.
- Accès formation : **12 mois** à partir de l'achat.
- Finances visibles **uniquement** Super Admin + Manager. Support réservé aux membres « support » ; le propriétaire n'apparaît jamais dans les fils.
- Le mot « RGPD » **ne doit jamais être écrit** ; formulation libre à la place.
- Les limites de fichiers (20 Mo audio / 128 Mo vidéo / 10 Mo document) ne changent que sur votre validation.

## 4. État réel vérifié le 6 octobre 2026

**Côté hébergement (vos documents, non modifié par moi)**
- Base Turso staging `davar-campus-staging` : **migration 001 appliquée** — 9 tables, 3 index, reçu version 1, **zéro ligne**.
- Worker Cloudflare `davar-campus-next-staging-2026` : existe, **Access « tout le trafic »**, secrets `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` ajoutés — mais **il n'héberge pas DAVAR** : `npx cf deploy` de l'application n'a jamais été exécuté.
- Aucun domaine personnalisé, aucune base de production touchée.

**Côté application (`davar-app/`, ce dépôt)**
- Authentification applicative Turso réelle : comptes, e-mail vérifié obligatoire, sessions, rôles, suspension.
- Mot de passe **dérivé dans le navigateur** (voir §5.1) ; mot de passe jamais transmis.
- Campus étudiant : catalogue réel depuis Turso, formations, modules, leçons, progression enregistrée.
- Achat Chariow externe → accès automatique au compte dont l'e-mail est **confirmé** (journal des ventes, livraisons uniques, achats pré-inscription réclamables). Webhook **fermé par défaut**.
- Compteurs de quotas, envoi d'e-mails (Brevo/Apps Script), journal d'exploitation.
- Qualité : **50 tests Node**, **25 tests SQLite**, typage et builds (Next + Workers) verts.

## 5. Points de réconciliation (là où il faut votre arbitrage)

### 5.1 Hachage des mots de passe : argon2id → PBKDF2 côté navigateur
Vos documents prescrivent **argon2id** et signalent eux-mêmes le blocage :
*« impossible de considérer ce quota comme validé pour … un hash de mot de passe Argon2id sans mesure réelle. Aucun compromis sur la sécurité des mots de passe n'est autorisé pour respecter ce plafond. »*

Ce que j'ai mis en place **lève ce blocage sans payer et sans affaiblir la sécurité** : la dérivation (PBKDF2-HMAC-SHA256, **600 000 itérations**, recommandation OWASP) se fait **dans le navigateur de l'étudiant** ; le serveur ne revérifie qu'une clé dérivée (~2,6 ms mesurés, très loin des 10 ms). Le mot de passe ne quitte jamais l'appareil, et un poivre serveur hors base protège contre une fuite de la base.

**Deux options, à vous de trancher :**
- **A (actuel)** : PBKDF2 600 000 côté navigateur — technologie native du navigateur, zéro dépendance, zéro téléchargement.
- **B (fidèle à la lettre du document)** : **argon2id côté navigateur** via un module WebAssembly — même principe, algorithme exactement celui de vos documents, au prix d'un fichier WASM (~50 Ko) à servir.

Les deux tiennent dans le gratuit. Dites-moi si vous voulez B.

### 5.2 Migrations 002 / 003 / 004 non appliquées à staging
La base staging n'a que la migration 001. Le code actuel a besoin des quatre. Votre protocole exige une présentation avant toute écriture : elle est faite dans **`REVUE-MIGRATIONS-STAGING-002-004.md`** — empreintes, effet exact, mécanisme, retour arrière. **Aucune écriture n'a été faite ; j'attends votre accord explicite.**

### 5.3 V4 étudiant toujours bloquée par votre exemple
`SPEC-V4-NOTES.md` : *« NE RIEN CODER avant réception de l'exemple de navigation/dashboard étudiant »*. L'interface étudiante actuelle reste donc volontairement une coquille sobre, pas la V4.

### 5.4 Écart de périmètre avec vos documents (le vrai sujet)
Vos documents décrivent **un campus complet**. Voici l'état honnête :

| Domaine (vos documents) | État dans le code |
|---|---|
| Authentification, e-mail vérifié, sessions, rôles | ✅ réel |
| Catalogue, formations, modules, leçons, progression | ✅ réel (2 niveaux) |
| Structure **Chapitres → Modules** (3 niveaux) | ❌ à porter |
| Achat Chariow externe → accès automatique | ✅ réel, **webhook fermé** (pas encore testé sur votre compte marchand) |
| Lecteur vidéo multi-ratios + URLs signées R2 | ❌ à porter |
| Exercices non bloquants / évaluations bloquantes + soumissions | ❌ à porter |
| Certificats (Apps Script + page de vérification publique) | ❌ à porter |
| Récompenses / badges (10 par formation) | ❌ à porter |
| Avis obligatoires, Spotlight, modération | ❌ à porter |
| Assistant virtuel (nom/photo/langue, isolation par formation) | ❌ à porter |
| Notifications (cloche, 48 h après lecture), ticker social | ❌ à porter |
| Temps réel SSE + push | ❌ à porter |
| Espace admin complet (étudiants, ventes, équipe, exports, Sheets, clés API, cycle de vie) | ❌ à porter |
| Moteur de cycle de vie (purge) | ❌ à porter — **et volontairement inactif** |
| Vitrine `site/` (SEO, JSON-LD, sitemap) | ❌ absente du dépôt |

## 6. Points de sécurité à traiter de votre côté

1. **Le dépôt GitHub `testchariow68-cmyk/davar-campus` est PUBLIC.** Aucun secret n'y est committé (vérifié : `.env*`, bases et sauvegardes sont exclus par `.gitignore`). Mais tout ce qui y sera ajouté sera **lisible par le monde entier** : n'y déposez jamais `.env.local`, les archives ZIP de déploiement ni les documents contenant vos identifiants.
2. **Votre fichier `rapport-audit.md` contient votre compte réel et son mot de passe en clair.** Il circule dans le Drive. **Changez ce mot de passe** et évitez de partager ce document ; je ne l'ai pas recopié dans le dépôt et je ne le ferai pas.

## 7. Ce que je propose comme suite, dans l'ordre de vos documents

1. **Votre accord pour appliquer 002/003/004 à `davar-campus-staging`** (revue prête) → l'application correspond alors exactement au schéma.
2. **Porter le cœur pédagogique réel** : Chapitres → Modules → Leçons, lecteur vidéo, progression verrouillée à 100 %, enrichissement silencieux.
3. **Exercices et évaluations** (non bloquant / bloquant, validation humaine, soumissions).
4. **Certificats** puis **récompenses**, puis **admin**, puis **temps réel**.
5. **Déploiement privé** du Worker (votre barrière n°5 : accord après prévol et secrets lecture seule).
