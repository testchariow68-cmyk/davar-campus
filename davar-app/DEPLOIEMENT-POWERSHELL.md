# Déployer depuis PowerShell — sans jamais ouvrir le tableau de bord

Ce document tient en deux scripts. Tout se fait dans la fenêtre PowerShell,
**depuis le dossier `davar-app`**.

```
.\scripts\MAJ.ps1         ← le bouton « Maj » : mettre le campus à jour
.\scripts\DEPLOYER.ps1    ← déployer et entretenir
```

---

## 1. Le bouton « Maj » — `MAJ.ps1`

Télécharge la dernière version depuis GitHub et remplace les fichiers,
**en préservant ce qui est à vous** :

| Préservé | Pourquoi |
|---|---|
| `.env.local` | toutes vos valeurs — le fichier le plus précieux |
| `dev-data\` | votre base locale de travail |
| `node_modules\` | pour ne pas tout retélécharger |

Une copie de secours de votre `.env.local` est faite à chaque fois
(`.env.local.sauvegarde-<date>`). Les tests tournent à la fin : s'ils
échouent, le script s'arrête et vous dit de ne pas déployer.

```powershell
.\scripts\MAJ.ps1
```

> **C'est tout ce que vous aurez à faire** quand je publie une correction :
> une commande, et le campus est à jour.

---

## 2. Déployer — `DEPLOYER.ps1`

Sans argument, il affiche un menu :

```
   1. Verification   tout est prêt ?
   2. Schema         créer les 49 tables sur la base de production
   3. Deploiement    publier le campus
   4. Secrets        envoyer vos clés à Cloudflare
   5. Recette        vérifier les cinq services
   6. Tout           enchaîner 1 → 5
```

Ou directement :

```powershell
.\scripts\DEPLOYER.ps1 -Etape Verification
.\scripts\DEPLOYER.ps1 -Etape Schema              # inspection, n'écrit rien
.\scripts\DEPLOYER.ps1 -Etape Schema -Appliquer   # écrit réellement
.\scripts\DEPLOYER.ps1 -Etape Deploiement
.\scripts\DEPLOYER.ps1 -Etape Secrets
.\scripts\DEPLOYER.ps1 -Etape Recette
```

**Une seule information vous sera demandée, une seule fois :** votre
sous-domaine `*.workers.dev` (Cloudflare → Workers et Pages → colonne de
droite). Il est mémorisé dans `.deploy-local.json`, qui n'est jamais publié.

### L'ordre à respecter la première fois

```
1. Verification   →  doit être vert
2. Schema         →  inspection d'abord
   Schema -Appliquer  →  tapez : APPLIQUER DAVAR PRODUCTION
3. Deploiement    →  publié sur https://davar-campus-production-2026.<sous-domaine>.workers.dev
4. Secrets        →  vos clés partent, chiffrées
5. Recette        →  copiez-moi la sortie
```

---

## 3. Sécurité : ce que ces scripts ne font jamais

| Règle | Pourquoi |
|---|---|
| Vos valeurs ne sont **jamais affichées** | la sortie ne montre que des NOMS |
| Elles ne passent **jamais par la ligne de commande** | sinon visibles dans la liste des processus |
| Elles transitent par un fichier **supprimé aussitôt** | rien ne traîne |
| Une valeur **vide n'est jamais envoyée** | elle n'écrase pas ce qui est déjà en ligne |
| `MAILER_KIND` et `APP_PUBLIC_ORIGIN` ne sont **jamais** saisis | le déploiement les écrit lui-même |
| Une base contenant « staging » est **refusée** | production et recette ne se mélangent pas |

### Les trois pièges de la ligne de commande Cloudflare

Ils ne provoquent **aucune erreur** — c'est ce qui les rend dangereux.
C'est pour cela que la fabrication du corps d'envoi est faite par un script
Node testé, et pas à la main :

1. `--file` envoie le corps en `octet-stream` → l'API ne le lit pas, la
   commande répond 200, **rien n'est appliqué**. Il faut `--body @fichier`.
2. Un corps « à plat » (`{"NOM": …}`) est traité comme un patch vide.
   L'API exige l'enveloppe `{"secrets": {"NOM": …}}` — sinon, succès affiché,
   secret absent en production.
3. `cf workers secrets update` **remplace tout** le jeu de secrets au lieu d'en
   ajouter un. On utilise toujours `bulk` (un « patch » : ce qui n'est pas
   mentionné reste inchangé).

---

## 4. Après la mise en ligne

Le Worker publié, il reste **une seule chose à brancher** : le Pulse Chariow.
Son URL devient connue :

```
https://davar-campus-production-2026.<votre-sous-domaine>.workers.dev/api/chariow/pulse
```

À coller dans Chariow → Automatisations → Pulses. Puis les quatre valeurs
`CHARIOW_*` dans `.env.local`, et :

```powershell
.\scripts\DEPLOYER.ps1 -Etape Secrets
.\scripts\DEPLOYER.ps1 -Etape Recette
```

> Modifier un secret **republie** le Worker. Après un changement, relancez
> toujours la recette.

---

## 5. Vos cours et vos contenus

C'est la **dernière** étape, et c'est vous qui la faites : depuis votre espace
**Direction**, dans le campus en ligne. Rien n'est à déployer pour cela.
