# Revue obligatoire — migrations 002, 003 et 004 sur le Turso staging existant

**PAS UNE AUTORISATION D'EXÉCUTER.** Aucun SQL n'a été écrit à distance. Document établi le
6 octobre 2026, sur le modèle de la revue de la migration 001 déjà acceptée par le propriétaire.
**J'attends un accord explicite et séparé avant toute écriture.**

## 1. Cible et preuve de départ

- Base existante : **`davar-campus-staging`** (Turso Cloud, moteur libSQL) — la seule concernée.
- **Jamais** la base Turso de production, ni CockroachDB, ni D1. Aucune nouvelle base, branche ou groupe.
- État rapporté par le propriétaire après la migration 001 du 3 octobre 2026, en lecture seule :
  `table_count=9`, `index_count=3`, `receipt_count=1` (version 1, empreinte vérifiée),
  `users=0`, `trainings=0`, `purchases=0`, `enrollments=0`.
- Les migrations 002, 003 et 004 n'existent **nulle part** sur cette base : le code actuel de
  l'application en a besoin, sinon l'inscription, la vérification d'e-mail, le campus, les
  compteurs de quotas et l'authentification se briseraient.

## 2. Changement proposé, exact

Trois fichiers du dépôt, chacun avec son empreinte SHA-256. **Aucun `DROP`, `DELETE`, `UPDATE`,
`TRUNCATE` : uniquement des créations de tables/index et des ajouts de colonnes.**

### Migration 002 — `turso/migrations/002_auth_campus.sqlite.sql`
SHA-256 `d72a5bfe0f56e78047859dcd9c4d86f075e47bb4a76e390afeee36022e05c389` — **10 DDL**

| Objet | Type | Contenu |
|---|---|---|
| `email_tokens` | table | jetons de vérification d'e-mail / réinitialisation (empreinte seule, jamais le jeton) |
| `rate_limits` | table | compteurs anti-abus par fenêtre |
| `course_modules` | table | modules d'une formation, position unique par formation |
| `course_lessons` | table | leçons d'un module (vidéo, texte, exercice, direct) |
| `lesson_completions` | table | progression : quelle leçon, quel étudiant, quand |
| `idx_email_tokens_user` | index | recherche des jetons par utilisateur et par usage |
| `trainings.description`, `trainings.buy_url` | colonnes ajoutées | description et lien d'achat Chariow |
| `users.last_login_at_ms` | colonne ajoutée | dernière connexion |
| `sessions.last_seen_at_ms` | colonne ajoutée | dernière activité de session |

### Migration 003 — `turso/migrations/003_quota_counters.sqlite.sql`
SHA-256 `aa766d2f4081ba7dd4450b78db4536510cdd439490ad05d91a4498964acd2c4e` — **4 DDL**

| Objet | Type | Contenu |
|---|---|---|
| `ops_counters` | table | consommation courante face aux quotas gratuits (requêtes, écritures, e-mails, hachages) |
| `ops_events` | table | journal d'exploitation minimal (envoi/refus d'e-mail, opérations de hachage) |
| `idx_ops_counters_window`, `idx_ops_events_kind` | index | agrégation par fenêtre et par type |

### Migration 004 — `turso/migrations/004_client_side_kdf.sqlite.sql`
SHA-256 `45a6eec2ca0a0d2e0575c478f7a10be2a80a9fc921e4c5b00ce2266d8305a140` — **3 DDL**

| Objet | Type | Contenu |
|---|---|---|
| `users.kdf_scheme` | colonne ajoutée | méthode de dérivation du compte (`client-v1` ou héritée `server-v1`) |
| `users.client_salt` | colonne ajoutée | sel public de dérivation (jamais le mot de passe) |
| `users.client_iterations` | colonne ajoutée | nombre d'itérations déclaré par le client |

### Effet cumulé sur la base staging

| Mesure | Avant | Après |
|---|---:|---:|
| Tables | 9 | **16** |
| Index | 3 | **6** |
| Colonnes ajoutées | — | **7** (aucune suppression) |
| Lignes ajoutées dans les tables métier | 0 | **0** |
| Lignes ajoutées dans `schema_migrations` | 1 | **4** (reçus versions 2, 3, 4 — version, empreinte, horodatage) |

Total : **17 instructions DDL**, toutes additives. Aucun compte, aucune formation, aucun achat et
aucun droit d'accès n'est créé. Les colonnes ajoutées sont **nullables**, donc les éventuelles
lignes existantes resteraient valides (il n'y en a aucune aujourd'hui).

## 3. Mécanisme d'exécution prévu (pas encore autorisé)

Script déjà présent dans le dépôt : `scripts/staging-schema.mjs`, avec son lanceur
`scripts/run-staging-schema.ps1` (saisie masquée des variables, jamais écrites dans un fichier).

Garanties effectivement codées :
- refus de toute cible hors `APP_ENV=staging` et dont l'hôte n'est pas exactement `TURSO_EXPECTED_HOST` ;
- refus si une empreinte de migration ne correspond pas au manifeste revu ;
- refus si une table utilisateur inattendue est déjà présente ;
- `PRAGMA foreign_keys = 1` exigé ;
- `--inspect` = **lectures seules** ; `--apply` exige la phrase tapée à la main
  **`APPLIQUER DAVAR STAGING`** ;
- après écriture : relecture des tables, des index et des reçus, et arrêt à la première anomalie ;
- `--manifest` (nouveau) permet de relire le manifeste hors ligne, en JSON, sans aucun accès réseau.

Commandes, **à exécuter par vous, sur votre PC** :

```powershell
& .\scripts\run-staging-schema.ps1
# Inspection lecture seule : vérifier la cible, les empreintes et « à appliquer » ×3.
& .\scripts\run-staging-schema.ps1 -Apply
# Le script demande de taper exactement : APPLIQUER DAVAR STAGING
```

## 4. Protection, résultat et retour arrière

- **Avant** : la base ne contient aucune donnée métier ; la sauvegarde SQLite déjà téléchargée
  (Export Database → Download SQLite File) reste la référence. **Refaire une capture fraîche** avant
  écriture si la base a changé depuis le 3 octobre.
- **Pendant** : exécution en lot transactionnel libSQL ; un échec annule tout et l'on relit
  `sqlite_master` pour constater l'état.
- **Après** : contrôles en lecture seule — **16 tables, 6 index, 4 reçus** ; `users`, `trainings`,
  `verified_purchases`, `enrollments` toujours à **zéro ligne**.
- **Si un problème survient** : laisser le schéma intact et revenir à la version précédente du
  Worker. **Aucune suppression automatique de table.** Tout retour arrière destructif exige un
  inventaire et un accord séparés.
- La base Turso de production n'est **pas** concernée par cette revue.

## 5. Décision à obtenir avant toute écriture

> **Accord explicite pour appliquer les migrations 002, 003 et 004 uniquement sur
> `davar-campus-staging`**, après lecture de ce document.

Tant que cet accord n'est pas donné, la base reste en lecture seule et aucune migration n'est
exécutée. Une fois l'accord donné et l'application faite, on pourra reprendre la barrière n°
du déploiement privé (`npx cf deploy` du Worker DAVAR), qui reste elle aussi soumise à un accord
distinct.
