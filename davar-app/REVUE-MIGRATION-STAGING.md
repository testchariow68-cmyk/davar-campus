# Revue obligatoire — schéma DAVAR sur le Turso staging existant

**PAS UNE AUTORISATION D'EXÉCUTER.** Aucun SQL écrit à distance lors de la préparation de ce document.

## Cible et preuve de départ

- Base existante : `davar-campus-staging` (Turso Cloud, moteur **libSQL**, indiqué par le propriétaire).
- SQL console du propriétaire : `SELECT type,name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ...` → **no rows**. Aucune table/vue utilisateur trouvée. Aucun compte, cours, paiement ni droit d'accès connu dans cette base.
- **Jamais** la base de production, ni CockroachDB, ni D1. Aucune nouvelle base, branche ou groupe. Aucun `.env.local` lu/copié. Si le résultat de l'inventaire change, stopper et réviser le plan.

## Changement proposé, exact

Source : [`turso/migrations/001_core.sqlite.sql`](turso/migrations/001_core.sqlite.sql), SHA-256 **`12fd057ec91ee43c60d806314cc950dfe4ff3af6332c5643477a49f52ca311f9`**. Ce fichier propose exactement 9 tables :

1. `schema_migrations` (reçu de version et checksum) ;
2. `users` (e-mail normalisé unique, e-mail vérifié, rôles) ;
3. `sessions` (hash de jeton, date d'expiration) ;
4. `trainings` (formations, prix, produit Chariow unique, publication) ;
5. `verified_purchases` (vente Chariow vérifiée unique) ;
6. `pulse_deliveries` (livraison Chariow unique) ;
7. `enrollments` (droits par utilisateur/formation, reliés à la vente vérifiée) ;
8. `payment_intents` ; 9. `payment_events` (réservées aux paiements futurs, toujours désactivés).

Et 3 index (`idx_sessions_user`, `idx_sessions_expires`, `idx_purchases_email`). **Aucun `DROP`, `DELETE`, `UPDATE`, compte, formation, paiement ou droit n'est introduit.** Une entrée de reçu de migration version 1/checksum/horodatage est ajoutée par l'opérateur *seulement si* tous les `CREATE` réussissent.

## Mécanisme d'exécution prévu (pas encore autorisé)

Script : [`scripts/staging-schema.mjs`](scripts/staging-schema.mjs), ajouté après la première archive : il n'est **pas encore** sur le PC du propriétaire. Un lanceur PowerShell [`scripts/run-staging-schema.ps1`](scripts/run-staging-schema.ps1) demande localement l’URL staging et le jeton avec saisie masquée, ne les écrit dans aucun fichier et retire les variables de sa session après usage. Il refuse toute cible hors `APP_ENV=staging`, toute URL dont l'hôte n'est pas exactement `TURSO_EXPECTED_HOST` et ne commence pas par `davar-campus-staging-`, toute modification du fichier SQL (hash), et toute table/vue utilisateur déjà présente. Il exige `PRAGMA foreign_keys = 1` en lecture et une phrase de confirmation saisie dans le terminal pour `--apply`. Il utilise `@libsql/client/web` et un `batch(..., 'write')` : **12 DDL + reçu**, transactionnel côté libSQL (échec = annulation). La commande `--inspect` ne fait que des lectures. Préparer un jeton d'écriture **temporaire limité uniquement à cette base staging** et le saisir sur votre propre PC au moment voulu ; aucun secret dans le chat ou les fichiers du projet.

Commandes proposées **après accord distinct et placement privé des variables sur le PC**, jamais dans ce chat :

```powershell
& .\scripts\run-staging-schema.ps1
# Inspection lecture seule ; STOP : vérifier la sortie, la cible et les noms.
& .\scripts\run-staging-schema.ps1 -Apply
# Le script demande ensuite de taper exactement APPLIQUER DAVAR STAGING.
# Il exige un jeton TEMPORAIRE limité uniquement à cette base staging.
```

**Ne pas coller le SQL entier dans l'éditeur web** tant que son comportement multi-instructions/transactionnel n'est pas testé ; ne pas cliquer sur « Review and create ». Le SQL `turso/schema.sql` historique est exclu.

## Protection, résultat et retour arrière

- Protection avant écriture : la base staging a zéro table utilisateur selon l'inventaire ; conserver sa capture/son résultat. L'onglet **Overview** montre **Export Database → Download SQLite File** : télécharger une copie locale privée de la base existante **avant** migration, ne pas l'envoyer dans le chat ni dans le projet. Contrôler la présence et la taille du fichier téléchargé ; vérifier la capacité de restauration séparément si la base cesse d'être vide. Si des données apparaissent, arrêter et réviser le plan. Pas de nouvelle base de sauvegarde autorisée.
- Si un DDL échoue, le batch libSQL doit annuler **tout** ; vérifier le résultat en relisant `sqlite_master`. Le support de transaction doit être confirmé en conditions réelles staging avant de s'y fier pour des données réelles : https://docs.turso.tech/sdk/ts/reference
- Si le batch réussit mais l'app ne fonctionne pas : laisser le schéma staging intact, **désactiver/revenir à la version précédente du Worker**, diagnostiquer. **Pas de suppression automatique des tables** : tout rollback destructif exige un inventaire et un accord séparés. La base de production reste intacte.
- Après succès : relire les 9 tables, 3 index, `schema_migrations` version 1/checksum, et confirmer zéro ligne dans `users`, `trainings`, `verified_purchases` et `enrollments`. Puis seulement préparer une formation **fictive** en staging et la connexion privée du Worker, sous revue séparée. Ni authentification ni webhook Chariow activés par cette migration seule.

**Décision à obtenir avant toute écriture :** accord explicite pour cette migration **uniquement sur `davar-campus-staging`**, après lecture du SQL et du plan ci-dessus ; sinon on reste en lecture seule.
