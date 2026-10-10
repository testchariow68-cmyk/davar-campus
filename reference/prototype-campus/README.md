# Référence : le prototype DAVAR CAMPUS

> **Provenance** : dossier Drive `workspace-01a10e9f-…`, reçu le 6 octobre 2026.
> **Statut** : référence d'expérience et de comportement. Le propriétaire l'a dit :
> « tel que tu le vois, ce n'est pas juste un prototype, c'est comme ça que mon campus doit être. »
> Ce dossier **n'est pas servi** par l'application et **n'entre pas** dans sa construction.

## Contenu

| Chemin | Rôle |
|---|---|
| `index.html` | Coquille de l'application (page unique, écran d'ouverture 4 s, thème sombre par défaut) |
| `js/` | **Le comportement** : 11 fichiers, ≈ 7 800 lignes, ≈ 490 fonctions (`js/data.js` est la seule copie nettoyée : une formation subsiste, cf. `../LECTURE-PROTOTYPE.md` § 5) |
| `style.css` | La feuille de style du prototype |
| `assets/` | Logos, icônes, échantillon audio, modèle de certificat |
| `security/` | Trois modules de sécurité côté navigateur (détection de robots, agents, URL signées) |
| `*.md` | Les documents d'architecture, capacité, sécurité, audit, feuille de route |

## Comment le lire

1. `js/data.js` — le modèle de données (ce que le prototype connaît : utilisateurs, formations,
   livres, audios, badges, avis, certificats, notifications, conversations).
2. `js/views-student.js` — le parcours étudiant, écran par écran.
3. `js/views-admin.js` — la direction, écran par écran. **C'est là que se trouve la « vue test »**
   (`viewAs`, `viewAsList`, `quitViewAs`, `viewAsBannerHTML`), et sa règle : *« la vue test n'ouvre
   que des comptes test — jamais le fondateur ni une vraie personne »*.
4. `js/lifecycle.js` — le cycle de vie des données (purges, durées de conservation).
5. `js/rewards.js` — badges et récompenses.

## Avertissement — ce prototype n'est pas étanche, et ne peut pas l'être

Tout s'exécute dans le navigateur : l'écran d'administration est livré à chaque visiteur, la
détection de robots est côté client, et les données ne sont pas partagées entre deux appareils. C'est
une **maquette d'expérience** : elle ne doit jamais recevoir de données réelles. La sécurité réelle
vit dans `davar-app/`.
