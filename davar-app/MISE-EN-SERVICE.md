# DAVAR Campus — mise en service (tranche « authentification + campus réel »)

**Date : 6 octobre 2026.** Ce document décrit ce qui fonctionne *réellement*
aujourd'hui, comment le lancer, et ce qui reste interdit tant que ce n'est pas
prouvé. Il complète `REAL-LAUNCH-STATUS.md` (état d'ensemble) et
`DEPLOIEMENT-PRIVE-STAGING.md` (barrières de déploiement).

> **Résumé honnête :** l'application est désormais un vrai parcours
> compte → confirmation d'e-mail → campus → progression, et l'accès après un
> **achat Chariow externe est rattaché automatiquement** au compte vérifié.
> Tout cela est prouvé **en local** (voir « Vérifications exécutées »).
> **Rien n'est encore déployé ni branché sur le marchand** : le Pulse Chariow
> reste fermé, l'envoi d'e-mails n'est pas configuré, et aucune base hébergée
> n'a été modifiée.

## 1. Ce qui fonctionne maintenant

| Fonctionnalité | État | Preuve locale |
|---|---|---|
| Catalogue public (lecture Turso) | ✅ | 4 formations affichées avec prix et lien d'achat |
| Inscription (nom, e-mail, mot de passe) | ✅ | `POST /api/auth/register` → 201 |
| Confirmation d'e-mail à usage unique (24 h) | ✅ | lien consommé une fois, rejeu refusé |
| Connexion / déconnexion par session hachée | ✅ | cookie `HttpOnly`, jeton SHA-256 en base |
| Campus protégé (cookie + validation base) | ✅ | `/campus` → 307 sans session, contenu avec session |
| Accès aux formations achetées | ✅ | 404 pour une formation non achetée |
| Rattachement automatique d'un achat Chariow | ✅ | vente enregistrée avant le compte → 1 formation activée à la confirmation |
| Contenu par modules/leçons | ✅ | modules, leçons, ressource, durée |
| Progression étudiant | ✅ | « 0 / 5 » → « 1 / 5 leçons terminées », leçon hors droit refusée (403) |
| Anti-bruteforce (par e-mail et par IP) | ✅ | 3ᵉ tentative bloquée avec délai de reprise |
| Protection CSRF (origine obligatoire) | ✅ | `POST` sans `Origin` → 403 ; origine étrangère → 403 |
| Pulse Chariow (webhook signé) | ⛔ **fermé** | `CHARIOW_ENABLE_PULSE` non activé → 503 |
| Envoi d'e-mails de confirmation | ⛔ **non configuré** | hors développement : inscription refusée (503), aucun compte fantôme |
| Paiements dans l'application (Flutterwave/MoneyFusion) | ⛔ **inactifs** | aucun encaissement possible depuis le site |
| Réinitialisation de mot de passe | ⛔ **absent** | schéma prêt (`email_tokens.purpose`) |
| Hachage délégué (mode gratuit) | ✅ | service `auth-kdf-service/` réel testé : signature, plafonds, refus |
| Comptage et protection des quotas | ✅ | `/api/internal/quota` : `kdf.operations 3/3000`, `worker.requests 4/100000` |
| E-mails gratuits par Brevo | ✅ | budget 300/jour reconnu, refus au-delà, aucune clé dans le corps |

## 2. Lancer en local (3 commandes)

Prérequis : Node.js 22.18+ (`node --version`). Aucun compte Turso, aucun secret.

```bash
cd davar-app
npm ci
npm run db:seed          # migrations 001+002 + catalogue + compte de démonstration
APP_ENV=development TURSO_DATABASE_URL="file:$PWD/dev-data/davar-dev.db" npm run dev
```

Le script `db:seed` affiche **une seule fois** le mot de passe du compte de
démonstration (`etudiant.demo@davar.local`), propriétaire d'une formation en
`staff_grant`. Il refuse de tourner si `APP_ENV` vaut `staging`/`production`,
et il ignore toute URL distante.

Autres commandes utiles :

```bash
npm run db:reset                                    # repart d'une base locale neuve
npm run db:dev                                      # applique seulement les migrations
node --experimental-strip-types scripts/simulate-chariow-sale.mjs prd_6wx1czzp acheteur@exemple.com sal_0001
npm test                                            # 18 tests Node (auth, ledger, signature)
npm run test:sql                                    # 20 tests SQLite/schéma
npm run typecheck                                   # tsc --noEmit
npm run build -- --webpack                          # build Next de production
npm run build:vinext                                # build de la cible Cloudflare Workers
```

En développement, faute d'envoi d'e-mail, l'API renvoie le lien de
confirmation dans la réponse (`devVerificationUrl`) : c'est **le seul endroit**
où ce lien sort vers le navigateur, et cela disparaît hors `APP_ENV=development`.

## 3. Variables d'environnement

Voir `.env.example` (versionné, sans secret) : environnement, base Turso,
itérations PBKDF2, envoi d'e-mail, diagnostic, Pulse Chariow. Règles :

- `APP_ENV` absent → production si `NODE_ENV=production`, sinon développement ;
  toute autre valeur est refusée.
- `staging` exige un hôte contenant `staging` ; `production` **refuse** un hôte
  contenant `staging` ; le jeton et l'hôte attendu sont obligatoires.
- Le mode fichier (`file:…`) est refusé hors développement.

## 4. Base de données et migrations

- `turso/migrations/001_core.sqlite.sql` : cœur (comptes, sessions, formations,
  achats vérifiés, livraisons Pulse, inscriptions, intentions de paiement).
- `turso/migrations/002_auth_campus.sqlite.sql` : **additive** — jetons
  d'e-mail, compteurs de débit, modules, leçons, progression, colonnes
  descriptives. Aucune suppression, aucune donnée insérée, aucun compte fictif.
- `scripts/dev-db.mjs` : applique les migrations à la base **locale** et
  enregistre les empreintes dans `schema_migrations`.
- `scripts/staging-schema.mjs` : manifeste fermé pour le staging hébergé
  (empreinte SHA-256 et nombre de DDL revus par migration, refus de toute
  instruction destructive, confirmation tapée à la main, une transaction par
  migration). Il n'a **pas été exécuté** : aucun accès Turso staging ici.
- `test_migrations_manifest.py` vérifie en continu que les fichiers de
  migration correspondent exactement au manifeste revu.
- `turso/schema.sql` (historique) reste **à ne pas appliquer**.

## 5. Parcours étudiant, pas à pas

1. L'étudiant achète sur la boutique Chariow (lien de `trainings.buy_url`).
2. Le Pulse signé enregistre la vente (`verified_purchases`) — *quand il sera
   activé*. Le lien produit → formation vient de Turso, jamais du Pulse.
3. L'étudiant crée son compte avec **la même adresse e-mail** que l'achat.
4. Il confirme son adresse (`/verifier-email?token=…`, usage unique, 24 h).
   C'est à cet instant précis que `claimPurchasesForVerifiedUser` rattache les
   achats : jamais avant, et idempotent (aucun doublon d'inscription).
5. Il se connecte : `/campus` liste ses formations, `/campus/formation/<id>`
   affiche modules et leçons, la progression est enregistrée côté serveur.
6. Un compte sans achat voit un campus vide avec l'explication — jamais un
   accès, jamais une fausse formation.

Cas « achat avant création du compte » : couvert par les tests et vérifié en
local (vente enregistrée d'abord, accès accordé à la confirmation).

## 6. Activer le Pulse Chariow (procédure, pas encore faite)

À faire **uniquement** après : base staging migrée, e-mails de confirmation
opérationnels, et un achat d'essai réel de bout en bout. Ordre :

1. Renseigner `CHARIOW_PULSE_SECRET` (`whsec_…`), `CHARIOW_PULSE_ID`
   (`pulse_…`), `CHARIOW_API_KEY` (`sk_…`), `CHARIOW_STORE_ID` (`str_…`)
   côté serveur (jamais dans le dépôt).
2. Mapper chaque produit (`trainings.chariow_product_id`) sur la bonne
   formation, avec le prix exact en base.
3. Créer le Pulse marchand vers `https://<domaine>/api/chariow/pulse`,
   événement `successful.sale`, puis passer `CHARIOW_ENABLE_PULSE=true`.
4. Tester : vente réelle de faible montant, vérifier `verified_purchases`,
   `pulse_deliveries`, et l'inscription après confirmation d'e-mail.
5. Vérifier les cas d'échec : signature invalide (401), rejeu (idempotent),
   produit inconnu (503, aucune écriture), remboursement/litige (politique de
   retrait **pas encore écrite**).

Tant que le drapeau est `false`, la route répond 503 : c'est volontaire, une
livraison Chariow n'est jamais acquittée sans écriture durable.

## 7. E-mails de confirmation

Le seul mode supporté est `MAILER_KIND=apps_script`, avec
`MAIL_APPS_SCRIPT_URL` (https) et `MAIL_APPS_SCRIPT_TOKEN` (16 caractères min).
Le script Google doit **vérifier ce secret** avant d'envoyer ; il reçoit
`{secret, to, subject, text}`. Sans configuration : hors développement,
l'inscription est refusée (503) plutôt que de créer un compte invérifiable.

## 8. Gratuité : architecture retenue

Voir **[`ARCHITECTURE-GRATUITE.md`](ARCHITECTURE-GRATUITE.md)** : briques
gratuites retenues (Cloudflare Workers Free, Turso Free, Brevo Free, R2,
service de hachage auto-hébergé), budget de charge à 3 000 étudiants actifs,
mécanismes de protection des quotas, ordre de mise en service et signaux de
révision chiffrés. En résumé : à 3 000 étudiants actifs, le site consomme ~36 %
des requêtes gratuites, la base ~9 % des écritures et ~2 % des lectures.

## 8bis. Déploiement (cible Cloudflare Workers) — point de blocage levé

Les deux builds passent sur cette branche : `npm run build -- --webpack`
(Next de production) et `npm run build:vinext` (cible Workers, toutes les
routes présentes, aucune dépendance Node native embarquée — le client libSQL
local est chargé par import dynamique non résolu, donc absent du paquet).

**Le hachage ne bloque plus le plan gratuit** : il est délégué au service
`auth-kdf-service` (voir §8). Mesures de référence sur cette machine
(`pbkdf2-hmac-sha256`, 32 octets dérivés), qui justifient la délégation :

| Itérations | Coût CPU mesuré | Compatible Workers Free (10 ms CPU/requête) |
|---|---|---|
| 100 000 | ~19 ms | ❌ |
| 210 000 (plancher appliqué) | ~40 ms | ❌ |
| 600 000 (défaut, recommandation OWASP) | ~121 ms | ❌ |

Décision retenue (gratuite, sans compromis sur le hachage) : **Workers Free
pour le site + service de hachage délégué sur une offre gratuite en CPU
mensuel**. Alternatives conservées si un jour nécessaire : Workers Paid (5 $) ou
un hôte Node unique. `AUTH_PBKDF2_ITERATIONS` refuse toute valeur < 210 000 hors
développement, et `/api/internal/quota` affiche le mode de hachage actif.

Étapes de déploiement (après accord) : `cloudflare.config.ts` (Worker
`davar-campus-next-staging-2026`, secrets saisis dans le tableau de bord,
`previewUrls:false`), protection Cloudflare Access *avant* ouverture, migration
staging avec `scripts/staging-schema.mjs --inspect` puis `--apply`, puis
recette complète. Le Pulse marchand reste désactivé pendant ces tests.

## 9. Sécurité — ce qui est en place, ce qui manque

En place : mot de passe haché PBKDF2-HMAC-SHA256 salé (jamais journalisé),
jetons de session/e-mail stockés en SHA-256, comparaisons en temps constant,
cookie `HttpOnly`/`SameSite=Lax`/`Secure` hors développement, contrôle
d'origine obligatoire sur toute requête modifiante, limitation de débit en base
(clé hachée : ni e-mail ni IP en clair), compte non vérifié = aucun accès
cours, suspension = sessions invalidées, échec en mode fermé partout.

Manque encore : réinitialisation de mot de passe (schéma prêt, parcours non
codé), vérification de session à la rotation d'appareil/2FA, politique de
retrait en cas de remboursement Chariow, journalisation d'audit, purge/copie de
sauvegarde et rétention, tests de charge, revue sécurité externe.

Argon2id n'est pas utilisé : il n'existe pas d'implémentation sûre et portable
(Node + Workers) sans dépendance native. PBKDF2 à 600 000 itérations est la
recommandation OWASP pour PBKDF2-HMAC-SHA256 ; le passage à Argon2id est à
revoir avec l'hébergement retenu.

## 10. Vérifications exécutées (6 octobre 2026)

- `npm test` → **41 tests réussis** : signature Pulse, comparaison Pulse/Get
  Sale, noyau d'auth (inscription, confirmation, session, suspension, débit,
  expiration), ledger Chariow (produit inconnu et montant divergent refusés,
  accès accordé seulement après confirmation), garde-fous HTTP (origine,
  tolérance d'aperçu limitée au développement, liens d'e-mail, corps borné),
  **service de hachage réel** (signature HMAC, horodatage, plafond, tailles) et
  **protection des quotas / envoi Brevo** (budgets, verdicts, refus au-delà).
- `npm run test:sql` → **23 tests réussis** : schéma 001+002, contraintes,
  absence de données semées, manifeste de migration staging.
- `npm run typecheck` → réussi. `npm run build -- --webpack` → réussi (toutes
  les routes listées). `npm run build:vinext` → réussi.
- Parcours réel sur le serveur de développement avec base locale :
  inscription → 403 sans `Origin`, lien de confirmation consommé une seule
  fois, connexion, `/campus` 307 sans cookie, campus avec formation, 404 sur
  formation non achetée, progression « 1 / 5 », leçon hors droit refusée (403),
  achat simulé avant création du compte → « 1 formation activée ».
- **Preuve du mode gratuit** : serveur de développement lancé avec
  `AUTH_KDF_MODE=remote` face au vrai service (`auth-kdf-service`) — inscription,
  confirmation, connexion, campus, puis `/api/internal/quota` affichant
  `kdf.operations : 3/3000` et `worker.requests : 4/100000`.
- **Non testé (et non testable ici)** : Pulse Chariow réel, `GET /v1/sales`,
  envoi d'e-mail réel, transactions Turso hébergées, comportement à chaud sous
  Workers, quotas facturés par les fournisseurs, restauration de sauvegarde. À
  faire en environnement privé avant toute ouverture au public.
