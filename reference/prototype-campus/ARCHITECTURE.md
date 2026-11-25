# HISTORIQUE — prototype et ancienne architecture de production

**Architecture actuelle retenue :** Turso comme unique base applicative à construire progressivement ; voir `TURSO-SEUL-PLAN.md`. Les propositions Supabase et choix métier anciens ci-dessous sont historiques, **pas** des instructions de déploiement ni de purge.

## Ce que contient le prototype

Application web interactive (aucune dépendance externe) qui matérialise le cahier des charges :

| Espace | Contenu |
|---|---|
| **Connexion** | 3 comptes démo : Étudiante (Awa), Coach (Mariam), Super Administrateur (Yann) |
| **Étudiant** | Tableau de bord (progression, « à faire », contenus récents), formations, lecteur vidéo multi-ratios (16:9, 9:16, 4:3…), sections séparées *contenu principal / ressources / vidéos complémentaires*, exercices non bloquants (choix unique/multiple, correction, reprise), évaluations bloquantes (score minimum 80 %, soumissions avec validation humaine), chat **Assistant IA / Coach**, notifications, catalogue, checkout (Wave, Orange Money, MTN MoMo, carte), certificats |
| **Centre de contrôle** | Vue d’ensemble, étudiants, éditeur de formations (Formation → Chapitres → Modules), exercices, évaluations & soumissions (valider / refuser / nouvelle tentative avec explication obligatoire), supervision des conversations IA, configuration de l’assistant (fournisseur, nom affiché, base de connaissances par formation), équipe à rôles cumulables, certifications, ventes (chaîne *achat confirmé → compte identifié → formation attribuée*), analytics, configuration |

**Règles clés implémentées dans la logique :**
- Progression strictement individuelle, déblocage conditionnel (contenu consulté → évaluation réussie → validation humaine).
- L’exercice apparaît au bon moment mais **ne conditionne jamais** la progression.
- Un rachat **n’ajoute qu’une formation** au compte existant (aucun doublon d’étudiant).
- L’IA répond en premier niveau ; le coach peut valider, corriger, compléter ou répondre — la réponse IA n’est jamais un mur.
- Refus / nouvelle tentative toujours accompagnés d’une explication.
- Certificat émis automatiquement quand toutes les étapes bloquantes sont validées.

Les données sont persistées en `localStorage` (état réinitialisable depuis le menu avatar).

## Passage en production

### Stack cible
- **Frontend** : Next.js (ou équivalent) — l’UI du prototype sert de référence design.
- **Base de données & Auth** : **Supabase** (Postgres + Row Level Security).
- **Vidéos** : **Cloudflare R2** via l’API compatible S3 ; lecture par **URLs signées temporaires** + vérification d’accès côté API.
- **Notifications** : **Push Web (VAPID)** avec dédoublonnage des événements.
- **Paiement** : passerelle mobile money / carte ; webhook `achat.confirme` consommé par le Campus.

### Schéma Supabase (extrait)
```
users(id, email, role, …)                    team_roles(user_id, role)   -- rôles cumulables
trainings(id, title, price, published, …)
chapters(id, training_id, position)
modules(id, chapter_id, position, video_key, ratio, text)   -- video_key = objet R2
resources(id, module_id, kind, file_key)    extra_videos(id, module_id, …)
exercises(id, chapter_id)  exercise_questions(id, exercise_id, type, …)
assessments(id, chapter_id, type quiz|submission, min_score)
enrollments(user_id, training_id)            -- unicité (user, training)
progress(user_id, module_id, pct, viewed, at)
exercise_attempts(user_id, exercise_id, score, at)
assessment_attempts(user_id, assessment_id, score, passed, at)
submissions(id, user_id, assessment_id, file_key, status, feedback, decided_by)
threads(id, user_id, module_id)  messages(id, thread_id, from student|ai|coach|sys, text, at)
notifications(id, user_id, type, title, body, read, dedupe_key)
certificates(id, code, user_id, training_id, issued_at, status)
sales(id, user_id, training_id, amount, method, status, external_ref)
audit_log(id, actor_id, action, payload, at)
```
La RLS garantit qu’un étudiant ne lit **jamais** la progression d’un autre.

### Couche Assistant IA (indépendante du fournisseur)
```
interface AIProvider {
  name(): string
  complete(prompt, context, opts): Promise<string>
}
OpenAIAdapter · AnthropicAdapter · MistralAdapter · CustomAdapter
```
- Le Campus ne connaît que l’interface ; le fournisseur est un réglage d’admin.
- **Nom affiché** : défaut = nom du système IA ; surcharge par le Super Admin (`ai_config.display_name`).
- **Base de connaissances** : index vectoriel **par formation** (namespace séparé) → aucun mélange entre formations distinctes.

### Flux de vente
`Paiement confirmé → webhook signé → recherche du compte par e-mail/téléphone →
s’il existe : ajout de la formation (enrollments, unicité) ; sinon : création unique → notification.`

### Flux vidéo sécurisé
`Étudiant demande un module → l’API vérifie enrollment + étape débloquée →
génère une URL R2 signée (TTL court) → le lecteur lit le fichier à son ratio réel.`

## Lancer le prototype
```bash
cd davar-campus
python3 -m http.server 8080 --bind 0.0.0.0
# ouvrir http://localhost:8080
```
