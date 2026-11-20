# Conformité au prototype — vérification du 3 novembre 2026

**Pourquoi ce document :** la question posée est simple — *tout ce qui est dans le
prototype est-il construit ?* La réponse ne doit pas être une impression. Elle est
donc établie écran par écran, en partant du prototype, et chaque ligne est
vérifiable.

**Référence :** `reference/prototype-campus/js/`
- espace étudiant : `views-campus.js`, lignes 231 à 258 (le menu du campus) ;
- direction : `views-admin.js`, lignes 37 à 44 (la barre de navigation).

**Méthode :** pour chaque entrée du prototype, on cherche l'écran correspondant
dans `davar-app/app/**/page.tsx`, puis on compare le **libellé visible** (le titre
affiché à l'écran), pas l'adresse. Ce qui compte, c'est ce que lit l'étudiant.

---

## 1. L'espace étudiant — 12 écrans sur 12

| Entrée du prototype | Écran du campus | Libellé affiché | Verdict |
|---|---|---|---|
| Accueil | `/campus` | « Accueil — Votre cockpit du jour » | conforme |
| Mes formations | `/campus/formations` | « Mes formations » | conforme |
| Mes exercices | `/campus/exercices` | « Mes exercices » | conforme |
| Mes évaluations | `/campus/evaluations` | « Mes évaluations » | conforme |
| Mes livres | `/campus/ressources/livre` | « Mes livres » | conforme |
| Mes audios | `/campus/ressources/audio` | « Mes audios » | conforme |
| Mes certificats | `/campus/certificats` | « Mes certificats » | conforme |
| Mes récompenses | `/campus/distinctions` | « Mes récompenses » | conforme |
| Mes questions | `/campus/questions` | « Mes questions » | conforme |
| Mon profil | `/campus/profil` | « Mon profil » | conforme |
| Paramètres | `/campus/parametres` | « Paramètres » | conforme |
| (la cloche) | `/campus/notifications` | « Notifications » | conforme |

Les trois écrans qui manquaient encore à l'audit du 18 octobre — **Mes exercices,
Mes évaluations, Paramètres** — sont construits, avec les libellés du prototype.

Les écrans fils suivent : `/campus/formation/[id]`, `/campus/ressources/livre/[id]`,
`/campus/ressources/audio/[id]`, `/campus/questions/[id]`.

---

## 2. La direction — 23 écrans sur 23

| Groupe | Écran du prototype | Écran du campus | Libellé affiché | Verdict |
|---|---|---|---|---|
| Pilotage | Vue d'ensemble | `/direction` | « Vue d'ensemble » | conforme |
| Pilotage | Analytics | `/direction/analytics` | « Analytics » | conforme |
| Pilotage | Santé technique | `/direction/sante` | « Santé technique » | conforme |
| Pilotage | Analyse assistants virtuels | `/direction/assistants` | « Analyse assistants virtuels » | conforme |
| Pilotage | Badges & distinctions | `/direction/badges` | « Badges & distinctions » | conforme |
| Pilotage | Activité étudiants | `/direction/activite` | « Activité étudiants » | conforme |
| Pédagogie | Formations | `/direction/formations` | « Formations » | conforme |
| Pédagogie | Ressources | `/direction/ressources` | « Ressources » | conforme |
| Pédagogie | Exercices | `/direction/exercices` | « Exercices » | conforme |
| Pédagogie | Évaluations | `/direction/devoirs` | « Évaluations » | conforme |
| Communauté | Étudiants | `/direction/etudiants` | « Étudiants » | conforme |
| Communauté | Conversations | `/direction/conversations` | « Conversations » | conforme |
| Communauté | Avis | `/direction/avis` | « Avis » | conforme |
| Système | Certifications | `/direction/certificats` | « Certifications » | conforme |
| Système | Récompenses | `/direction/recompenses` | « Récompenses » | conforme |
| Système | Ventes | `/direction/ventes` | « Ventes » | conforme |
| Système | Exports | `/direction/exports` | « Exports » | conforme |
| Système | Cycle de vie | `/direction/cycle-de-vie` | « Cycle de vie » | conforme |
| Système | Assistant virtuel | `/direction/assistant` | « Assistant virtuel » | conforme |
| Système | E-mails | `/direction/emails` | « E-mails » | conforme |
| Système | Activités | `/direction/activites` | « Activités de l'équipe » | conforme |
| Système | Équipe | `/direction/equipe` | « Équipe » | conforme |
| Système | Configuration | `/direction/reglages` | « Configuration » | conforme |

**23 écrans du prototype, 23 écrans du campus, aucun manquant, aucun en trop.**

Quatre adresses diffèrent du nom de l'écran — `devoirs` pour Évaluations,
`certificats` pour Certifications, `reglages` pour Configuration,
`cycle-de-vie` pour Cycle de vie. L'adresse ne se voit pas ; le titre affiché, lui,
est toujours le mot du prototype.

---

## 3. Les écarts — deux, et ils sont tous les deux décidés

**1. `/campus/avis` (« Mes avis »)** n'existe plus au menu : décision du
propriétaire — un avis émis est définitif, l'étudiant n'y revient pas. L'écran
reste accessible par son adresse, ce qui a été accepté.

**2. `/campus/catalogue` et `/campus/checkout/[id]`** existent et ne sont pas dans
le prototype : décision du propriétaire, les prix affichés n'étaient pas les siens,
la vente se fait sur sa page officielle.

---

### Corrigé le 3 novembre, sur décision du propriétaire

Ces trois points figuraient dans la première version de cet audit. Ils sont réglés :

- **« Mes livres » et « Mes audios » sont redevenus deux écrans**, comme les deux
  lignes de menu du prototype. Elles pointaient avant vers des adresses qui
  n'existaient pas : le menu conduisait à une page introuvable.
- **L'onglet « Mes documents » a disparu.** Il n'était pas demandé et n'existe pas
  dans le prototype.
- **Les trois titres de la direction sont revenus au mot exact du prototype** :
  « Activité étudiants », « Ressources », « Santé technique ».

## 4. Ce qui n'est pas du code

Le campus est complet. Trois choses restent entre les mains du propriétaire, et
aucune n'est une ligne de programme :

1. **Les clés de paiement Flutterwave**, à saisir depuis son espace. Sans elles,
   rien n'est encaissé dans l'application — la vente passe par sa page officielle.
2. **Le nom de domaine et les quatre adresses e-mail** (`support@`, `contact@`,
   `infos@`, `direction@`) : Cloudflare Email Routing, gratuit pour la réception.
3. **Le déploiement** : le feu vert « Oui, déploie » n'a pas encore été exécuté.

S'y ajoutent deux chantiers reportés : les onze couches de sécurité de
`SECURITY.md`, et l'activation du webhook Chariow Pulse, qui attend une vente réelle
signée.

---

## 5. Comment vérifier ce document

Chaque ligne ci-dessus se contrôle en deux commandes. Par exemple, pour la
direction :

```bash
# les 23 écrans du prototype
sed -n '37,44p' reference/prototype-campus/js/views-admin.js

# les libellés réellement affichés par le campus
grep -h "<h1" davar-app/app/direction/*/page.tsx | sed 's/<[^>]*>//g'
```

Les tests de conformité (`npm test`, 256 tests) interdisent qu'un libellé du
prototype soit réécrit : les textes des notifications, des neuf e-mails et des
menus sont figés par des tests.
