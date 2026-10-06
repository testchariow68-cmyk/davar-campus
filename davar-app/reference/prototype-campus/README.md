# Référence : le prototype du campus (coquille `index.html`)

> **Provenance.** Fichier transmis par le propriétaire le 6 octobre 2026 (collé deux fois, les deux
> copies étant identiques). Conservé ici comme **référence d'expérience** : c'est le prototype dont
> le propriétaire dit qu'il porte « le vrai comportement de l'app ». Il n'est **pas** servi par
> l'application et n'est **pas** inclus dans la construction.

## 1. Ce que ce fichier est — et ce qu'il n'est pas

C'est la **coquille** d'une application d'une seule page : `<div id="app"></div>` est rempli par
onze scripts locaux. Il ne contient **aucune** logique métier : tout vit dans les fichiers absents.

| Ce que le fichier porte réellement | Détail |
|---|---|
| Écran d'ouverture | Logo centré, slogan « L'école de l'excellence oratoire », barre de 4 s, marque du producteur en bas |
| Thème | Sombre par défaut, mémorisé dans `localStorage` (`davar_theme`) |
| Routage | Par ancre : `#/login`, `#/inscription` |
| Référencement | Titre, description, Open Graph, données structurées JSON-LD (5 formations listées) |
| Sécurité annoncée | Trois modules **côté navigateur** : `layer7-botdetection.mjs`, `layer9-agents.mjs`, `r2-signed-url.mjs` |

**Ce n'est pas la vitrine publique** (le dossier `site/` de vos documents). C'est le campus
lui-même : la page est indexable (`robots: index, follow`) et propose « Créer mon compte ».

## 2. Ce qui manque pour lire le comportement

Le fichier appelle, sans les fournir :

```
style.css
manifest.webmanifest
assets/            (logo-entree-splash.png, logo-producteur.png, logo-structure.png,
                    logo-entree.png, favicon.png, pwa-192.png, …)
js/icons.js  js/data.js  js/emails.js  js/ui.js  js/lifecycle.js
js/security-client.js  js/views-student.js  js/rewards.js
js/views-campus.js  js/views-admin.js  js/app.js
security/workers/layer7-botdetection.mjs
security/workers/layer9-agents.mjs
security/workers/r2-signed-url.mjs
```

Sans ces fichiers, seule la **mise en page d'entrée** est connue : les écrans, les enchaînements et
les règles du prototype restent à lire ailleurs.

## 3. Lecture honnête : ce prototype n'est pas étanche, et ne peut pas l'être

1. **Tout s'exécute dans le navigateur.** `views-admin.js` — l'écran d'administration — est livré à
   chaque visiteur. N'importe qui peut l'ouvrir, lire les données et fabriquer son propre compte
   administrateur : le contrôle est chez l'utilisateur, donc il n'existe pas.
2. **La détection de robots est côté client.** Un programme n'est pas obligé d'exécuter votre page :
   il n'appellera simplement pas cette couche.
3. **Une URL signée calculée dans le navigateur implique que la clé de signature y est aussi**
   (à confirmer à la lecture de `r2-signed-url.mjs`, mais la logique est sans issue).
4. **La politique de sécurité du contenu est permissive** : `'unsafe-inline'` et `https:` partout
   pour les scripts, styles et images — l'inverse d'une CSP stricte.
5. **Les données ne sont pas partagées.** Le stockage local d'un navigateur n'est pas une base :
   deux étudiants ne voient pas la même chose, et le propriétaire ne voit pas ses étudiants.
6. **L'e-mail « protégé » n'est qu'obfusqué** (`data-cfemail`) : décodé en une seconde →
   `support@davarcampus.co`. C'est de l'anti-robot à spam, pas de la protection.

**Conclusion : le prototype est une maquette d'expérience (design, écrans, enchaînements). Il ne doit
jamais recevoir de données réelles.** La sécurité réelle vit dans `davar-app/` : mots de passe jamais
transmis (dérivation dans le navigateur), sessions vérifiées côté serveur, cookie HttpOnly,
contrôle d'origine sur chaque écriture, rôles refusés côté serveur, achats vérifiés côté serveur,
limitation de débit, et clés qui ne quittent jamais le serveur.

## 4. Deux écarts relevés, à trancher par le propriétaire

1. **Cinq formations annoncées, une seule vendable.** Les données structurées et le texte de la page
   listent « Devenir un excellent orateur », « Marketing Digital », « Anglais professionnel »,
   « Excel & Analyse de données », « Créer son entreprise ». Depuis la décision du 6 octobre, le
   catalogue n'en vend **qu'une**. Publier cette page telle quelle annoncerait quatre formations
   introuvables — exactement ce que le propriétaire a interdit.
2. **Le campus serait indexable par Google.** Vos documents le décrivent comme privé (« on y entre
   uniquement après achat »), alors que la page se déclare `index, follow` avec pour adresse
   canonique `https://davarcampus.co/`.
