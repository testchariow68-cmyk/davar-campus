# DAVAR Campus — architecture 100 % gratuite (objectif : 0 € jusqu'à 3 000 étudiants actifs)

**Décision du propriétaire (6 octobre 2026) :** aucun budget avant 3 000 étudiants
actifs. Règle d'ingénierie associée : **« les quotas se protègent, ils ne se
dépensent pas ».** Ce document dit ce qui est gratuit, jusqu'où, ce qui a été
mis en place pour ne jamais dépasser, et à quels signaux chiffrés il faudra
revoir la question.

> **Conclusion courte :** l'obstacle qui obligeait à payer (~121 ms de CPU pour
> hacher un mot de passe, contre 10 ms autorisées par requête chez Cloudflare
> gratuit) **est levé sans affaiblir la sécurité** : le hachage est délégué à un
> petit service auto-hébergé qui vit sur une offre gratuite mesurée en temps CPU
> mensuel. Le reste du campus tient dans les offres gratuites de Cloudflare,
> Turso et Brevo, avec une marge de 3 à 10× à 3 000 étudiants.

## 1. Les briques retenues (toutes gratuites, aucune carte requise sauf mention)

| Besoin | Service gratuit | Ce que l'offre gratuite donne | Vérifié le 06/10/2026 |
|---|---|---|---|
| Pages, logique, API | **Cloudflare Workers Free** | **100 000 requêtes dynamiques/jour** ; **assets statiques gratuits et illimités** ; 10 ms CPU/requête ; 100 Workers ; Worker ≤ 3 Mo gzip | [limits](https://developers.cloudflare.com/workers/platform/limits/), [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Base de données | **Turso Free** | 5 Go, **500 M lignes lues/mois**, **10 M lignes écrites/mois**, 100 bases, sans carte bancaire | [turso.tech](https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan) |
| Hachage des mots de passe | **`davar-kdf`** (ce dépôt), hébergé sur une offre gratuite en **CPU mensuel** | Oracle Cloud Always Free : 4 vCPU ARM + 24 Go, sans limite de durée (carte de vérification demandée, non débitée) · Google Cloud Run free tier : 180 000 vCPU-s/mois (compte de facturation requis) · ou votre propre machine / Raspberry Pi | [Oracle Free](https://www.oracle.com/cloud/free/), [Cloud Run](https://cloud.google.com/run/pricing) |
| E-mails de confirmation | **Brevo Free** | **300 e-mails/jour**, 100 000 contacts, sans carte, expéditeur à vérifier | [brevo.com/pricing](https://www.brevo.com/pricing/) |
| Fichiers & vidéos (plus tard) | **Cloudflare R2** | 10 Go de stockage, **sortie de données gratuite** | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Nom de domaine | `*.workers.dev` fourni | Domaine propre facultatif, non nécessaire au démarrage | Cloudflare |

**Ce qui n'est pas retenu comme hébergement principal :** Render/Heroku-like
gratuits (le service s'endort après inactivité : inacceptable pour un campus),
Vercel Hobby (réservé à l'usage non commercial, ce que le campus n'est pas),
Cloudflare Workers Paid (5 $/mois) — utile seulement en cas de dépassement réel.

## 2. Pourquoi le hachage devait sortir du Worker

Le mot de passe est haché avec PBKDF2-HMAC-SHA256 à **600 000 itérations**
(recommandation OWASP). Mesuré sur cette machine : **~121 ms de CPU par
hachage** — c'est voulu, c'est ce qui ruine une attaque hors ligne. Or Cloudflare
Workers Free plafonne à **10 ms de CPU par requête** : la connexion et
l'inscription étaient donc structurellement impossibles sans payer.

Trois sorties possibles ; la troisième a été retenue :

1. **Payer 5 $/mois** — refusé par le propriétaire, et inutile à ce stade.
2. **Affaiblir le hachage** — refusé, jamais négociable.
3. **Déléguer le hachage** à un service qui vit sur une offre gratuite dont le
   quota est exprimé en **temps CPU mensuel** (des dizaines de milliers de
   secondes), et non en millisecondes par requête. ✅ **Retenu.**

Le service `auth-kdf-service/` livré ici est volontairement minuscule :

- **zéro dépendance** (Node 22 `node:http` + `node:crypto`), une seule image Docker ;
- requête **signée HMAC-SHA256 sur `horodatage.corps`** : une fuite du jeton
  d'accès ne suffit pas à rejouer une requête au-delà de 60 secondes ;
- **plafond journalier explicite** (`DAVAR_KDF_DAILY_MAX`, 3 000 par défaut) :
  au-delà, il refuse au lieu de consommer — le quota se protège ;
- **aucun journal** de mot de passe ni d'empreinte, à aucun niveau ;
- refus de démarrer sans jeton fort (32 caractères minimum) et refus de s'exposer
  en réseau sans reconnaissance explicite de terminaison TLS en amont
  (`DAVAR_KDF_TRUST_PROXY=true`).

Côté application, deux modes pilotés par `AUTH_KDF_MODE` :

- `local` : hachage dans le processus courant (développement, tests, hôte Node) ;
  **refusé** en staging/production sans dérogation explicite ;
- `remote` (défaut hors développement) : appel signé au service.

Si le service est injoignable, la connexion échoue proprement : **aucun mot de
passe n'est jamais accepté sans vérification réelle**.

## 3. Le budget de charge à 3 000 étudiants actifs

Hypothèses assumées (à ajuster quand des chiffres réels existeront) : un
étudiant actif ouvre le campus **12 fois par jour**, marque **8 leçons**, et
consulte **10 lignes de base par écran**. Les assets (CSS, JS, images, polices)
sont statiques : **gratuits et illimités**, hors décompte.

| Ressource | Consommation estimée / jour | / mois | Quota gratuit | Part consommée |
|---|---|---|---|---|
| Requêtes dynamiques Cloudflare | 3 000 × 12 = **36 000** | ~1,08 M | 100 000/jour | **36 %** |
| Lignes **écrites** Turso | progression 24 000 + compteurs ~1 800 + sessions ~3 000 ≈ **29 000** | ~0,87 M | 10 M/mois | **9 %** |
| Lignes **lues** Turso | 3 000 × 12 × 10 ≈ **360 000** | ~10,8 M | 500 M/mois | **2 %** |
| Opérations de hachage | ~1 500 (connexions réparties, sessions de 30 jours) | ~45 000 | plafond 3 000/jour = 90 000/mois | **50 %** |
| E-mails transactionnels | vérifications et réinitialisations seulement : ~150 | ~4 500 | 300/jour ≈ 9 000/mois | **50 %** |

**Lecture :** à 3 000 étudiants actifs, la base et le site tournent à moins de
10 % de leurs quotas gratuits. Les deux ressources les plus serrées sont le
**hachage** (50 %) et l'**e-mail** (50 %) — c'est précisément pour elles que des
plafonds durs et un refus explicite ont été implémentés, plutôt qu'une panne
silencieuse.

**Le vrai risque de coût n'est ni la base ni le site : c'est la vidéo.** Le
stockage R2 gratuit (10 Go) et la sortie gratuite suffisent pour des modules
courts ; pour des heures de vidéo, la solution à 0 € consiste à héberger les
vidéos sur un service tiers (YouTube non répertorié) et à ne garder dans R2 que
les ressources à protéger. Décision à prendre au moment de publier les cours.

## 4. Comment les quotas sont protégés (mécanismes livrés)

1. **Comptage systématique** : chaque page dynamique incrémente
   `worker.requests` (`app/layout.tsx`). Les assets statiques, gratuits, ne sont
   pas comptés — conformément à l'offre Cloudflare.
2. **Vidage par lots** : les compteurs vivent en mémoire d'instance et sont
   écrits en base **1 fois pour 20 requêtes** (`QUOTA_FLUSH_EVERY`). Conséquence
   mesurable : ~1 800 écritures/jour pour 36 000 requêtes, soit **0,6 %** du
   quota d'écritures.
3. **Budgets déclarés dans le code** (`lib/server/quota.ts`) : 100 000
   requêtes/jour, 10 M écritures/mois, 500 M lectures/mois, 300 e-mails/jour,
   3 000 hachages/jour. Chacun est surchargeable par variable d'environnement.
4. **Verdicts progressifs** : `ok` (< 70 %), `warning` (70 %), `critical`
   (90 %), `exhausted` (100 %). Les budgets dits « durs » (e-mails, hachages)
   **refusent** l'opération au-delà de la limite.
5. **Tableau de bord opérateur** : `GET /api/internal/quota` (protégé par
   `APP_DIAGNOSTIC_TOKEN`) renvoie la consommation, les alertes et le mode de
   hachage actif — sans jamais exposer un secret.
6. **Cache** : le catalogue public est mis en cache 60 s par instance ; les
   sessions sont validées en une requête, avec renouvellement glissant écrit au
   plus une fois par jour.
7. **Refus explicites plutôt que pannes sèches** : inscription refusée (503) si
   l'envoi d'e-mail n'est pas configuré, si le quota d'e-mails est atteint ou si
   le service de hachage est indisponible.

## 5. Mise en service gratuite — l'ordre des opérations

1. **Compte Cloudflare (gratuit)** → déployer `davar-app` via `npm run build:vinext`
   (`cloudflare.config.ts` est déjà préparé : Worker dédié, `previewUrls:false`).
2. **Compte Turso (gratuit, sans carte)** → créer la base, appliquer les
   migrations avec `node scripts/staging-schema.mjs --inspect` puis la
   procédure validée (`--apply`, confirmation tapée à la main).
3. **Service de hachage** → `docker build auth-kdf-service` puis exécution sur
   Oracle Cloud Always Free (VM ARM) derrière Caddy ou Cloudflare Tunnel pour
   le HTTPS ; renseigner `AUTH_KDF_URL` (HTTPS) et `AUTH_KDF_TOKEN` (32+
   caractères) côté Worker, avec `AUTH_KDF_MODE=remote`.
   *Sans carte bancaire disponible :* ce service peut tourner sur votre propre
   machine ou un Raspberry Pi à la maison, tant que le volume le permet — le
   reste de la plateforme reste chez Cloudflare.
4. **Brevo (gratuit)** → créer la clé API, vérifier l'adresse d'expédition,
   puis `MAILER_KIND=brevo`, `BREVO_API_KEY`, `MAIL_FROM_EMAIL`.
5. **Diagnostic** → poser `APP_DIAGNOSTIC_TOKEN` (32+ caractères) et consulter
   `/api/internal/quota` après les premiers tests.

Détail des variables : `.env.example`. Ce qui reste **fermé** tant que ce n'est
pas prouvé : Pulse Chariow (`CHARIOW_ENABLE_PULSE=false`), paiements
Flutterwave/MoneyFusion, réinitialisation de mot de passe.

## 6. Signaux de révision (quand la gratuité ne suffira plus)

Ordre de priorité si un plafond est atteint, du moins cher au plus cher :

| Signal observé | Seuil | Action |
|---|---|---|
| `email.sent` en `critical` plusieurs jours | > 270/jour | Basculer les annonces de masse hors plateforme (WhatsApp/Telegram), garder l'e-mail pour la vérification |
| `kdf.operations` en `critical` | > 2 700/jour | Augmenter `DAVAR_KDF_DAILY_MAX` (le quota hôte est en CPU mensuel, la marge est réelle) ou ajouter une seconde instance |
| `worker.requests` en `critical` | > 90 000/jour | Activer le cache de bord, rendre des écrans statiques, puis envisager Workers Paid (5 $) |
| `turso.rows_written` approché | > 8 M/mois | Vérifier les écritures inutiles, puis Turso Developer (5 $) |
| Vidéos > 10 Go | — | Externaliser vers un hébergeur vidéo gratuit ou passer au stockage payant |

Tant qu'aucune de ces lignes n'est franchie plusieurs jours de suite, **il n'y a
aucune raison de payer**, et le tableau de bord le dira avant la panne.

## 7. Vérifications exécutées (6 octobre 2026)

- **41 tests Node** (`npm test`) dont 7 sur le **vrai service de hachage** lancé
  en local : signature HMAC invalide et horodatage périmé refusés (401), plafond
  journalier refusant au-delà de la limite (429), corps trop volumineux refusé
  (413), santé exposée sans secret, mot de passe en clair absent de la réponse.
- **23 tests SQLite** (`npm run test:sql`) dont les contraintes des compteurs de
  quota et l'absence de donnée personnelle dans le journal d'opérations.
- **Preuve de bout en bout** sur le serveur de développement avec
  `AUTH_KDF_MODE=remote` : inscription → confirmation → connexion → campus, avec
  `/api/internal/quota` affichant `kdf.operations : 3 / 3000` et
  `worker.requests : 4 / 100000`.
- **Non vérifié (et non vérifiable sans compte)** : quotas réellement facturés
  par Cloudflare/Turso/Brevo, comportement à chaud sous Workers, latence du
  service de hachage hébergé, délivrabilité réelle des e-mails Brevo. À mesurer
  lors de la mise en service, avec le tableau de bord de quota comme instrument.

## 8. Sources consultées

- Cloudflare Workers — limites : https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers — tarifs (assets statiques gratuits et illimités) : https://developers.cloudflare.com/workers/platform/pricing/
- Turso — offre gratuite : https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan
- Brevo — offre gratuite (300 e-mails/jour) : https://www.brevo.com/pricing/
- Oracle Cloud Always Free : https://www.oracle.com/cloud/free/
- Google Cloud Run — offre gratuite : https://cloud.google.com/run/pricing
- Cloudflare R2 — tarifs (10 Go gratuits, sortie gratuite) : https://developers.cloudflare.com/r2/pricing/
