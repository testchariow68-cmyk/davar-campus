# Assistant virtuel — la configuration, telle qu'elle est écrite

> **À quoi sert ce document.** Le propriétaire a demandé : « la façon dont il doit être
> configuré y figure bien, n'est-ce pas ? Nous ne devons pas perdre le fil. » Oui. Elle y
> figure, en détail, à plusieurs endroits. Ce document les rassemble en un seul, **sans rien
> inventer** : chaque règle porte sa source exacte (fichier et ligne) pour être vérifiable.
>
> **Ce document décrit ce que le propriétaire a ÉCRIT.** L'état réel de l'application
> est en § 6, tenu à jour : au 7 octobre 2026, l'assistant est **branché de bout en
> bout** — il ne manque que la clé d'un moteur gratuit, à poser côté serveur.

---

## 1. Les cinq endroits où la configuration est écrite

| Source | Ce qu'elle fixe |
|---|---|
| `reference/prototype-campus/js/data.js` (l. 117-126) | La configuration par défaut de l'assistant : fournisseur, chaîne de secours, nom, photo, température, transcription, base de connaissances |
| `reference/prototype-campus/js/views-admin.js` (l. 1030-1105, `saveAI()` l. 1235) | L'écran de configuration complet, réglage par réglage, et ce que chacun commande |
| `reference/prototype-campus/ARCHITECTURE.md` (l. 56-65) | La couche fournisseur indépendante, le nom affiché, et la règle d'isolation : « index vectoriel **par formation** (namespace séparé) → aucun mélange entre formations distinctes » |
| `reference/SPEC-V4-NOTES.md` (point 30) | Vos notes V4 : « isolation stricte par formation achetée + reçoit le nom de l'étudiant ; répondre selon SES formations seulement ; admin configure photo/nom/langue ; fournisseurs gratuits uniquement (Groq/Gemini/OpenRouter/HF) » |
| `PRODUCTION-MANIFEST.md` (l. 58) et `CONFORMITE-DOCUMENTS.md` (l. 93) | L'inventaire : la ligne « Assistant IA » existe dans le prototype et **pas** dans l'application |

**Ce qu'en dit votre développeur** — « ils tiendront compte du contenu de chaque module » — est
donc bien écrit, mot pour mot, dans votre dossier : le message d'accueil du prototype dit
*« Il répond à partir des connaissances fournies par le coach principal. »* (`views-student.js`,
l. 1618). Ce n'est pas une invention : c'est votre spécification.

---

## 2. La configuration, réglage par réglage

### 2.1 Le moteur — une chaîne de secours, jamais un seul fournisseur

Le prototype ne choisit pas « une IA » : il en installe **quatre en chaîne**, avec une règle
de bascule automatique (`views-admin.js`, l. 1031-1034) :

> « 0 FCFA : fournisseurs avec offres gratuites capables de 500-1000 étudiants/an. Ils forment
> une chaîne : mêmes données, mêmes consignes, ~99 % mêmes réponses. Quota journalier atteint →
> le suivant prend le relais ; le lendemain, le 1er revient. »

Ordre par défaut : **Groq → Google Gemini → OpenRouter → Hugging Face**, plus une entrée
« Personnalisée (API) » pour votre propre moteur (`data.js`, l. 123 : `fallbackChain`).

- Un clic sur un fournisseur le place **en tête de chaîne**.
- L'écran affiche en clair lequel est **actif maintenant**, lesquels sont **en secours**, et
  lequel a **atteint son quota** (« quota du jour atteint — relayé »).
- Un bouton « Simuler : quota atteint » existe **exprès** pour vérifier la bascule sans attendre.

C'est exactement votre ADN : *nous protégeons les quotas, nous ne les dépensons pas.*

### 2.2 La clé et la connexion

- Clé API rangée en zone mot de passe, « **chiffrée côté serveur**. La couche d'intégration
  traduit les appels quel que soit le fournisseur » (`views-admin.js`, l. 1055).
- Bouton « **Tester la connexion** », avec retour immédiat.
- État affiché : **« Connecté »** ou **« Déconnecté »**, visible d'un coup d'œil.

> **Règle ferme, non négociable** : la clé ne doit **jamais** se trouver dans le navigateur de
> l'étudiant. C'est le seul point où votre principe « tout ce qui peut passer côté client y
> passe » doit céder — sinon n'importe quel étudiant peut copier la clé et dépenser votre argent.
> C'est aussi ce qu'écrit le prototype : *chiffrée côté serveur*.

### 2.3 L'identité affichée

| Réglage | Règle écrite | Source |
|---|---|---|
| **Nom** | Par défaut, le nom du système IA (`Monsieur Koffi`) ; si vous définissez un nom personnalisé, « il devient le nom affiché partout dans le Campus » | `views-admin.js` l. 1080-1083 ; `data.js` l. 119 |
| **Photo** | « Une vraie photo, comme les profils des membres humains. Elle s'affiche partout où l'assistant apparaît. » | `views-admin.js` l. 1075-1078 |
| **Langue** | Français, English, Español, Português. « L'assistant reçoit aussi le nom de chaque étudiant. » | `views-admin.js` l. 1085-1088 |
| **Température** | Créativité réglable, 0,4 par défaut | `data.js` l. 119 ; `views-admin.js` l. 1091 |
| **Partout où il apparaît** | Son nom remplace « Réponse IA » dans les modules | `SPEC-V4-NOTES.md` point 8 |

### 2.4 La base de connaissances — la règle centrale

Écrite deux fois, à deux endroits, sans ambiguïté :

- `ARCHITECTURE.md` (l. 64-65) : « **Base de connaissances** : index vectoriel **par formation**
  (namespace séparé) → aucun mélange entre formations distinctes. »
- Écran de configuration (`views-admin.js`, l. 1097-1099) : une case **par formation**, avec
  cette phrase : « Associez l'assistant aux contenus de chaque formation. Les connaissances
  restent **séparées par formation** — aucun mélange entre elles. »

**Conséquence directe** : l'assistant d'un étudiant répond **selon les formations qu'il a
achetées, et seulement elles**. Un étudiant inscrit à une formation n'obtient aucune réponse
tirée d'une autre (`SPEC-V4-NOTES.md`, point 30).

### 2.5 La supervision humaine — l'assistant n'est jamais un mur

`views-admin.js` (l. 1101-1103) : « L'assistant répond en premier niveau. Les coachs voient
toutes les conversations et peuvent valider, corriger ou répondre à la place de l'IA — sans
jamais être bloqués par elle. »

Et `ARCHITECTURE.md` (l. 19) : « L'IA répond en premier niveau ; le coach peut valider,
corriger, compléter ou répondre — **la réponse IA n'est jamais un mur.** »

### 2.6 La transcription des avis audio

Deux moteurs open source, gratuits, sans serveur à héberger (`views-admin.js`, l. 1060-1065) :

| Choix | Ce que le prototype en dit |
|---|---|
| **Whisper large-v3 via Groq** (recommandé) | Modèle open source, API hébergée gratuite : ≈ 2 000 transcriptions/jour, 99 langues, très pointu. Aucun VPS. |
| **Whisper dans le navigateur** (transformers.js) | « 100 % open source, s'exécute sur l'appareil de l'étudiant : zéro quota, zéro serveur, zéro coût. Un peu plus lent. » |

Cette seconde option est du **côté client pur** : c'est votre principe appliqué à la lettre.

---

## 3. Ce que l'étudiant voit, exactement

`views-student.js` (l. 1600-1630) décrit le panneau, écran par écran :

1. **Ouverture depuis n'importe quel module** : bouton « Demander à <nom> » (l. 720), avec la
   mention « <nom> (IA) répond immédiatement · Coach humain sous 48 h » (l. 722).
2. **Deux onglets**, jamais confondus : « Assistant virtuel — immédiat » et « Coach humain ».
3. **Ligne de contexte** affichée en tête : le module et la formation en cours.
4. **En-tête** : la photo, le nom, et « Assistant virtuel · **supervisé par vos coachs** ».
5. **Message d'accueil** : « Posez vos questions. <nom> est le cerveau virtuel de votre coach.
   Il répond à partir des connaissances fournies par le coach principal. N'hésitez pas. »
6. **Réponse immédiate**, avec cette note : « Un coach peut intervenir à tout moment pour
   valider ou compléter. »
7. **Vers le coach** : « Votre Coach répond généralement sous <b>48 heures</b>. »
8. **« Mes questions »** (`views-campus.js`, l. 700) : l'historique de ses conversations avec
   l'assistant **et** son coach, relisible à tout moment.

Trouvé aussi, à respecter : dans une conversation, l'assistant est signé de son nom, et le
coach signé du sien (`msgHTML`, l. 1634).

---

## 4. La demande la plus récente du propriétaire (7 octobre 2026)

Ces mots ne sont pas encore dans les documents ; ils le deviennent ici, à sa demande :

> L'assistant doit répondre « en se basant sur mes cours et contenus fournis, mais aussi en
> faisant des apprentissages basés sur mes données fournies, pour ne pas être monotone et
> répéter ce que dit le cours que l'étudiant vient d'écouter ».

Traduction en règles vérifiables :

1. **Il part de vos contenus** — jamais d'un savoir extérieur présenté comme le vôtre.
2. **Il ne récite pas la leçon que l'étudiant vient d'écouter** : il l'éclaire autrement —
   exemple concret, reformulation, cas pratique, question de vérification.
3. **Il reste dans votre ligne pédagogique**, celle de vos modules, et dans la formation
   concernée.
4. **Il ne remplace pas le coach** : il déblaie le plus simple, le coach tranche le reste.

C'est bien ce que le prototype promettait — « le cerveau virtuel de votre coach » — mais poussé
plus loin : un assistant qui **explique autrement**, au lieu de répéter.

---

## 5. Les deux règles de données à ne pas oublier

`reference/prototype-campus/js/lifecycle.js` (l. 20-21, 178-195) : la purge est déjà fixée.

| Contenu | Durée de conservation |
|---|---|
| Conversation avec l'assistant | **90 jours** (statistiques anonymisées conservées) |
| Conversation avec le coach | **12 mois** maximum (exception : litige ou obligation) |

Un assistant qui conserve des échanges sans limite serait une faute : la durée est écrite, elle
sera respectée.

---

## 6. Ce qui existe aujourd'hui, dit sans arrondir

| Élément | Prototype | Application (7 octobre 2026) |
|---|---|---|
| Écran de configuration (moteurs, nom, langue, température, plafond) | ✅ | ✅ **construit** — Direction → Assistant virtuel |
| Chaîne de secours entre fournisseurs gratuits | ✅ | ✅ **construite** — bascule automatique sur quota, bouton de simulation pour la vérifier |
| Base de connaissances par formation | ✅ | ✅ **construite** — association par formation, isolation vérifiée par test |
| Panneau de discussion étudiant (assistant + coach) | ✅ | ✅ **construit** — mêmes classes que le prototype, deux onglets |
| Historique « Mes questions » | ✅ | ✅ **construit** — avec les durées de conservation |
| Supervision du coach (valider, corriger, répondre) | ✅ | ✅ **construite** — Direction → Conversations |
| Notifications (cloche, 48 h après lecture) | ✅ | ✅ **construites** |
| Clé d'API hors du navigateur | ✅ | ✅ **respecté** — 6 liaisons serveur déclarées |
| **Clé d'un moteur réellement posée** | — | ⚠️ **à faire par le propriétaire** : sans clé, l'assistant le dit honnêtement et renvoie au coach |
| **Index vectoriel** (recherche du passage pertinent) | ✅ décrit | ⚠️ à venir : aujourd'hui les contenus sont transmis par extraits ; suffisant tant que les formations restent modestes |
| Photo de l'assistant | ✅ | ⚠️ à venir (le nom, la langue et la couleur sont déjà là) |
| Transcription des avis audio | ✅ | ⚠️ à venir (le choix du moteur est déjà enregistré) |

Dans le prototype lui-même, la réponse « intelligente » est un texte figé tiré au hasard
(`aiAnswer()`, `views-student.js` l. 1639) : aucun appel à un vrai moteur n'y existe. Le
prototype décrit la configuration ; l'application, elle, la fait fonctionner.

---

## 7. Le préalable, et l'ordre de construction

**Préalable absolu** : l'assistant ne peut lire que ce qui existe. La plateforme contient
aujourd'hui **une formation fermée et zéro leçon**. Il n'y a rien à lire. L'import de votre
contenu réel passe donc avant, ou en même temps.

Ordre proposé, du plus utile au plus fin :

1. ✅ **Le panneau de discussion** côté étudiant, avec le nom configurable et la ligne de
   contexte, et l'onglet « Coach humain » à 48 h — **fait**.
2. ✅ **Le branchement du moteur** — clé **côté serveur**, **plafond de questions par étudiant
   et par jour** — **fait**. Il reste à poser **une** clé gratuite (Groq recommandé).
3. ✅ **La chaîne de secours** entre fournisseurs — **faite**.
4. ✅ **La base de connaissances par formation**, avec son isolation stricte — **faite**.
   L'**index vectoriel** viendra quand le volume de contenus le justifiera.
5. ✅ **L'écran de configuration complet** dans la Direction — **fait**.
6. ✅ **La supervision coach** — voir, valider, corriger, répondre — **faite**.
7. ⏳ **La transcription des avis audio** — Whisper dans le navigateur d'abord (zéro coût).
8. ⏳ **Vos contenus réels** — vos modules et leçons, que vous importerez vous-même.
   L'assistant s'en nourrira à la seconde où ils seront là.

---

## 8. Ce qu'on considérera comme réussi

- Un étudiant pose une question depuis un module et reçoit, **en quelques secondes**, une
  réponse qui s'appuie sur **sa** formation — et qui **ne se contente pas de lui répéter la
  leçon qu'il vient de suivre**.
- L'assistant porte **le nom et la photo** que vous avez choisis, partout où il apparaît.
- Un étudiant ne reçoit **jamais** de contenu issu d'une formation qu'il n'a pas achetée.
- Votre clé n'apparaît **jamais** dans le navigateur d'un étudiant.
- Quand un fournisseur atteint son quota, **un autre prend le relais sans que l'étudiant s'en
  aperçoive**, et sans dépense.
- Un coach peut **valider, corriger ou compléter** n'importe quelle réponse.
- Zéro frais d'IA tant que la charge reste dans les paliers gratuits — et le plafond par
  étudiant est là pour que cela reste vrai.
