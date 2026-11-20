# davar-kdf — service de hachage de mots de passe (auto-hébergeable)

Ce service existe pour une raison précise : **PBKDF2-HMAC-SHA256 à 600 000
itérations coûte ~121 ms de CPU**, ce qui dépasse le plafond de 10 ms par requête
de l'offre **Cloudflare Workers gratuite**. Le hachage est donc exécuté ici, sur
une offre gratuite dont le quota s'exprime en **temps CPU mensuel** — sans jamais
affaiblir la protection des mots de passe et sans rien payer.

## Contrat

`POST /v1/kdf`, corps JSON `{ "v": 1, "op": "hash" | "verify", "password": "…", "stored": "pbkdf2-sha256$…" }`

En-têtes obligatoires :

| En-tête | Valeur |
|---|---|
| `x-davar-timestamp` | horodatage en millisecondes (tolérance ±60 s, anti-rejeu) |
| `x-davar-signature` | `HMAC-SHA256(clé = DAVAR_KDF_TOKEN, message = "<horodatage>.<corps brut>")` en hexadécimal |

Réponses : `{ok:true, hash}` pour `hash` ; `{ok:true, valid, needsRehash, upgradedHash?}`
pour `verify`. Erreurs : `400` corps/opération invalides, `401` signature ou
horodatage refusés, `413` corps > 16 Kio, `429` plafond journalier ou débit
excessif, `500` échec interne (aucun détail technique n'est renvoyé).

`GET /healthz` répond sans secret : version du service, itérations, consommation
du jour.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `DAVAR_KDF_TOKEN` | — | **obligatoire**, 32 caractères minimum (secret partagé) |
| `DAVAR_KDF_ITERATIONS` | `600000` | itérations PBKDF2 ; refus en dessous de 210 000 |
| `DAVAR_KDF_DAILY_MAX` | `3000` | plafond journalier : au-delà, refus (429) |
| `PORT` / `DAVAR_KDF_HOST` | `8788` / `0.0.0.0` | écoute |
| `DAVAR_KDF_TRUST_PROXY` | `false` | à poser à `true` quand un terminateur TLS (Caddy, Cloudflare Tunnel, Cloud Run) est en amont ; sans cela, écoute réseau refusée |

## Lancement local (développement)

```bash
DAVAR_KDF_HOST=127.0.0.1 DAVAR_KDF_TOKEN="un-secret-de-32-caracteres-minimum" node server.mjs
# puis côté application :
# AUTH_KDF_MODE=remote
# AUTH_KDF_URL=http://127.0.0.1:8788/v1/kdf
# AUTH_KDF_TOKEN=<le même secret>
```

## Hébergement gratuit (production)

1. **Oracle Cloud Always Free** (recommandé pour un service 24/7) : VM ARM
   Ampere gratuite sans limite de durée.
   ```bash
   docker build -t davar-kdf .
   docker run -d --restart always -p 127.0.0.1:8788:8788 \
     -e DAVAR_KDF_TRUST_PROXY=true -e DAVAR_KDF_TOKEN="<secret>" davar-kdf
   ```
   Placez **Caddy** (certificat TLS automatique) ou **Cloudflare Tunnel** devant,
   puis exposez `https://kdf.<votre-domaine>/v1/kdf`. Une carte de vérification
   est demandée à l'inscription Oracle (aucun débit).
2. **Google Cloud Run free tier** : image Docker déployée avec
   `DAVAR_KDF_TRUST_PROXY=true`, mise à l'échelle à zéro en l'absence de trafic.
3. **Votre propre machine / Raspberry Pi** : suffisant pour démarrer, à
   condition de la laisser allumée pendant les heures d'usage du campus.

Dans tous les cas, renseignez ensuite côté application `AUTH_KDF_MODE=remote`,
`AUTH_KDF_URL` (HTTPS obligatoire hors boucle locale) et `AUTH_KDF_TOKEN`.

## Ce que ce service ne fait jamais

- journaliser un mot de passe, une empreinte ou un identifiant ;
- accepter une requête non signée ou rejouée au-delà de 60 secondes ;
- dépasser son plafond journalier (il refuse, il ne consomme pas) ;
- démarrer en écoute réseau sans reconnaissance explicite d'un TLS en amont.
