# Audit de conformité au prototype

**Date : 18 octobre 2026**
**Statut : aucune ligne de l'application n'a été modifiée.** Ce document ne fait que
comparer. Rien ne bougera avant votre accord, écran par écran.

---

## Comment j'ai procédé

- **Référence** : `reference/prototype-campus` (`index.html` + `js/`), 7 832 lignes.
- **Application en ligne** : `davar-app/app/**/page.tsx`, 49 routes.
- **Précision importante** : le prototype contient deux versions de l'espace étudiant.
  Celle de `js/views-campus.js` est chargée **après** celle de `js/views-student.js`
  (ordre des balises `<script>` dans `index.html`, lignes 142 et 144) : c'est donc
  celle qui s'affiche réellement. C'est celle que j'ai prise comme référence.
- **Portée** : les routes, les titres, les textes visibles et les champs de formulaire.
  Les écarts purement techniques (base de données, chiffrement, envoi d'e-mails) sont
  volontairement hors sujet : ils n'existent pas dans le prototype et sont nécessaires
  à la mise en ligne.

---

## 0. Les trois décisions déjà arrêtées

Ces trois points sont tranchés. Ils seront appliqués ensemble, au moment où vous
donnerez le feu vert.

| # | Décision | Détail |
|---|---|---|
| 1 | **La page d'accueil devient la page de connexion** | La page « Campus privé » est supprimée. Comme dans le prototype, un visiteur qui arrive sur `/` voit « DAVAR ACADÉMIE CAMPUS / Connectez-vous ». |
| 2 | **L'inscription reprend les deux étapes du prototype, avec le blocage** | Étape 1 : l'e-mail d'achat et le bouton « Vérifier mon e-mail ». Étape 2 : la configuration du compte, seulement si l'e-mail est reconnu comme achat confirmé ou invitation valide. Sinon, refus avec le message du prototype. |
| 3 | **Mot de passe : 8 caractères minimum** | Le texte affiché redevient « 8 caractères minimum ». |

---

## 1. Ce que voit un visiteur — comparaison mot pour mot

### 1.1 Page d'accueil `/`

**Le prototype n'a pas de page d'accueil.** Son routeur est formel (`js/app.js`,
lignes 17 à 20) :

```js
if (!S.session) {
  if (r.parts[0] === 'inscription') { app.innerHTML = vSignup(); ... }
  app.innerHTML = vLogin();      // ← tout le reste : la page de CONNEXION
  return;
}
```

| Prototype | En ligne |
|---|---|
| La page de **connexion** | Une page « Campus privé » qui n'existe nulle part dans le prototype |

Le texte en ligne (« Le campus de DAVAR ACADÉMIE réunit vos formations… », le bandeau
« Les inscriptions et les paiements se font sur la page officielle », la section
« Vous avez déjà un accès ») est **entièrement ajouté**.

> **Verdict : page à supprimer.** Décision n° 1.

---

### 1.2 Inscription `/inscription`

Le prototype a **deux étapes** (`vSignup`, `js/views-student.js` ligne 82).

**Étape 1 du prototype — texte exact :**

> **Créer mon compte**
> Entrez l'adresse e-mail utilisée lors de votre achat, c'est celui sur lequel vous avez reçu le message de succès de votre achat.
> `Adresse e-mail d'achat` *(placeholder : vous@exemple.com)*
> **[ Vérifier mon e-mail ]**
> Déjà inscrit ? Se connecter

**Étape 2 du prototype** — elle n'apparaît qu'après reconnaissance de l'e-mail :

> **Configurer mon compte**
> ✓ E-mail reconnu — Vos formations seront ajoutées automatiquement à votre compte.
> `Adresse e-mail (verrouillée)` *(champ grisé)*
> `Nom complet (max 21 caractères)` *(placeholder : Tel qu'il apparaîtra sur vos certificats)*
> `Mot de passe` *(placeholder : 8 caractères minimum)*
> `Confirmer le mot de passe`
> `Photo de profil (facultatif)`
> **[ Créer mon compte ]**
> Retour à la connexion

Si l'e-mail n'est reconnu ni comme achat ni comme invitation, le prototype **refuse** :

> Aucun achat ni invitation trouvé pour cet e-mail. Entrez l'adresse e-mail utilisée lors de votre achat, c'est celui sur lequel vous avez reçu le message de succès de votre achat.

Et si un compte existe déjà :

> Un compte existe déjà avec cet e-mail : connectez-vous.

**Ce qui est en ligne aujourd'hui :**

| Élément | Prototype | En ligne | Écart |
|---|---|---|---|
| Titre | Créer mon **compte** | Créer mon **accès** | modifié |
| Texte d'accroche | « Entrez l'adresse e-mail utilisée lors de votre achat… » | « Utilisez l'adresse e-mail de votre achat **Chariow**… » | modifié (et cite Chariow) |
| Étape « Vérifier mon e-mail » | **oui, obligatoire** | **absente** | manquant |
| Nom complet | « max 21 caractères » | aucune limite | modifié |
| Mot de passe | 8 caractères min | 10 caractères min | modifié |
| Photo de profil | champ facultatif | **absent** | manquant |
| E-mail verrouillé à l'étape 2 | oui | sans objet (pas d'étape 2) | manquant |
| Note « votre mot de passe est transformé sur votre appareil » | absente | présente | **ajoutée** |
| Lien du bas | « Déjà inscrit ? Se connecter » | « Déjà inscrit ? Se connecter » | conforme |
| Pied « © 2026 Davar Académie — Abidjan, Côte d'Ivoire » | présent | présent | conforme |

> **Verdict : les deux étapes sont à reconstruire.** Décisions n° 2 et n° 3.

---

### 1.3 Connexion `/connexion`

**Prototype (`vLogin`) :**

> **DAVAR ACADÉMIE CAMPUS**
> Connectez-vous
> `E-mail` · `Mot de passe` · **[ Se connecter ]**
> Mot de passe oublié ?
> Pas de compte ? S'inscrire

| Élément | Prototype | En ligne | Écart |
|---|---|---|---|
| Titre | DAVAR ACADÉMIE CAMPUS | DAVAR ACADÉMIE CAMPUS | conforme |
| Sous-titre | **Connectez-vous** | Connectez-vous **pour retrouver vos formations** | modifié |
| Libellé e-mail | **E-mail** | Adresse e-mail | modifié |
| Placeholder mot de passe | `••••••••` | Votre mot de passe | modifié |
| Bouton | Se connecter | Se connecter | conforme |
| « Mot de passe oublié ? » | présent | **absent** | manquant |
| Bouton « Renvoyer le lien de confirmation » | absent | présent | **ajouté** |
| Note « transformé sur votre appareil » | absente | présente | **ajoutée** |
| Lien du bas | Pas de compte ? **S'inscrire** | Pas encore de compte ? **Créer mon accès** | modifié |
| Bouton « Retour au catalogue » | **absent** | présent, et pointe vers un catalogue qui n'existe plus | **ajouté** |
| Connexion par empreinte digitale | présente si un appareil est enregistré | absente | manquant |
| Comptes de démonstration | présents hors mode production | absents | conforme en production |

> **Verdict : 6 écarts, dont 3 ajouts.**

---

### 1.4 Écran d'entrée (splash)

Présent des deux côtés (logo + slogan « L'école de l'excellence oratoire »).
À comparer à l'écran, image par image, si vous le souhaitez.

---

### 1.5 Pages sans équivalent dans le prototype

| Page en ligne | Statut |
|---|---|
| `/verifier-email` (confirmation d'adresse) | **Nécessaire.** Le prototype crée le compte sans jamais confirmer l'adresse. Sans cette étape, n'importe qui peut s'inscrire avec l'e-mail d'un autre. À conserver. |
| `/invitation` | Le prototype traite les invitations **à l'intérieur** de l'inscription (étape 2). Page distincte à confirmer. |
| `/transfert` | Le transfert de propriété **existe** dans le prototype, mais comme une section de la page Configuration, pas comme une page. |
| `/verification` | Correspond à la page « Vérifier un certificat » du prototype. |

---

## 2. Espace étudiant

Le menu du prototype (`cpMenuHTML`, `js/views-campus.js`) contient **11 entrées**.

| Prototype | En ligne | Écart |
|---|---|---|
| Accueil (« Votre cockpit du jour ») | `/campus` | conforme |
| Mes formations | `/campus/formations` + `/campus/formation/[id]` | conforme |
| **Mes exercices** | *aucune route* | **manquant** |
| **Mes évaluations** | *aucune route* | **manquant** |
| Mes livres | `/campus/ressources` + `/campus/ressources/livre/[id]` | regroupé |
| Mes audios | `/campus/ressources` + `/campus/ressources/audio/[id]` | regroupé |
| Mes certificats | `/campus/certificats` | conforme |
| **Mes récompenses** | `/campus/distinctions` | **renommé** |
| Mes questions | `/campus/questions` + `/campus/questions/[id]` | conforme |
| Mon profil | `/campus/profil` (« Profil & paramètres ») | titre élargi |
| **Paramètres** | *aucune route* | **manquant** |
| Mes avis *(hors menu, sur sollicitation)* | `/campus/avis` | conforme |
| Notifications *(panneau, pas une page)* | *aucune route* | à vérifier |
| — | **`/campus/aide`** | **ajouté** |

**Résumé étudiant :** 1 page ajoutée (`/campus/aide`), 3 écrans manquants
(exercices, évaluations, paramètres), 1 renommé (récompenses → distinctions),
1 regroupement (livres + audios → ressources).

---

## 3. Direction

Le prototype a **23 sections**. L'application en ligne a **25 routes**.

| Prototype | En ligne | Écart |
|---|---|---|
| Vue d'ensemble | `/direction` | conforme |
| Analytics | `/direction/analytics` | conforme |
| Santé technique | `/direction/sante` | conforme |
| Analyse assistants virtuels | `/direction/assistants` | conforme |
| Badges & distinctions | `/direction/badges` | conforme |
| Activité étudiants | `/direction/activite` | conforme |
| Formations | `/direction/formations` + `/[id]` | conforme |
| Ressources | `/direction/ressources` | conforme |
| **Exercices** | *aucune route* | **manquant** |
| Évaluations (soumissions) | `/direction/devoirs` (« Devoirs à corriger ») | renommé |
| Étudiants | `/direction/etudiants` | conforme |
| Conversations | `/direction/conversations` | conforme |
| Avis | `/direction/avis` (« Avis des étudiants ») | titre élargi |
| Certifications | `/direction/certificats` (« Demandes de certificat ») | titre modifié |
| Ventes | `/direction/ventes` | conforme |
| Assistant virtuel | `/direction/assistant` | conforme |
| E-mails | `/direction/emails` | conforme |
| Activités de l'équipe | `/direction/activites` | conforme |
| Récompenses | `/direction/recompenses` | conforme |
| Exports | `/direction/exports` (« Exports et factures ») | titre élargi |
| Cycle de vie | `/direction/cycle-de-vie` (« Cycle de vie des données ») | titre élargi |
| Équipe | `/direction/equipe` | conforme |
| Configuration | `/direction/reglages` (« Réglages du campus ») | renommé |
| — | **`/direction/integrations`** | **ajouté** |
| — | **`/direction/test`** (Vue test) | **ajouté** |

**Résumé direction :** 2 pages ajoutées (`integrations`, `test`), 1 écran manquant
(Exercices), 4 titres modifiés.

---

## 4. Ce qu'il faut trancher

Ces points ne peuvent pas se déduire du prototype. **Je ne déciderai pas à votre place.**

1. **Le Catalogue et la page de paiement.** Le prototype possède un catalogue de
   formations et une page de paiement (`/catalogue`, `/checkout`). Vous avez demandé
   leur suppression parce que les prix affichés n'étaient pas les vôtres et que la
   vente se fait sur votre page officielle. Cet écart est donc **voulu** — mais il
   faut le confirmer maintenant que le campus est en ligne, car le prototype, lui,
   les affiche.

2. **`/campus/aide`.** Cette page n'existe pas dans le prototype, qui place l'aide
   dans un panneau « support » et dans les Paramètres. La garder comme page, ou la
   faire disparaître au profit des Paramètres ?

3. **`/direction/integrations`.** Absente du prototype. Page réelle ou écran de
   réglages à ranger dans Configuration ?

4. **`/direction/test`.** Absente du prototype. C'est la « vue test » qui sert à
   regarder le campus avec les yeux d'un étudiant. La garder ?

5. **Les trois écrans étudiants manquants** (Mes exercices, Mes évaluations,
   Paramètres). Faut-il les créer tels quels, ou sont-ils volontairement intégrés
   à la page de formation ?

6. **Les exercices côté direction** (liste des exercices, tentatives, score moyen).
   Écran présent dans le prototype, absent en ligne. Le créer ?

7. **« Mes récompenses » est devenu « Mes distinctions ».** Lequel des deux garde-t-on ?

8. **La page `/invitation`.** Le prototype traite les invitations dans l'inscription.
   Page distincte, ou retour au fonctionnement du prototype ?

---

## 5. Limites de cet audit

Cet audit compare les **routes, les titres et les textes visibles**. Il n'a pas encore
comparé **mot pour mot le contenu de chaque écran** (les phrases, les libellés de
boutons, les messages d'erreur) des 40 écrans qui restent — seul le parcours visiteur
l'a été, puisque c'était votre exemple.

Si vous voulez la comparaison exhaustive, je la mène écran par écran, dans l'ordre
que vous choisirez.
