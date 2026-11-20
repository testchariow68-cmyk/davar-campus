> **Copie versée au dépôt le 7 octobre 2026.** Ce document vient du dossier transmis par le
> propriétaire (fichier `SPEC-V4-NOTES.md`). Il est conservé **tel quel**, avec une seule
> précision en tête : la consigne d'attente « ne rien coder avant l'exemple de dashboard
> étudiant » a été **levée par le propriétaire le 6 octobre 2026** (« Codez la V4 d'après le
> prototype, je corrigerai »). Tout le reste demeure en vigueur — en particulier le point 30
> sur l'assistant virtuel, dont la configuration complète est rassemblée dans
> `davar-app/SPEC-ASSISTANT-IA.md`.

# 📋 NOTES V4 — Feedback owner (EN ATTENTE : exemple de dashboard étudiant avant de coder)

> Consigne : NE RIEN CODER avant réception de l'exemple de navigation/dashboard
> étudiant envoyé par l'owner. Ce fichier fige toutes les demandes.

## A. Côté ÉTUDIANT
1. **Boutons de retour partout** : module → chapitre → accueil ; retour vers
   Paramètres après ajout de photo de profil ; navigation cohérente.
2. **Bouton support flottant** : icône **casque** (sans tête humaine) dans un
   cercle, flottant ; visible **dès qu'on est dans un module** + dans le profil ;
   jamais le mot « Support » écrit.
3. **Support dans Paramètres/profil** ; retirer du dashboard la carte support
   ET la carte motivation. Le dashboard devient **beaucoup plus minimaliste**.
4. **Motivations** = notification push du dimanche uniquement ; l'étudiant ne
   doit rien voir du mécanisme (pas de carte, pas d'explication).
5. **« Découvrir plus de formations »** déplacé dans « Mes formations ».
6. **Libellés simples** : « Activer les notifications » (pas VAPID/push) ;
   « empreinte digitale » sans « WebAuthn ».
7. **Ticker social** : icônes officielles des plateformes (FB, TikTok…) ;
   les annonces défilent **dans la même barre en bas** que les demandes
   d'abonnement (pas en haut) ; une annonce ajoutée complète la ligne ;
   quand l'utilisateur s'abonne, la plateforme disparaît de SON ticker ;
   validation stricte des liens (https://…, format réel obligatoire).
8. **Modules** : afficher le **nom de l'assistant IA** (configurable), pas
   « Réponse IA ».
9. **WhatsApp** → vraie redirection WhatsApp ; **Appel** → ouvre le composeur
   téléphonique (tel:).
10. **Retirer les infos internes** côté étudiant (« discussion disponible dès
    qu'un staff est en poste », « chaque dimanche une notification… », etc.).
11. **Ajout d'un membre support** → notification aux étudiants : la discussion
    en temps réel est disponible.
12. **« Obtenir »** → redirection DIRECTE vers le checkout Chariow du produit
    cliqué (pas de détour).
13. **Mobile** : essentiel uniquement, tout ne s'affiche pas en même temps ;
    adapté parfaitement.
14. **Photos de profil** : bug taille géante (partout, y compris conversations)
    → corriger ; bouton retour Paramètres après upload ; le super admin peut
    aussi ajouter sa photo.
15. **Mode clair** : à rendre plus joli (le sombre est préféré pour l'instant).
16. **Marque** : « DAVAR ACADÉMIE » sans « Campus » dans le texte de marque.

## B. Avis & Spotlight
17. **Avis obligatoires** : après ~2 semaines → avis plateforme (fluidité,
    navigation) ; après 1 mois → avis détaillés sur les cours (pédagogie,
    exercices…), **max 1000 mots**, **écrit OU audio avec transcription vocale
    en direct** (l'owner ne reçoit que de l'écrit).
18. **Section Avis** admin (tous les avis) ; les avis alimentent Sheets,
    exports et éventuellement le **Spotlight** (pub/promotion, cf. doc Chariow
    + meilleures pratiques des grandes plateformes).

## C. Côté ADMIN
19. **Équipe** : retirer « Ajouter un étudiant » → va dans **Étudiants**
    (« Inviter étudiant » devient « Ajouter étudiant », partie grâce).
    Toute invitation doit **exiger l'e-mail** (vérifier le bouton équipe).
20. **Super admin** : PAS de ticker social ni d'annonces sur SON dashboard
    (il est le propriétaire) ; ils restent visibles pour les autres.
21. **Barre de navigation haute** : garder l'onglet actif (ne pas remonter en
    haut quand on clique sur Certifications etc.).
22. **Ventes** : Chariow (CinetPay = secours seulement).
23. **Espace Intégrations/Développeur** : créer des clés API, connecter des
    applis externes (paiements, Google Sheets…), comme Chariow le fait.
24. **Google Sheets** : y écrire étudiants, ventes/paiements, délivrances de
    certificats, données analytiques, avis → stats hors plateforme.
25. **Export des données** (tous formats) + **factures** (PDF/autres, filtre
    par période mois/année ou tout) → **mot de passe exigé** (tâches sensibles).
26. **Transfert de propriété** sécurisé : mot de passe admin + e-mail +
    e-mail de confirmation avec bouton « ce n'était pas moi » (refoule et
    rend l'espace) ; sans action, le transfert tient ; le nouveau propriétaire
    configure ensuite son compte.
27. **Palettes de couleurs** : laisser le choix parmi plusieurs palettes.
28. **Motivations (admin)** : pas de limite de mots ; exiger la numérotation
    (1. / 2. / 3.) ; push à l'admin quand le stock est épuisé.
29. **Certifications** : branchées sur SON Apps Script — afficher dans le
    dashboard les données réelles du système de certification (historiques,
    délivrés, en attente, en erreur).
30. **Assistant IA** : isolation stricte par formation achetée + reçoit le nom
    de l'étudiant ; répondre selon SES formations seulement ; admin configure
    photo/nom/langue ; si besoin, espace de connexion d'un agent externe
    (API/MCP). Fournisseurs gratuits uniquement (Groq/Gemini/OpenRouter/HF).
31. **Design admin** : sérieux, pas de refonte hors demandes ci-dessus.

## D. EN ATTENTE
- L'exemple de dashboard/navigation étudiant de l'owner → puis tout coder
  d'un coup, en gardant les fonctionnalités existantes non mentionnées.

## STACK PRODUCTION — DÉCISION FINALE DU 26/09/2026 (propriétaire)
**Turso + Cloudflare uniquement.** Stack mixte Turso + Supabase étudié puis
rejeté d'un commun accord : il créait un déséquilibre (le plafond d'utilisateurs
et la pause après 7 jours d'inactivité restaient chez Supabase) et deux bases à
synchroniser. Supabase ne fait plus partie du plan.
- Base de données : **Turso** (SQLite/libSQL edge, gratuit : 5 Go, 100 bases,
  500 M lectures/mois — aucune limite artificielle d'utilisateurs).
- Fichiers (PDF, livres audio, couvertures, vidéos) : **Cloudflare R2**
  (10 Go gratuits, pas de frais de téléchargement sortant).
- Hébergement : Cloudflare (Workers + OpenNext, Next.js 15 LTS maximum).
- Conséquences : l'authentification (sessions, mots de passe hachés, invitations,
  WebAuthn/empreinte, équivalent des permissions par rôles) est construite
  côté application et stockée dans Turso. Le squelette davar-app (branché sur
  Supabase en Phase 0) sera migré vers Turso + R2 après validation du prototype.
