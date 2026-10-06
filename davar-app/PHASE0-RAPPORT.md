# Phase 0 — Rapport d'état (25 sept. 2026)

**Objectif de la Phase 0** : poser le squelette de production du campus —
un vrai projet déployable (pas une maquette), avec authentification,
paiement et sécurité, prêt à recevoir le contenu réel en Phase 1.

## Étapes de la Phase 0 et leur état

| # | Étape | État |
|---|-------|------|
| 1 | Projet Next.js 16 + TypeScript (framework de production) | ✅ Fait, compilé sans erreur |
| 2 | Authentification réelle (Supabase Auth) : pages Connexion / Inscription / vérification e-mail | ✅ Code fait (s'active avec vos clés Supabase) |
| 3 | Espace `/campus` protégé : inaccessible sans session | ✅ Fait |
| 4 | Paiement Chariow : checkout par formation + réservation coaching | ✅ Fait avec vos vrais liens |
| 5 | Récepteur du webhook Chariow (Pulse signé, anti-fraude, anti-doublon) | ✅ Fait et **testé** (4 scenarios) |
| 6 | CinetPay conservé en secours | ✅ Fait |
| 7 | Marque : splash, favicon, PWA, Inter, thème sombre/clair, logos transparents | ✅ Fait |
| 8 | Base de données : schéma SQL complet prêt à exécuter (tables, rôles, sécurité par ligne, règle « jamais de doublon ») | ✅ Écrit (`supabase/schema.sql`) |
| 9 | Documentation : SETUP.md (installation), .env.example, ROADMAP | ✅ Fait |
| 10 | **Votre compte Supabase** (gratuit) + collage du schéma SQL + récupération des 3 clés | ⏳ **Votre action (~10 min)** |
| 11 | Mise en ligne (Vercel ou Cloudflare, domaine par défaut) | ⏳ Plus tard, projet terminé |

## Ce qui a été testé concrètement

- **Webhook Chariow réel simulé** : Pulse signé → vente enregistrée, formation
  « Devenir un excellent orateur » débloquée ✓ ; rejeu ignoré ✓ ;
  signature falsifiée rejetée (401) ✓ ; pulse de test Chariow reconnu ✓.
- **Les 4 liens fournis** répondent : 2 Apps Script + checkout Chariow + réservation coaching (HTTP 200).
- Compilation complète du projet (`next build`) sans erreur.
- Prototype interactif : tous les écrans rendus sans erreur (smoke test automatisé).

## Conclusion

**La Phase 0 est prête côté code (étapes 1 à 9).**
Il reste l'étape 10 : votre compte Supabase. Sans compte, l'application
affiche « Installation requise » — c'est normal et voulu.
Dès que les clés sont collées dans `.env.local`, l'authentification,
les comptes et le déblocage par achat fonctionnent réellement.

## L'étape 10 en pratique (ce que vous aurez à faire)

1. Allez sur **supabase.com** → compte gratuit (avec Google/GitHub).
2. **New project** : nom `davar-campus`, mot de passe fort, région **West EU (Paris)**.
   Attendez ~2 min de création.
3. **SQL Editor** → collez tout le contenu de `davar-campus/supabase/schema.sql` → **Run**.
4. **Project Settings → API** : copiez les 3 valeurs
   (URL, anon public key, service_role key) dans `.env.local`.
5. Relancez le serveur : l'écran « Installation requise » disparaît,
   vous pouvez créer votre compte Super Admin.

→ La Phase 1 (catalogue réel, vidéos, contenu) pourra alors être testée en vrai.
