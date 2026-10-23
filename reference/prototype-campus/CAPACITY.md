# 📊 Capacité gratuite — tenir 3 000 utilisateurs à 0 FCFA

> **« On protège les quotas, on ne les consomme pas. »**

Hypothèses : 3 000 comptes, 30 % actifs/jour ≈ **900 DAU**, ~40 requêtes API par actif/jour
≈ **36 000 requêtes Workers/jour**. Limites vérifiées le 29/09/2026.

| Ressource | Limite gratuite | Consommation estimée (3 000 users) | Risque | Verdict |
|---|---|---|---|---|
| Workers (API) | 100 000 req/jour, 10 ms CPU/req [1](https://developers.cloudflare.com/workers/platform/limits/) | ~36 000/j (36 %) | **Bots/scans non filtrés** → Error 1027 = API coupée pour tout le monde | ✅ si WAF + Turnstile + rate-limit absorbent les bots AVANT le quota ; cache edge pour les lectures |
| Cloudflare Access (couche 1) | **50 utilisateurs** puis 7 $/user/mois [2](https://costbench.com/software/ztna/cloudflare-access/) | 3 000 étudiants → **21 000 $/mois** | 🚨 **PIÈGE MORTEL** | ❌ **JAMAIS Access pour les étudiants** → auth JWT maison + SSI (couche 5) + Turnstile ; Access réservé à l'équipe staff (< 50 → gratuit) |
| Workers AI (couches 3, 8) | 10 000 neurons/jour (~20-40 appels llama-guard/jour) | IA par requête = explosion en 1 h | Attaque coordonnée | ✅ IA **uniquement sur anomalie** (pré-filtre rateAnomaly) et sur les pots de miel (seuls les attaquants parlent au leurre) |
| Durable Objects (couches 6, 9, fenêtre) | ~3 M req/mois (~100 000/j) [3](https://flarecalc.com/calculators/durable-objects/) | Si chaque requête passe par un DO : 36 000 × N/j → dépassement | ❌ DO par requête | ✅ resolve/swarm/score = **fonctions pures dans le Worker** (0 appel DO) ; DO seulement pour mutations, fenêtre éphémère, alarmes (< 10 000/mois) |
| R2 (fichiers) | 10 Go, 1 M écritures, 10 M lectures/mois [4](https://nubbo.app/blog/cloudflare-r2-free-tier/) | Vidéos de formations → **100 Go+** | 🚨 stockage vidéos | ❌ **jamais de vidéo dans R2** (streaming YouTube/Drive non répertorié) ; R2 = PDF, avatars, audios légers ; uploads d'évaluation purgés dès la décision de correction (règle déjà en place) |
| Turso (données) | 5 Go, 500 M lectures, 10 M écritures/mois [5](https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan) | ~8 M lectures/mois (1,6 %) · ~1,5 M écritures/mois (15 %) | Logs non plafonnés | ✅ plafonds + purge 12 mois déjà en place ; métadonnées seules (jamais les fichiers) |
| Turnstile / WAF / Tunnel | gratuits, quasi illimités | logins + endpoints sensibles | — | ✅ bouclier anti-bots qui **protège le quota Workers** |

## Les 3 risques qui tuent le gratuit (et la parade déjà décidée)

1. **Cloudflare Access à 3 000 utilisateurs** = 21 000 $/mois. → Couche 1 redéfinie : Access **staff uniquement** ; étudiants = JWT maison + credentials SSI + Turnstile.
2. **Vidéos dans R2** = dépassement stockage immédiat. → vidéos hors R2 (déjà la pratique du campus : Drive/YouTube).
3. **IA ou Durable Objects par requête** = quota pulvérisé en une journée. → IA sur anomalie seulement ; DO hors chemin critique (c'est déjà le cas dans le code livré : `RouteMutator.resolve`, `swarmDecide`, `scoreTelemetry` sont purs).

## Risques résiduels acceptés

- **CPU 10 ms/req (Workers free)** : Ed25519, scoring télémétrie ≈ 1-2 ms ✅ ; mais **Paillier 2048 bits (couche 10) dépasse 10 ms** → la couche FHE reste **statistique/asynchrone** (agrégats via Cron, petits modules) et ne passe JAMAIS dans le chemin d'une requête étudiant.
- **Pic d'attaque massif** : peut consommer du quota Workers avant blocage WAF ; mitigation : Turnstile sur login/inscription/checkout + rate-limit (couche 3) + pots de miel qui détournent les scanners hors de l'API réelle.
- **Error 1027** si le quota jour est atteint : l'API s'arrête jusqu'à minuit UTC — d'où l'importance du bouclier anti-bots.

## Conclusion

**Oui, 3 000 utilisateurs à 0 FCFA est tenable** avec les règles ci-dessus : consommation estimée
≈ 36 % du quota Workers, 1,6 % des lectures Turso, 15 % des écritures Turso, < 1 % des DO,
R2 borné par la politique de purge, IA bornée par le pré-filtre. La seule ligne du plan initial
qui devait changer est la couche 1 : **pas de Cloudflare Access pour les étudiants** (limite 50 users).


## 🎬 Vidéos SANS YouTube : R2 devient l'hébergeur vidéo (encodage maîtrisé)

Catalogue actuel mesuré dans `js/data.js` : **30 vidéos, 7,1 heures**.
L'art oratoire = talking head + slides → très compressible (150-400 kbps suffisent).

| Débit | Poids/heure | Catalogue actuel | Capacité des 10 Go R2 |
|---|---|---|---|
| 150 kbps (480p slides) | 68 Mo | 0,48 Go | ~148 heures |
| 250 kbps (480-720p) | 112 Mo | 0,79 Go | ~89 heures |
| 400 kbps (720p confortable) | 180 Mo | 1,27 Go | ~56 heures |

Règles pour rester gratuit à 3 000 users sans YouTube :
1. **Aucune limite de qualité imposée côté Davar** : 1,3 Go = poids *mesuré* du catalogue actuel à 400 kbps, pas un plafond. L'invariant unique est les 10 Go gratuits Cloudflare, surveillés par la jauge admin (page Cycle de vie ; champ `videoMB` = poids réel si vous encodez plus haut).
2. **Lecteur en streaming progressif (Range requests R2)** : l'étudiant ne télécharge que ce qu'il regarde.
3. **Lectures Class B** : 900 DAU × ~4 lectures vidéo/j ≈ 108 000/mois, très sous les 10 M gratuites.
4. **Anti-leech** : URLs signées + Turnstile + couches 1/7 → personne ne pompe vos vidéos de l'extérieur (les lectures sont le vrai quota).
5. **Croissance** : à 400 kbps vous tenez ~56 h de catalogue ; au-delà, archivez les cohortes/formations
   retraitées (stockage froid $0,01/Go, quelques centimes) ou ré-encodez plus serré — jamais de compte multiplié.
6. Alternatives sans YouTube si un débordement survient : embed **Internet Archive** (gratuit, illimité, sans pub)
   ou Google Drive (déjà utilisé pour les certificats) en secours — R2 reste la source principale.


## 🔐 Comment les vidéos sont lues : URLs signées + multi-sources gratuites

- **Source principale `r2:`** : le lecteur demande une **URL signée HMAC-SHA256 (1 h)** au Worker vidéo
  (`security/workers/r2-signed-url.mjs`) ; lien expiré ou falsifié = 403 ; streaming Range passthrough.
  C'est ce qui rend impossible le « accès gratuit » aux vidéos vendues : le lien meurt en 1 h et ne
  fonctionne que sur votre domaine.
- **YouTube** : « privée » = NON intégrable (seuls les comptes invités peuvent voir, pas d'embed).
  « Non répertoriée (unlisted) » = intégrable et gratuite, MAIS quiconque a le lien regarde gratuitement
  (pas de restriction de domaine d'embed chez YouTube) → réserver YouTube unlisted aux **teasers/marketing
  gratuits**, jamais au contenu payant (qui reste en `r2:` signé).
- **TikTok** : le lecteur lit désormais TikTok via l'embed officiel `tiktok.com/embed/v2/<id>` (gratuit) —
  adapté aux teasers publics, pas au contenu payant.
- Le lecteur gère donc 4 sources : `r2:` (signé, payant), YouTube nocookie, Vimeo, TikTok, + fichier direct.
