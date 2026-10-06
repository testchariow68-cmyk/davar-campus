> ⛔ **ARCHIVE — NE PAS SUIVRE CES ÉTAPES.** Le présent guide inclut Supabase/CinetPay et des consignes d'authentification obsolètes. Pour l'état et les étapes sûres actuelles, lire `REAL-LAUNCH-STATUS.md`. Ne créer ni comptes réels ni webhook marchand à partir de ce guide.
>
> ⚠️ **DÉCISION DU 26/09/2026 : la stack de production passe à Turso + Cloudflare uniquement (Supabase abandonné).**
> Ce document décrit le squelette Phase 0 tel qu'il a été construit ; il sera migré vers Turso (base) + Cloudflare R2 (fichiers) + authentification applicative après validation du prototype.
> **📌 DIAGNOSTIC COMPLET & INVENTAIRE : `PRODUCTION-MANIFEST.md`** (ce dossier) — tout ce que le prototype validé contient et qui doit être porté, avec le schéma Turso prêt dans `turso/schema.sql`.

# Davar Académie Campus — Installation (Phase 0)

Ce projet est le squelette de production : **Next.js 16 + Supabase Auth +
paiement Chariow** (CinetPay conservé en secours). L'écran d'installation
s'affiche tant que les clés ne sont pas renseignées.

## Prérequis
- Node.js 20+
- Un compte gratuit sur [supabase.com](https://supabase.com)
- Un compte sur [app.chariow.com](https://app.chariow.com) (boutique Chariow)

## Étape 1 — Supabase
1. Créez un projet (région conseillée : **West EU / Paris**, meilleure latence Afrique de l'Ouest).
2. Ouvrez **SQL Editor** → collez et exécutez le contenu de
   `../davar-campus/supabase/schema.sql` (tables, rôles cumulables, RLS,
   fonction `assign_training_from_sale`, buckets privés).
3. **Authentication → Sign In / Up** : activez *Email* (désactivez « Confirm
   email » pour tester plus vite si vous voulez).
4. **Project Settings → API** : copiez *Project URL*, *anon public key* et
   *service_role key*.

## Étape 2 — Chariow (paiement principal)
1. Dans votre boutique Chariow, vérifiez que chaque formation est un produit
   avec son lien de checkout (`https://….mychariow.co/prd_…/checkout`) —
   ces liens sont déjà renseignés dans `lib/trainings.ts`.
2. Créez le **Pulse** (webhook) : **Automatisations → Pulses → Ajouter un Pulse**
   - **URL** : `https://VOTRE-DOMAINE/api/chariow/pulse` (HTTPS obligatoire)
   - **Événement** : « Vente réussie » (`successful.sale`)
   - **Produit** : tous les produits
3. Dans la fiche du Pulse → onglet **Aperçu** → révélez et copiez le
   **Secret de signature** (`whsec_…`) → collez-le dans `CHARIOW_PULSE_SECRET`.
   ⚠️ Ce secret est propre au Pulse et différent de la clé API.
4. Testez avec le bouton **« Envoyer un pulse test »** : le serveur répond
   `{ "ok": true, "note": "Pulse test reçu ✓" }`.
5. (Optionnel) `CHARIOW_API_KEY` : Paramètres → Clés API, pour vérification
   serveur supplémentaire (`GET /v1/sales/{id}`).

Flux : achat sur le checkout Chariow → Chariow envoie le Pulse signé →
`/api/chariow/pulse` vérifie la signature HMAC-SHA256 + dédoublonne
(`x-pulse-delivery-id`) → la RPC `assign_training_from_sale` rattache la
vente au compte (par e-mail) et débloque la formation, sans jamais créer
de doublon. Si le compte n'existe pas encore : le premier achat crée
l'accès (invitation à s'inscrire avec l'e-mail d'achat).

## Étape 2bis — CinetPay (secours seulement)
1. Créez un compte marchand sur CinetPay (gratuit, sans abonnement).
2. Dans le dashboard, passez en mode **TEST** et copiez :
   - votre **clé API** (`CINETPAY_API_KEY`)
   - votre **site_id** (`CINETPAY_SITE_ID`)
3. Les frais par transaction sont **supportés par l'étudiant** : le checkout
   ajoute automatiquement les frais au prix affiché (2,5 % mobile money,
   3,5 % cartes internationales — à ajuster selon votre contrat).

## Étape 3 — Variables d'environnement
```bash
cp .env.example .env.local
# puis remplissez les 5 clés dans .env.local
```

## Étape 4 — Lancer
```bash
npm install
npm run dev          # http://localhost:3000
```

## Étape 5 — Créer le Super Administrateur
1. Créez un compte via **/inscription** (ou Authentication → Users dans Supabase).
2. Dans le SQL Editor :
```sql
insert into public.team_members (profile_id, roles)
values ('<UUID_DU_PROFIL>', '{admin}');
-- Le UUID est dans Authentication → Users.
```

## Comment fonctionne le paiement (rappel)
```
Étudiant → checkout (prix + frais à sa charge)
        → redirection CinetPay (mobile money ou carte, tous pays)
        → paiement confirmé → CinetPay appelle /api/payments/webhook
        → le webhook re-vérifie la transaction auprès de CinetPay
        → RPC assign_training_from_sale(email, formation, …)
        → compte identifié par e-mail → formation ajoutée au compte existant
           (on conflict do nothing : JAMAIS de doublon de compte)
        → notification push à l'étudiant
```

## Mise en ligne (pas encore de nom de domaine — domaine par défaut)

**Décision de l'owner : Cloudflare** (domaine par défaut `*.pages.dev` /
`*.workers.dev`, HTTPS inclus — compatible avec le Pulse Chariow qui exige
une URL HTTPS). Le code est portable : aucune API liée à un hébergeur
(vérification du Pulse en Web Crypto). Au moment du déploiement, si
l'adaptateur Cloudflare ne supporte pas encore Next 16, on fige Next 15 LTS.
Vercel reste utilisable comme environnement de test.

**Note (ancien plan, conservé pour référence) : Vercel**
- Déploiement en 3 minutes : vercel.com → *Add New → Project* → importer le
  dépôt → coller les variables `.env.local` → Deploy.
- Domaine par défaut gratuit : `https://<nom-du-projet>.vercel.app`
  → l'URL du Pulse Chariow devient
  `https://<nom-du-projet>.vercel.app/api/chariow/pulse`.
- ⚠️ Le plan gratuit (Hobby) est **réservé à un usage non commercial** :
  tant que les ventes ne sont pas ouvertes, tout est gratuit. Le jour où le
  campus encaisse de vrais paiements, passer au plan **Pro (~20 $/mois)** —
  largement rentabilisé sur 500–1000 étudiants/an.
- Limites Hobby très confortables : 100 Go de bande passante/mois,
  1 M d'appels de fonctions/mois, timeout 60 s.

**Pourquoi pas Cloudflare pour l'hébergement web (pour l'instant)**
- Next.js 16 n'est pas encore officiellement supporté par l'adaptateur
  Cloudflare (OpenNext limité à Next 15, retours de builds instables) :
  risque inutile à ce stade.
- **Cloudflare reste indispensable** pour le stockage des vidéos :
  **Cloudflare R2** (10 Go gratuits, 0 frais de sortie) servira au streaming
  protégé par URLs signées. Un compte Cloudflare sera donc créé quand même.

Le jour J (5 minutes) :
1. Vercel → importer le projet → renseigner les variables d'environnement.
2. Copier `https://<projet>.vercel.app/api/chariow/pulse` dans le Pulse Chariow.
3. Supabase : ajouter l'URL Vercel dans *Authentication → URL Configuration*
   (Site URL + Redirect URLs) pour les redirections de connexion.

## Structure du projet
```
app/
  (auth)/connexion, inscription     Écrans d'authentification (design Davar)
  auth/callback                     Validation d'e-mail
  campus/                           Espace protégé (session requise)
  campus/checkout/[id]              Checkout Chariow (lien direct) / CinetPay en secours
  api/chariow/pulse                 Récepteur des Pulses Chariow (signés HMAC-SHA256)
  api/payments/checkout             Création paiement CinetPay (secours)
  api/payments/webhook              IPN CinetPay (secours)
components/                         Formulaires, écran d'installation, splash
lib/supabase/                       Clients navigateur / serveur / service role
lib/payments/chariow.ts             Vérification signature Pulse + API Chariow
lib/payments/cinetpay.ts            Couche agrégateur (secours uniquement)
proxy.ts                            Rafraîchissement de session + garde /campus
```

## Suite (Phases 1–3, voir ROADMAP-PRODUCTION.md)
- Phase 1 : catalogue + contenus branchés sur les tables Supabase, upload R2, lecteur vidéo
- Phase 2 : exercices, évaluations, soumissions, notifications push VAPID
- Phase 3 : coach + assistant IA (couche fournisseur interchangeable), certification
