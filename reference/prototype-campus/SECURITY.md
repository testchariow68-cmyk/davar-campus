# 🛡️ DAVAR — Système de sécurité autonome (serverless, 0 VPS, 100 % gratuit)

Architecture propriétaire combinant Cloudflare (Workers, Pages, Durable Objects, R2, Workers AI,
Turnstile, Tunnel, Access) + Turso. Personne ne connaît la combinaison complète ; chaque couche
fonctionne indépendamment et se vérifie croise­ment (règle 2).

## Stack (coût 0 FCFA)

| Composant | Technologie |
|---|---|
| Frontend | Cloudflare Pages |
| API | Cloudflare Workers (100 k req/j) |
| Temps réel / fenêtres | Durable Objects (1 M req/mois) |
| Base de données | Turso (9 Go) — `security/schema.sql` |
| Fichiers | R2 (10 Go) |
| IA | Workers AI |
| WAF/DDoS, CAPTCHA, tunnel | Cloudflare WAF · Turnstile · Tunnel |

## Capacité gratuite (3 000 utilisateurs à 0 FCFA)

Analyse complète des quotas et des 3 pièges mortels (Access 50 users, vidéos R2, IA/DO par requête) : **`CAPACITY.md`**.

## Les 11 couches

| # | Couche | Implémentation | Statut code |
|---|---|---|---|
| 1 | Authentification furtive Zero-Trust | Cloudflare Access + Tunnel, mTLS, JWT vérifié (WebCrypto RS256) — **périmètre staff uniquement** (Access gratuit limité à 50 users) ; étudiants = JWT maison + SSI (couche 5) + Turnstile, voir `CAPACITY.md` | ✅ `security/workers/layer1-zero-trust.mjs` (phase 1) |
| 2 | Chiffrement post-quantique | liboqs → WASM dans Workers (ML-KEM-1024 + X25519/AES-GCM) | ✅ `security/workers/layer2-pq-crypto.mjs` (phase 2) : hybride HKDF(X25519‖PQ)+AES-256-GCM, slot liboqs au déploiement |
| 3 | Défense active par IA | Workers AI (llama-guard), rotation de clés 24 h (Cron) | ✅ `security/workers/layer3-ai-defense.mjs` (phase 2) : llama-guard + anomalie de débit + rotation 24 h |
| 4 | Signature comportementale | TensorFlow.js côté client, profils chiffrés dans Turso (`behavioral_profiles`) | ✅ `security/workers/layer4-behavioral.mjs` (phase 2) : vecteur 5 facteurs + score de confiance progressif |
| 5 | Identité auto-souveraine (SSI) | W3C DID + Verifiable Credentials Ed25519, credentials en IndexedDB | ✅ `security/workers/layer5-ssi.mjs` (phase 1) |
| 6 | Cible mobile autonome (AMTD) | routes mutées via Durable Objects + reinforcement learning Workers AI | ✅ `security/workers/layer6-amtd.mjs` (phase 3) : alias éphémères, coupure immédiate sur attaque |
| 7 | Détection de bots sans CAPTCHA | télémétrie micro-mouvements (<0,5 ms) + Turnstile en complément | ✅ `security/workers/layer7-botdetection.mjs` (phase 1) |
| 8 | Pots de miel cognitifs | Workers leurres + llama-3.1, blocage IP automatique | ✅ `security/workers/layer8-honeypots.mjs` (phase 3) : sondages → leurre + score → ban |
| 9 | Framework multi-agents | essaim d'agents (reconnaissance/défense/validation) en DO | ✅ `security/workers/layer9-agents.mjs` (phase 3) : vote à 3 agents, unanimité exigée si dangereux |
| 10 | Cryptographie homomorphe | ComputeFHE → WASM (limitations de performance assumées) | ✅ `security/workers/layer10-fhe.mjs` (phase 4) : Paillier BigInt réel (somme sur chiffrés), slot ComputeFHE au déploiement |
| 11 | Empreinte physique du silicium | AETHER-NODE adapté WASM, WebGPU/WebCrypto, clés à la volée | ✅ `security/workers/layer11-silicon.mjs` (phase 4) : empreinte SHA-256 stable par puce |

## Defense in Depth — 5 règles

1. **Aucune confiance implicite** — tout est analysé (couche 1 en middleware obligatoire).
2. **Vérification croisée** — 2 systèmes indépendants (ex. télémétrie + Turnstile, webhook + re-vérification API).
3. **Moindre privilège** — droits minimaux, credentials SSI à durée limitée.
4. **Journalisation immuable** — `security_events` avec hash chain SHA-256 (Turso).
5. **Rotation des secrets** — toutes les 24 h via Workers Cron.

## Fenêtre éphémère de confiance (phase 5, spécifié + logique livrée)

- Ouverture **uniquement** pour automatisations internes, **5 minutes max**, fermeture auto (Alarm API).
- Clé privée dans Cloudflare Secrets · signature Ed25519 · nonce unique (anti-rejeu) · état en Durable Object.
- Flux : requête signée → vérif signature + timestamp (±60 s) + nonce → ouverture → fermeture auto → journal immuable Turso (`automation_windows`, `automation_logs`).
- Logique testable : `security/workers/ephemeral-window.mjs` (classe `EphemeralWindow`).

## Protection contre les 4 attaques

| Attaque | Contre-mesure |
|---|---|
| Simulation de mouvements | couche 7 : analyse multi-factorielle + micro-tremblements (WASM client) |
| Vol de jeton | signature crypto + Secrets + rotation 24 h + nonce |
| Usurpation d'IP | Tunnel + mTLS (couche 1) |
| Découverte de route | Access + limitation via Durable Objects |

## Purge & durée des comptes (règle 3 + finalités)

Le moteur `DAVAR DATA LIFECYCLE & PURGE ENGINE` (`js/lifecycle.js`) applique les durées
ci-dessous ; **la durée d'un compte y est comprise selon les conditions définies : accès
12 mois à partir de l'achat** (`ACCESS_MONTHS = 12`, `js/data.js`).

- Accès formation acheté : 12 mois à partir de l'achat, puis la formation prend fin.
- Compte dont tous les accès ont expiré sans nouvelle acquisition : considéré terminé →
  éligible à la purge des données personnelles après 12 mois supplémentaires sans acquisition,
  quarantaine 7 jours (exception §22 annulable), purge réelle §21.
- Conversations coach 12 mois · conversations IA 90 j · notifications lues 48 h / anciennes 180 j ·
  logs techniques 90 j · logs sécurité/audit 12 mois · uploads abandonnés 24 h · fichiers
  d'évaluation supprimés dès la décision de correction.

## Phases

1. ✅ Couches 1, 5, 7 + fenêtre éphémère (logique) — livrées + testées (`tests/smoke46.js`).
2. ✅ Couches 2, 3, 4 — logique livrée + testée (`tests/smoke47.js`) ; binaire liboqs WASM et collecte TensorFlow.js à brancher au déploiement.
3. ✅ Couches 6, 8, 9 — livrées + testées (`tests/smoke48.js`).
4. ✅ Couches 10, 11 — livrées + testées (`tests/smoke49.js`).
5. ✅ Fenêtre éphémère en Durable Object (`ephemeral-window-do.mjs`, Alarm API + état persistant) + journal immuable hash-chain (`audit-chain.mjs`) — testés (`tests/smoke49.js`).
6. ✅ Branchement prototype : couche 7 sur connexion/inscription (`js/security-client.js` + télémétrie navigateur) et couche 9 sur la purge immédiate (`execPurge`) — testés (`tests/smoke50.js`). Unanimité exigée pour toute action sensible ou dangereuse.
3. Couches 6, 8, 9 (AMTD, honeypots LLM, multi-agents).
4. ✅ FHE (Paillier réel + slot ComputeFHE) + empreinte silicium.
5. ✅ Fenêtre éphémère déployée en DO + chaîne d'audit immuable. Système complet : 11 couches + fenêtre, 208 tests.
