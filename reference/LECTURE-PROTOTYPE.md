# Lecture du prototype — le document de travail

> Établi le 6 octobre 2026 après réception du dossier complet (ZIP `workspace-01a10e9f-…`, 253 entrées).
> Ce document **trie** ce qui a été reçu : ce qui sert, ce qui ne sert pas, ce qui manque, et
> l'écart exact entre le prototype et l'application réelle.

---

## 1. Ce qui a été reçu, et ce qu'on en a fait

| Reçu | Volume | Décision |
|---|---|---|
| `davar-campus/` — le prototype complet | 5,4 Mo | **Conservé** : `reference/prototype-campus/` (code, style, assets, documents) |
| `site/` — la vitrine publique | 1,9 Mo | **Conservé** : `vitrine/` — c'est la présentation officielle, prête à déployer |
| `uploads/` — captures d'écran de travail | 4,5 Mo | **Non conservé** : ce sont des captures de mise au point, pas une référence |
| `.config/.wrangler/logs/` — journaux | 65 Ko | **Non conservé** : journaux de machine, aucun intérêt |
| `davar-app/` (ancienne copie) | 2,4 Mo | **Non conservé** : l'application du dépôt est plus récente et plus complète |
| ZIP imbriqués (`*-staging-worker*.zip`, etc.) | ~4 Mo | **Non conservé** : versions antérieures de ce que le dépôt contient déjà |
| `davar-app/.env.local` | — | **Non conservé** : contient un marqueur de secret (`whsec_dev_test_secret_a_remplacer`). Vérifié : **ce n'est pas un vrai secret**, aucun identifiant réel ne fuit. À retirer quand même du ZIP public. |

---

## 2. Le prototype en chiffres — la mesure de l'écart

| Fichier | Lignes | Fonctions | Rôle |
|---|---|---|---|
| `views-admin.js` | 2 726 | 162 | Administration complète |
| `views-student.js` | 2 123 | 136 | Parcours étudiant |
| `views-campus.js` | 977 | 79 | Campus, catalogue, achats |
| `data.js` | 717 | 28 | Modèle de données (localStorage) |
| `lifecycle.js` | 352 | 17 | Cycle de vie et purge |
| `ui.js` | 298 | 42 | Interface |
| `rewards.js` | 278 | 20 | Récompenses et badges |
| `app.js` | 123 | 6 | Amorçage, routage |
| `icons.js` | 94 | 1 | Icônes |
| `emails.js` | 51 | 2 | E-mails |
| `security-client.js` | 36 | 3 | Sécurité côté navigateur |
| **Total** | **≈ 7 900** | **≈ 490** | |

### Écrans identifiés dans le prototype

**Étudiant** : Mes formations · Découvrir plus de formations · Chapitres · Exercices · Mes exercices ·
Mes évaluations · Mes questions · Mes certificats · Mes livres · Mes audios (lecture) · Mes avis ·
Notifications · Mon profil · Paramètres · Assistant virtuel · Contenu verrouillé · Compte suspendu ·
Paiement en attente de vérification · Achat confirmé

**Direction** : Vue d'ensemble · Formations · Étudiants · Activité des étudiants · Équipe ·
Conversations · Assistant virtuel · Certifications · Avis des étudiants · Badges & distinctions ·
Récompenses · E-mails · Exports · Configuration · Cycle de vie des données · Facilité d'accès restreint

---

## 3. La découverte importante : la « vue test » EXISTE déjà dans le prototype

Le propriétaire l'a demandée ; elle était **déjà pensée** dans `views-admin.js`. Le mécanisme exact :

```
viewAsList()   → ne propose QUE les comptes dont l'identifiant commence par « u-test- »
                 jamais le fondateur (« u-yann »), jamais une vraie personne
viewAs(uid)    → refuse tout ce qui n'est pas un compte de test, avec ce message exact :
                 « La vue test n'ouvre que des comptes test — jamais le fondateur
                   ni une vraie personne. »
               → mémorise le vrai compte dans `viewAsReal` et n'ouvre que la vue testée
quitViewAs()   → retour au vrai compte ; touche Échap sur ordinateur
viewAsBannerHTML() → bandeau permanent en haut : « Vue test : <nom> — touche Échap pour quitter »
```

Deux règles de droits, également écrites dans le prototype :
- **le Super Admin a toujours le test de vue** (toutes les vues) ;
- **le Manager seulement si l'option est activée** en Configuration — et **jamais la vue du fondateur**.

**Ce qui existe aujourd'hui dans l'application** : la marque `is_test` en base et un onglet « Vue
test » qui **montre** le vrai contenu en lecture seule. **Ce qui manque encore** : le fait de
**basculer réellement** dans la vue du compte test, avec le bandeau et le bouton « Quitter », pour
voir les écrans exactement comme la personne les verra. C'est la prochaine brique.

---

## 4. Écart réel : prototype → application (mesuré, pas estimé)

Ce que l'**application** fait aujourd'hui, réellement, avec une vraie base et un vrai serveur :
authentification (dérivation dans le navigateur, e-mail vérifié, sessions, rôles, suspension) ·
catalogue · formations, modules et leçons · progression enregistrée · Espace Direction (créer une
formation, bâtir ses modules et leçons, ouvrir/fermer, gérer les étudiants, nommer l'équipe, comptes
de test, purge).

Ce que le prototype montre et que l'application **n'a pas encore** :

| Domaine | Fonctionnalités du prototype encore absentes |
|---|---|
| **Contenu** | Livres (lecteur paginé) · livres audio · ressources attribuées par étudiant |
| **Évaluation** | Exercices non bloquants · évaluations bloquantes (score minimum 80 %, validation humaine) |
| **Certification** | Demande → validation humaine → génération Apps Script/Slides · PDF officiel + aperçu · page publique de vérification par code · certificat figé au nom capturé |
| **Récompenses** | 10 badges par formation · Premier Pas, En Route, Retour en Force · attribution automatique et manuelle journalisée |
| **Avis** | Avis obligatoires (2 semaines / 1 mois, 1 000 mots, écrit ou audio transcrit) · Spotlight |
| **Assistant** | Assistant virtuel configurable (nom, photo, langue) · isolation par formation · questions IA immédiates + coach sous 48 h |
| **Échanges** | Conversations, supervision, réponses du coach · support flottant (casque) · WhatsApp et appel |
| **Notifications** | Cloche · disparition 48 h après lecture · motivations du dimanche |
| **Social** | Ticker d'annonces et de plateformes · désabonnement par utilisateur |
| **Direction** | Exports CSV protégés par mot de passe · factures · Google Sheets · clés API · e-mails (section test et production) |
| **Vie privée** | Cycle de vie et purge (12 h) : soumissions, conversations, notifications, sessions, comptes inactifs |
| **Apparence** | Modes clair/sombre et **4 palettes** au choix · navigation pleine page sur téléphone |
| **Accès** | Accès gracieux 3 jours · invitation du staff (7 jours) · transfert de propriété sécurisé complet |

**Lecture honnête** : le prototype est une maquette d'expérience très riche (≈ 7 900 lignes,
≈ 490 fonctions, tout dans le navigateur). L'application possède aujourd'hui **le socle réel** —
identité, base, droits, contenu, direction — et **une fraction des écrans**. Atteindre la parité
signifie construire chacun de ces domaines côté serveur, un par un. Aucun raccourci n'est possible :
c'est précisément ce que le prototype ne pouvait pas faire (il ne partage rien entre deux appareils).

---

## 5. Deux points à trancher par le propriétaire

1. **La vitrine annonce 5 formations, une seule est achetable.** Les quatre autres (Marketing
   Digital, Anglais professionnel, Excel, Créer son entreprise) sont présentées en cartes, **sans
   prix ni bouton d'achat** — c'est donc moins trompeur que le catalogue de l'application, qui
   affichait des prix. Mais les documents structurés déclarent quatre « Course » de plus. Décision
   attendue : les garder comme annonce, ou n'annoncer que la formation vendable ?
2. **Le domaine de la vitrine est un marqueur.** `davar-academie.pages.dev` doit être remplacé
   partout par le domaine définitif avant la mise en ligne (le fichier le dit lui-même en tête).
