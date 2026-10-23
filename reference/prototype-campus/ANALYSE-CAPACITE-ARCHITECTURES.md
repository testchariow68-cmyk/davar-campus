# HISTORIQUE — comparaison de capacité Turso seule vs trois bases

**Décision actuelle :** la réplication CockroachDB/D1 est en pause ; Turso est la seule base applicative cible. Les scénarios à trois bases ci-dessous restent des estimations historiques, non des charges déployées. Voir `TURSO-SEUL-PLAN.md`.

**Périmètre.** « Ancienne » = plan Turso + Cloudflare Workers décrit dans `ROADMAP-PRODUCTION.md`, non le prototype actuel. « Nouvelle » = Turso primaire + CockroachDB secours + D1 secours, avec **réplication technique continue** autorisée et IndexedDB si tout est indisponible. Aujourd'hui, le campus tourne encore en `localStorage` : **aucune de ces deux architectures n'est déployée ni mesurée en charge**. Les nombres ci-dessous sont donc des scénarios budgétaires, pas des capacités garanties.

## Hypothèses reprises du projet

Dans `CAPACITY.md` : 3 000 comptes, dont 30 % actifs quotidiennement (**900 personnes actives/jour**), **40 requêtes API par personne active/jour**, **8 millions de lignes lues Turso/mois**, **1,5 million de lignes écrites Turso/mois**. Par division : environ **296 lignes lues** et **56 lignes écrites par personne active/jour**. Le document est une estimation et contient d'anciennes décisions d'hébergement vidéo contradictoires ; aucune mesure terrain ne valide encore ces coefficients.

Sous Workers Free, le plafond est de **100 000 requêtes/jour** et **10 ms CPU/requête** : si les 40 requêtes comptent effectivement sur ce quota, au plus **2 500 personnes actives/jour** avant marges (2 000 en gardant 20 % de marge). [1](https://developers.cloudflare.com/workers/platform/limits/)

Turso Free donne **500 millions de lignes lues/mois et 10 millions écrites/mois** ; aux mêmes coefficients, ses quotas de lignes ne seraient pas les premiers goulots en charge normale. [1](https://turso.tech/pricing)

D1 Free donne **5 millions de lignes lues/jour, 100 000 écrites/jour et 5 Go**. Une réplication des mêmes mutations vers D1 consomme des **lignes écrites même quand Turso est actif**, et une modification de colonne indexée peut également compter l'écriture dans l'index. [1](https://developers.cloudflare.com/d1/platform/pricing/)

## Résultat chiffré, sans prétendre à une mesure réelle

| Scénario gratuit | Goulot théorique estimé | Capacité indicative prudente (20 % de marge) | Pour 3 000 comptes à 30 % actifs |
|---|---:|---:|---|
| **Avant : Turso + Worker**, sans secours répliqué | 100 000 / 40 = **2 500 actifs/jour** (Worker) | **~2 000 actifs/jour** | 900 actifs/jour : marge indicative |
| **Après : réplication D1 = 1 ligne écrite facturée par ligne Turso** | 100 000 / 56 ≈ **1 800 actifs/jour** (D1) | **~1 440 actifs/jour** | 900 : marge indicative |
| **Après : réplication D1 = 1,5 ligne facturée en moyenne** | 100 000 / (56 × 1,5) ≈ **1 200 actifs/jour** | **~960 actifs/jour** | 900 : presque sans marge |
| **Après : réplication D1 = 2 lignes facturées en moyenne (table + index)** | 100 000 / (56 × 2) ≈ **900 actifs/jour** | **~720 actifs/jour** | 900 : quota atteint avant marge |

**Exemple étudiant + staff.** Si, uniquement pour la simulation, une personne du staff coûte **3 fois** autant d'API et d'écritures qu'un étudiant actif, la colonne « actifs/jour » se lit en *équivalents étudiants* : `étudiants actifs + 3 × membres du staff actifs`. À 20 membres du staff actifs, le plafond prudent « D1 ×2 » de 720 équivalents laisserait ~**660 étudiants actifs/jour** ; avec 900 étudiants + 20 staff, le scénario D1 ×2 dépasserait le gratuit. Ce coefficient ×3 pour le staff est **une hypothèse**, pas une mesure.

Les 30 % d'activité permettent de convertir des journées actives en comptes inscrits **uniquement si le ratio demeure stable** : avant ~2 000 / 0,30 ≈ 6 700 comptes indicatifs prudents ; après ~720 à 1 440 / 0,30 ≈ 2 400 à 4 800 comptes, suivant le facteur de réplication D1. Ce n'est pas une limite du nombre de comptes : stockage, documents, vidéos et nombre de lignes par compte peuvent imposer une limite différente.

## Autres limites non chiffrables avant mesures

- CockroachDB Basic : **50 millions de RU/mois**, **10 Gio** ; une RU dépend des requêtes, connexions, scans et index. Impossible d'en déduire une capacité en utilisateurs sans test. [1](https://www.cockroachlabs.com/pricing/)
- Hyperdrive Free : **100 000 requêtes SQL/jour** ; le nombre de requêtes de réplication vers Cockroach dépend des batchs et du schéma. [1](https://developers.cloudflare.com/hyperdrive/platform/pricing/)
- Sonde 30 s : **2 880 sondes/jour** pour chaque base sondée, plus coûts de coordination/alarme ; opérations techniques et réplication ne sont pas gratuites à coup sûr. Sur Workers Free, 10 ms CPU/requête peut aussi limiter une API sécurisée. [1](https://developers.cloudflare.com/workers/platform/limits/)
- Sauvegarde et réplication augmentent la résilience, **pas le nombre d'utilisateurs servis en parallèle** : une seule base sert les lectures et écritures applicatives à chaque instant ; les quotas ne s'additionnent pas.
- IndexedDB fonctionne **appareil par appareil** : il n'augmente pas le quota de la base ni celui des Workers ; il assure seulement une continuité locale limitée. Les paiements, certificats et droits ne doivent pas être confirmés hors ligne.

## Recommandation de décision

**Si la priorité absolue est 0 FCFA avec 3 000 comptes et 900 actifs/jour, ne pas activer maintenant une triple réplication en production.** L'ancienne architecture projetée Turso + Worker offre, sous ces hypothèses, plus de marge gratuite, mais moins de résilience. **Conserver la nouvelle en staging** et mesurer une vraie journée représentative : `requêtes Workers/personne`, `rows_written D1/mutation et par index`, `RU Cockroach/batch`, `SQL Hyperdrive/jour`, profil étudiant vs staff, latences p95 et temps de rattrapage. Si D1 tient avec marge à 80 % et que les tests de bascule passent, la garder ; sinon alléger la réplication sans rendre le secours obsolète, ou choisir une offre payante/plafonnée.

Le plan Workers Paid démarre à **5 USD/mois minimum**, mais des dépassements peuvent être facturés : ce n'est ni une capacité garantie, ni nécessairement une dépense limitée à 5 USD. Il rehausse notamment le quota D1 inclus à **50 millions de lignes écrites/mois** ; les RU Cockroach, les données stockées et les performances restent à vérifier. [1](https://developers.cloudflare.com/workers/platform/pricing/) [1](https://developers.cloudflare.com/d1/platform/pricing/)
