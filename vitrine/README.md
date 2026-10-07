# Vitrine publique DAVAR ACADÉMIE

> **Ce dossier est votre présentation officielle**, telle que vous l'avez écrite.
> Elle a été reprise **sans modification** du dossier Drive (`site/`).

## Ce que contient ce dossier

| Fichier | Rôle |
|---|---|
| `index.html` | La vitrine complète : en-tête, héros, formations, « comment ça marche », appel à l'achat, pied de page |
| `assets/campus-icon.png` | Icône de marque (en-tête) |
| `assets/campus-slogan.png` | Bandeau de marque (héros) |
| `assets/logo-structure.png` | Logo de la structure |
| `robots.txt`, `sitemap.xml` | Référencement |

**Aucun code n'a été touché.** Les seules choses à faire avant la mise en ligne sont listées ci-dessous.

## Ce qui doit changer avant de publier

1. **Le domaine.** Le fichier porte un marqueur : `davar-academie.pages.dev`. Il apparaît dans
   l'adresse canonique, les données structurées et l'image de partage. Remplacez-le partout par votre
   domaine définitif (recherchez `davar-academie.pages.dev` dans `index.html`, 6 occurrences).
   Idem dans `sitemap.xml` et `robots.txt`.
2. **Les adresses du pied de page** (`support@`, `contact@`, `infos@`, `direction@davarcampus.co`) :
   elles doivent exister réellement, sinon les messages s'y perdent en silence.
3. **Le lien d'achat.** Il pointe déjà vers votre checkout vérifié
   `https://d-ueo.mychariow.co/prd_6wx1czzp/checkout` — rien à changer.

## Mise en ligne — Cloudflare Pages, gratuit (dans la limite de votre ADN)

```powershell
# Depuis le dossier vitrine/ (aucune installation nécessaire : npx télécharge l'outil)
npx wrangler pages deploy . --project-name davar-vitrine
```

Cloudflare Pages est **gratuit** : bande passante illimitée, 500 constructions par mois, domaines
personnalisés inclus. Aucune carte bancaire, aucun quota d'utilisateurs — rien à voir avec Access,
qui est le piège écarté par vos documents.

Ensuite, dans le tableau de bord Cloudflare → Pages → `davar-vitrine` → **Custom domains** : ajoutez
votre domaine, et remplacez le marqueur `davar-academie.pages.dev` dans les fichiers.

## Pourquoi la vitrine est séparée de l'application

Vos documents fixent deux domaines distincts : la vitrine se trouve et se référence ; l'application
reste **privée**, on y entre après achat. Cette séparation est respectée :

- la vitrine ne contient **aucun lien** vers l'application ;
- l'application ne vend rien (ses pages de vente ont été supprimées : leurs prix n'étaient pas les
  vrais) ;
- le seul pont entre les deux est **l'adresse e-mail** : l'acheteur la saisit au checkout Chariow,
  puis crée son compte de campus **avec exactement la même adresse**, confirmée. C'est ce qui
  rattache la vente à la formation.
