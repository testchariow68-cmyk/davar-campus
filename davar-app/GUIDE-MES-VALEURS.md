# TOUTES VOS VALEURS, SERVICE PAR SERVICE

> **À lire en premier.** Ce document vous dit, pour chaque valeur : **où cliquer**,
> **quoi copier**, et **quel nom exact** lui donner. Suivez-le de haut en bas, une
> seule fois : à la fin, tout est collecté et vous n'aurez plus d'aller-retour.
>
> **Règle absolue** : vos secrets ne se collent **jamais** dans une conversation.
> Ils vont dans `davar-app\.env.local` (fichier privé, ignoré par git), puis dans
> Cloudflare, en **Secret**. La vérification se fait par `npm run recette:services`,
> qui n'affiche que des verdicts — jamais une valeur.

---

## 0 bis. Où vit ce fichier — et ce qu'on n'en fait JAMAIS

| | |
|---|---|
| **Son nom exact** | `.env.local` (le point au début fait partie du nom) |
| **Son emplacement exact** | à la racine du dossier `davar-app`, donc : `davar-app\.env.local` |
| **Un autre nom ?** | Il **ne sera pas lu** par l'application. C'est le nom qui compte, pas le contenu. |
| **Est-il dans GitHub ?** | **Non, et il ne doit JAMAIS y être.** Le dépôt est public : publié, ce fichier donnerait à n'importe qui votre base, vos e-mails et votre stockage. |

**Est-ce « le même fichier » sur toutes vos machines ?** Le **chemin** est le même
partout, mais chaque machine a **sa propre copie** : le fichier est volontairement
**exclu** du dépôt, donc il ne voyage pas avec le code. Pour le transporter d'un
ordinateur à l'autre : **Drive, clé USB ou gestionnaire de mots de passe** — jamais
Git.

> ⚠️ **Ne faites jamais ça :** `git add -f .env.local` puis `push`. Le `-f`
> (« forcer ») est la seule façon d'y arriver, et c'est exactement la commande à
> ne pas taper. Un test du dépôt (`tests/secrets-jamais-versionnes.test.mjs`)
> refuse d'ailleurs tout fichier de secrets suivi par git, et vérifie qu'aucune
> valeur ressemblant à une vraie clé n'existe dans le code publié.

**Et pour la mise en service, rien de tout cela ne passe par GitHub** : les mêmes
noms se saisissent dans **Cloudflare → votre Worker → Settings → Variables and
Secrets**, en **Secret**. Le code, lui, est déjà publié.

### Obtenir le fichier sur votre machine — précisément quoi télécharger

⚠️ **D'abord la branche.** Le travail vit sur `arena/09f3da07-davar-campus`, **pas**
sur `main`. Sur GitHub, choisissez-la **avant** de télécharger : menu déroulant
qui affiche « main » (en haut à gauche de la liste des fichiers) → sélectionnez
`arena/09f3da07-davar-campus` → **puis** `Code → Download ZIP`.

Lien direct, qui télécharge la bonne branche sans rien chercher :
<https://github.com/testchariow68-cmyk/davar-campus/archive/refs/heads/arena/09f3da07-davar-campus.zip>

**Vous téléchargez = l'archive ZIP** du dépôt (≈ 26 Mo, dont 17,7 Mo sont votre
propre archive d'origine : vous pouvez l'ignorer). Vous la décompressez, et vous
obtenez un dossier `davar-campus-arena-09f3da07-davar-campus` contenant trois
choses : `davar-app/` (l'application), `reference/` (le prototype conservé) et
votre archive.

**Tout se passe dans `davar-app/`** — c'est là qu'il y a `package.json`, donc
là que se lancent toutes les commandes. **Jamais à la racine décompressée.**

1. Installez **Node.js** si vous ne l'avez pas : <https://nodejs.org> → version
   « LTS » (20.9 ou plus récente).
2. Ouvrez un terminal **dans le dossier `davar-app`** : sur Windows, clic droit sur
   le dossier → « Ouvrir dans le Terminal ».
3. `npm install` — quelques minutes, une seule fois.
4. `npm run env:local` — il fabrique les trois clés et écrit `davar-app\.env.local`,
   avec la liste de ce qui reste à remplir.
5. Complétez-le avec les valeurs des sections 1 à 5 de ce guide (ou partez du
   fichier `A-COLLER-DANS-env-local.txt` que je vous ai préparé — même contenu,
   à enregistrer sous le nom `.env.local`).
6. Vérifiez : `npm run recette:services`.

> **Avec git, c'est plus simple** (si vous l'avez) :
> `git clone https://github.com/testchariow68-cmyk/davar-campus.git`
> puis `cd davar-campus` · `git checkout arena/09f3da07-davar-campus` · `cd davar-app`.

---

## 0. Avant de commencer — 1 minute

Dans le dossier `davar-app`, ouvrez un terminal et lancez :

```powershell
npm run env:local
```

Ce script **fabrique pour vous** les trois valeurs que personne ne peut vous
fournir (elles protègent les comptes et le diagnostic) et écrit un
`.env.local` prêt à remplir, avec tous les noms déjà en place :

| Nom | D'où il vient |
|---|---|
| `AUTH_PARAMS_SECRET` | **fabriqué** par le script (64 caractères) |
| `AUTH_VERIFIER_PEPPER` | **fabriqué** par le script (64 caractères) |
| `APP_DIAGNOSTIC_TOKEN` | **fabriqué** par le script (64 caractères) |

Il affiche ensuite la liste des noms **encore à remplir** — jamais leur valeur.
Vous n'avez plus qu'à coller les 13 autres valeurs au bon endroit, en suivant ce
document. (Relancer `npm run env:local` ne change **jamais** une valeur déjà
présente : il ne fait que compléter ce qui manque.)

---

## 0 bis. Les cinq noms qui ne se trouvent dans AUCUN tableau de bord

Si vous cherchez ces cinq-là sans les trouver, c'est normal : **quatre ne se
copient nulle part, il faut les fabriquer.** Voici d'où vient chacun.

| Nom | D'où il vient, exactement | Où il va |
|---|---|---|
| `AUTH_PARAMS_SECRET` | **Fabriqué** par `npm run env:local` (64 caractères). C'est le sel qui rend une adresse inconnue indiscernable d'une adresse connue. Minimum 32 caractères. | `.env.local`, puis Cloudflare en **Secret** |
| `AUTH_VERIFIER_PEPPER` | **Fabriqué** par `npm run env:local`. Sans lui, une fuite de la base seule suffirait à retrouver les mots de passe : il les protège. Minimum 16 caractères. | `.env.local`, puis Cloudflare en **Secret** |
| `APP_DIAGNOSTIC_TOKEN` | **Fabriqué** par `npm run env:local`. Il ouvre les deux adresses de diagnostic (`/api/internal/…`). Minimum 32 caractères. | `.env.local`, puis Cloudflare en **Secret** |
| `MAILER_KIND` | **Ce n'est pas un secret, et on ne le cherche nulle part** : c'est le mot **`apps_script`**. `npm run env:local` l'écrit pour vous dans `.env.local` ; à la publication, **le déploiement l'écrit lui-même dans Cloudflare** — vous ne le saisissez jamais. | `.env.local` (automatique) |
| `MAIL_APPS_SCRIPT_TOKEN` | **Le seul des cinq à aller chercher** : c'est votre propriété `DAVAR_MAIL_SECRET` dans Apps Script — voir §2 ci-dessous. **Minimum 32 caractères** : le script Google refuse en dessous (erreur 500). | `.env.local`, puis Cloudflare en **Secret** |

> **Si votre script n'a pas encore de propriété `DAVAR_MAIL_SECRET`** : dans
> l'éditeur Apps Script, **⚙️ Paramètres du projet** → tout en bas **« Propriétés
> du script »** → **« Ajouter une propriété du script »** → *Propriété* :
> `DAVAR_MAIL_SECRET`, *Valeur* : une longue chaîne au hasard de **32 caractères
> minimum** (par exemple `openssl rand -hex 32`, ou 40 caractères tapés au hasard)
> → **Enregistrer la propriété**. Aucun redéploiement n'est nécessaire : le
> script lit cette propriété à chaque appel. Copiez la **même** valeur dans
> `MAIL_APPS_SCRIPT_TOKEN`.
>
> ⚠️ Les deux valeurs doivent être **rigoureusement identiques**, au caractère
> près, sans espace avant ni après. C'est la cause n° 1 d'un relais qui répond
> « non autorisé ». La recette vous le dira nommément.

**Et si ces trois clés fabriquées vous inquiètent** : elles ne sortent jamais de
votre machine ni de votre Worker. On ne les met pas non plus dans un document, et
il ne faut pas les changer après l'ouverture du campus — cela déconnecterait les
comptes déjà créés.

---

## 1. Turso — la base de données (2 valeurs)

**Où** : <https://app.turso.tech> (ou le bouton du tableau de bord sur
<https://turso.tech>) → connectez-vous → cliquez sur **votre base**.

**Laquelle de mes bases ?** Celle que vous voulez mettre en production. Si vous
avez créé plusieurs bases, choisissez celle dont le nom correspond au campus.
⚠️ Une base dont le nom contient **« staging »** sera **refusée** en production
par la configuration : c'est volontaire, pour ne jamais publier la base d'essai.

> **Sans navigation dans le tableau de bord**, les deux mêmes valeurs s'obtiennent
> en une ligne de commande, si vous avez installé le client Turso :
> `turso db show <nom-de-la-base> --url` donne l'URL, et
> `turso db tokens create <nom-de-la-base>` fabrique un jeton.

| Valeur à copier | Où exactement dans la page de la base | Nom à écrire dans `.env.local` |
|---|---|---|
| L'URL qui commence par `libsql://…` | bloc **« Connect »** de la base (parfois intitulé *Getting started*), structure `libsql://<nom>-<compte>.<région>.turso.io` — les mêmes informations figurent dans **Settings** | `TURSO_DATABASE_URL` |
| Le jeton qui commence par `eyJ…` | bouton **« Create Token »** / **« Manage Tokens »** (parfois sous *Settings → Tokens*). Un jeton = **une seule apparition** : copiez-le tout de suite | `TURSO_AUTH_TOKEN` |

> Si vous lisez « Permission denied » ou « Token expired » dans la recette, c'est
> le jeton : recréez-en un **avec les droits d'écriture** (pas « read-only »).

**Pas de secret ici** — recopiez-le en clair dans votre réponse, il me sert à
préparer le déploiement :

```
HÔTE DE LA BASE = la partie entre « libsql:// » et la première barre oblique
exemple : mon-campus-davar-42.aws-eu-west-1.turso.io
```

---

## 2. Google Apps Script — les e-mails (2 valeurs)

Vous avez déjà le script. Il reste à retrouver ses deux valeurs.

**Où** : <https://script.google.com> avec **le compte Google de l'académie**
(`davaracademie@gmail.com` si c'est lui qui porte le script) → ouvrez votre projet
de relais.

| Valeur à copier | Où exactement | Nom à écrire |
|---|---|---|
| L'adresse qui finit par `/exec` | bouton bleu **« Déployer »** en haut à droite → **« Gérer les déploiements »** → le déploiement **actif** → **« URL de l'application Web »** (elle ressemble à `https://script.google.com/macros/s/AKfy…/exec`) | `MAIL_APPS_SCRIPT_URL` |
| Le jeton `DAVAR_MAIL_SECRET` (**32 caractères minimum**) | **Paramètres du projet** (la roue dentée ⚙️ dans la colonne de gauche) → tout en bas, **« Propriétés du script »** → la ligne `DAVAR_MAIL_SECRET` → l'œil pour l'afficher, puis copier | `MAIL_APPS_SCRIPT_TOKEN` |

**Vérifiez ces deux réglages pendant que vous y êtes** — sans eux, le relais
refuse tout :

- **Déployer → Gérer les déploiements → ✏️ (modifier)** → *« Exécuter en tant que »* :
  **Moi** ; *« Qui a accès »* : **Tout le monde**. Puis **Déployer**.
- L'URL doit finir par **`/exec`** (une URL qui finit par `/dev` ne marche pas).

---

## 3. Cloudflare R2 — les fichiers : livres, audios, photos (4 valeurs)

**Où** : <https://dash.cloudflare.com> → dans le menu de gauche, **R2**
(parfois rangé sous *Stockage et bases de données* → *R2 Object Storage*).

### 3a. Le seau (le « dossier » géant)

- Onglet **« Vue d'ensemble »** / *Overview*.
- Si votre seau existe déjà : cliquez dessus, son **nom** est en haut.
- S'il n'existe pas : **« Créer un seau »** → nom en **minuscules, chiffres et
  tirets** (R2 refuse les majuscules et les points), puis créer.

→ `R2_BUCKET` = **ce nom**, par exemple `davar-campus-fichiers`.

⚠️ **Ne mettez là aucune « valeur de jeton ».** Ce n'est pas une clé, ni un
identifiant, ni un secret : c'est le **nom** que vous avez donné à votre seau —
celui qui s'affiche en haut de sa page, en minuscules. Si votre écran montre une
« valeur du jeton », elle ne va **nulle part** dans ce fichier (voir 3c).

### 3b. L'identifiant de compte (32 caractères)

- Page **R2 → Vue d'ensemble** : l'**identifiant de compte** (Account ID) est
  affiché dans un bloc **« API S3 »** ; il fait exactement **32 caractères
  hexadécimaux**.
- On le retrouve aussi à la fin de l'adresse de votre tableau de bord
  (`dash.cloudflare.com/<ces-32-caractères>/…`).

→ `R2_ACCOUNT_ID`

### 3c. La clé d'accès et son secret

⚠️ **Le piège n° 1 de tout ce document.** Ce ne sont **pas** votre jeton d'API
Cloudflare, ni votre mot de passe : c'est une **clé d'API S3**, créée dans R2.

- Sur la page **R2 → Vue d'ensemble**, repérez le bloc **« Jetons d'API » / API
  Tokens** et cliquez sur **« Gérer » / Manage**.
**Deux types de jetons vous sont proposés. Choisissez « de compte » :**

| Choix | À quoi il est rattaché | Pour nous |
|---|---|---|
| **« Créer un jeton de compte »** *(Create Account API token)* | **au compte Cloudflare lui-même** ; n'importe quel système autorisé peut l'utiliser, et il reste valable jusqu'à ce que vous le révoquiez | ✅ **celui-ci** |
| « Créer un jeton utilisateur » *(Create User API token)* | à **votre personne** ; il hérite de vos droits et **cesse de fonctionner** si votre utilisateur quitte le compte | à éviter |

Autrement dit : le jeton de compte appartient au **campus**, pas à vous. C'est ce
qu'il faut pour une application qui doit déposer et relire des fichiers pendant
des années.

> Vous avez déjà créé un **jeton utilisateur** avec « Lecture et écriture
> d'objets » ? Il fonctionnera quand même : ne refaites rien. Le jour où vous
> aurez deux minutes, recréez-le en jeton de compte et remplacez les deux valeurs.

- **« Créer un jeton d'API »** → **« Créer un jeton de compte »** *(Create Account
  API token)*.
- **Autorisations** : **Lecture et écriture d'objets** *(Object Read & Write)* —
  indispensable, l'application dépose ET relit les fichiers.
- **Portée** : *« Appliquer à des seaux spécifiques »* → cochez **votre seau**.
- **Créer**. L'écran suivant affiche les deux valeurs — **le secret ne sera plus
  jamais montré** : copiez les deux maintenant.

| Affiché à l'écran | Nom à écrire |
|---|---|
| **Access Key ID** (long identifiant alphanumérique) | `R2_ACCESS_KEY_ID` |
| **Secret Access Key** (affiché **une seule fois**) | `R2_SECRET_ACCESS_KEY` |

**Et la « valeur du jeton » ?** Si votre écran affiche une ligne de ce genre, elle
ne se recopie dans **aucune** des quatre lignes R2 — ni dans `R2_BUCKET`, ni
ailleurs. Dans notre architecture, c'est le couple **Access Key ID + Secret Access
Key** qui sert (c'est ce qui permet de signer les adresses de dépôt et de lecture,
valables quelques minutes). Autrement dit : si vous ne voyez pas ces deux noms,
c'est que vous n'êtes pas sur l'écran « R2 → Vue d'ensemble → Jetons d'API →
Gérer → Créer un jeton de compte ».

> Si vous perdez le secret : recréez un jeton (l'ancien peut alors être révoqué).
> La recette vous dira nommément si le format de l'identifiant ou du nom de seau
> ne convient pas — le plus souvent parce qu'un jeton Cloudflare a été copié à la
> place de la clé S3.

---

## 4. Chariow — le circuit d'achat (4 valeurs)

Compte : <https://app.chariow.com> → votre boutique.

### 4a. La clé API et l'identifiant de la boutique

**Où** : **Paramètres → Clés API** *(Settings → API Keys)* → **« Créer une clé
API »** → donnez-lui un nom (par ex. « Campus Davar ») → **copiez-la
immédiatement : elle ne s'affiche qu'une fois**.

| Valeur | Nom à écrire |
|---|---|
| La clé qui commence par `sk_…` | `CHARIOW_API_KEY` |
| L'identifiant de votre boutique, qui commence par `str_…` (visible dans les **Paramètres** de la boutique) | `CHARIOW_STORE_ID` |

### 4b. Le Pulse (l'automatisation qui nous prévient d'une vente)

**Où** : **Automatisations → Pulses** *(Automations → Pulses)*.

- Si aucun Pulse n'existe : **« Ajouter un Pulse »** → pour l'URL, collez pour
  l'instant `https://exemple-en-attente.invalid/api/chariow/pulse` (nous la
  remplacerons par la vraie adresse du campus à la fin du déploiement — il faut
  le Worker publié avant de pouvoir la renseigner). **Événement** :
  `successful.sale`. Enregistrez.
- Ouvrez ensuite le Pulse → onglet **« Aperçu » / Overview** :

| Valeur | Où exactement | Nom à écrire |
|---|---|---|
| L'identifiant du Pulse, `pulse_…` | en haut de l'onglet **Aperçu** | `CHARIOW_PULSE_ID` |
| Le **secret de signature**, `whsec_…` | bloc **« Secret de signature »** de l'onglet **Aperçu** → **« Révéler »** puis **« Copier »** | `CHARIOW_PULSE_SECRET` |

> Le secret de signature n'est **pas** la clé API, et il ne se déduit d'aucun
> autre identifiant. C'est la seule valeur qui permette de vérifier qu'une vente
> reçue vient bien de Chariow.
>
> `CHARIOW_ENABLE_PULSE` reste sur `false` : on ne l'ouvrira qu'après la recette
> sur votre compte marchand. Rien ne peut être perdu d'ici là.

---

## 5. Les assistants (1 valeur suffit pour démarrer)

Le campus répond avec **vos contenus**, jamais avec une clé visible par les
étudiants : ces clés vivent côté serveur. Le palier gratuit de Groq est le plus
généreux, et il n'entraîne pas ses modèles sur vos données — commencez par lui.

**La clé Groq fait deux métiers** : les réponses de l'assistant, **et la dictée
vocale des avis** (un étudiant qui parle au lieu d'écrire, son texte apparaît).
Les plafonds gratuits sont distincts de part et d'autre — 1 000 questions/jour
d'un côté, 2 000 transcriptions et 28 800 secondes d'audio/jour de l'autre — et le
code les protège séparément. Sans clé, l'assistant le dit honnêtement et l'étudiant
dicte sur son appareil : personne n'est bloqué.

| Valeur | Où exactement | Nom à écrire |
|---|---|---|
| Clé Groq (commence par `gsk_…`) | <https://console.groq.com/keys> → connexion → **Create API Key** → nommez-la « Campus Davar » → copier | `GROQ_API_KEY` |
| Clé Gemini (commence par `AIza…`) — **facultatif, en second** | <https://aistudio.google.com/apikey> → connexion → **Create API key** → copier | `GEMINI_API_KEY` |

> Aucune carte bancaire n'est demandée pour ces deux paliers gratuits.

---

## 6. Récapitulatif — les 16 valeurs de `.env.local`

Après `npm run env:local`, trois sont **déjà écrites** (fabriquées). Il vous reste
**13 valeurs** à coller :

| # | Nom dans `.env.local` | Service | Vous l'avez ? |
|---|---|---|---|
| 1 | `AUTH_PARAMS_SECRET` | fabriqué ✅ | — |
| 2 | `AUTH_VERIFIER_PEPPER` | fabriqué ✅ | — |
| 3 | `APP_DIAGNOSTIC_TOKEN` | fabriqué ✅ | — |
| 4 | `TURSO_DATABASE_URL` | Turso | |
| 5 | `TURSO_AUTH_TOKEN` | Turso | |
| 6 | `MAIL_APPS_SCRIPT_URL` | Apps Script | |
| 7 | `MAIL_APPS_SCRIPT_TOKEN` | Apps Script | |
| 8 | `R2_ACCOUNT_ID` | Cloudflare | |
| 9 | `R2_ACCESS_KEY_ID` | Cloudflare | |
| 10 | `R2_SECRET_ACCESS_KEY` | Cloudflare | |
| 11 | `R2_BUCKET` | Cloudflare | |
| 12 | `CHARIOW_PULSE_SECRET` | Chariow | |
| 13 | `CHARIOW_PULSE_ID` | Chariow | |
| 14 | `CHARIOW_API_KEY` | Chariow | |
| 15 | `CHARIOW_STORE_ID` | Chariow | |
| 16 | `GROQ_API_KEY` *(puis `GEMINI_API_KEY`)* | assistant | |
| — | `MAILER_KIND` | écrit automatiquement = `apps_script` | ✅ (rien à faire) |

**Longueurs minimales vérifiées par la recette** : `AUTH_PARAMS_SECRET` 32,
`AUTH_VERIFIER_PEPPER` 16, `APP_DIAGNOSTIC_TOKEN` 32,
`MAIL_APPS_SCRIPT_TOKEN` **32** (le script Google refuse en dessous, même si
l'application se contenterait de 16).

**Un nom déjà présent dans le fichier ne doit pas être dupliqué** : modifiez la
ligne existante (`NOM=votre-valeur`), sans guillemets ni espace autour du `=`.

---

## 7. Vérifier — sans rien me montrer

Quand tout est collé :

```powershell
npm run recette:services
```

Ce que vous verrez, et comment le lire :

- **`posée` / `ABSENTE`** — pour chaque nom, l'état seulement. Jamais la valeur.
- **`OK`** — ce service répond vraiment : la base a répondu, le seau a accepté un
  vrai dépôt et l'a relu, le relais e-mail est en ligne et son jeton est reconnu.
- **`en attente`** — vous ne l'avez pas encore branché : ce **n'est pas** un
  échec, et l'application le dit elle-même à ses utilisateurs.
- **`ÉCHEC`** — ce service **est censé marcher** et ne répond pas. La ligne vous
  dit lequel des points regarder (format d'identifiant, nom de seau, adresse du
  relais, jeton, validité de la clé Groq).

La recette couvre six points : vos trois clés internes, la base, le stockage, les
e-mails, Chariow, et **la clé Groq — qui sert à la fois l'assistant et la dictée
vocale des avis**. Cette dernière vérification interroge la liste des modèles du
fournisseur : elle valide la clé **sans consommer une seule question ni une seule
transcription**.

Pour recevoir en plus **un vrai e-mail d'essai** (facultatif, à la fin) :

```powershell
npm run recette:services -- --email votre-adresse@exemple.com
```

**Ce que vous pouvez me coller sans risque** : la sortie entière de cette
commande. Vous pouvez la copier telle quelle : elle ne contient aucune valeur.

---

## 8. Et après ?

1. **Vous me collez la sortie** de `npm run recette:services` + les quatre
   valeurs **non secrètes** : nom du seau, hôte Turso (`…turso.io`), adresse
   d'expédition des e-mails, et l'adresse publique du Worker.
2. **Je prépare le déploiement** avec ces valeurs non secrètes.
3. **Vous déployez** (`npx cf deploy`), puis vous saisissez les **mêmes noms**
   dans **Cloudflare → votre Worker → Settings → Variables and Secrets**, en
   **Secret** — sauf deux exceptions : **`MAILER_KIND` et `APP_PUBLIC_ORIGIN` ne
   se saisissent pas** (le déploiement les écrit lui-même).
4. **Nous rebranchons le Pulse** sur la vraie adresse du campus :
   `https://<votre-worker>/api/chariow/pulse`.
5. **La recette sur le compte marchand** — à ce moment-là, et à ce moment-là
   seulement, `CHARIOW_ENABLE_PULSE` passe à `true`.
6. **Vous ouvrez le campus** et vous y déposez vos cours depuis votre espace
   Direction : c'est la dernière chose avant d'accueillir vos étudiants.
