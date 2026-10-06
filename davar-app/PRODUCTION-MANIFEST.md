# HISTORIQUE — ancien manifeste de production

> ⛔ Ce document conserve des choix abandonnés (Supabase, CinetPay, purge automatique) et des statuts qui ne correspondent plus au code courant. **Ne pas suivre ses instructions de déploiement ou de paiement.** Lire `REAL-LAUNCH-STATUS.md` pour l'état actuel ; ne pas lancer `turso/schema.sql` tel quel.
> Établi le 26/09/2026 après la campagne de modifications majeure du prototype.
> Stack définitive : **Turso + Cloudflare uniquement** (Supabase abandonné).
> Schéma de base : `turso/schema.sql` (ce dossier). Prototype de référence : `../davar-campus/`.

---

## 1. CE QUI EXISTE DÉJÀ DANS davar-app (Phase 0)

| Fichier | Rôle | État |
|---|---|---|
| `app/(auth)/connexion`, `inscription` | Écrans auth (design dégradé violet) | ✅ à brancher sur auth applicative Turso |
| `app/api/chariow/pulse/route.ts` | Webhook Chariow Pulse (signature HMAC, dédoublonnage) | ✅ contrat figé |
| `app/api/payments/checkout`, `webhook` | Checkout + secours CinetPay | ✅ à relier à Turso |
| `lib/payments/chariow.ts`, `cinetpay.ts` | Clients paiement | ✅ |
| `lib/supabase/*` | **À SUPPRIMER** lors de la migration Turso | ❌ obsolète |
| `lib/trainings.ts` | Catalogue dur (4 formations + lien `prd_6wx1czzp`) | ⚠️ à déplacer en base |
| `components/Splash`, `SetupScreen`, Forms | Splash 5 s, installation guidée | ✅ |
| `app/campus/*` | Coquille campus | ⚠️ squelette |

---

## 2. DIAGNOSTIC : INVENTAIRE COMPLET DU PROTOTYPE vs PRODUCTION

Légende : ✅ déjà en prod · 🔶 partiel · ❌ à porter (obligatoire pour le lancement).

### A. Authentification & rôles
| Fonctionnalité | Prototype | Prod | Notes de migration |
|---|---|---|---|
| Connexion e-mail + mot de passe | ✅ | 🔶 | Argon2id + sessions Turso (`sessions.expires_at`) |
| Inscription UNIQUEMENT via e-mail d'achat reconnu | ✅ | 🔶 | Vérif vente Chariow/CinetPay avant création |
| Accès gracieux (partie grâce) 3 jours | ✅ | ❌ | `invites.type='student_grace'` |
| Staff sur invitation seulement, 7 jours | ✅ | ❌ | `invites` + e-mail Apps Script |
| Super Admin unique + transfert de propriété (mdp + e-mail + « ce n'était pas moi ») | ✅ | ❌ | Table `users.role='admin'` unique (contrainte) |
| **Empreinte digitale réelle (WebAuthn)** | ✅ | ❌ | `users.webauthn_cred*`, navigator.credentials |
| Rôles cumulables + accès par section | ✅ | ❌ | `users.roles` JSON |

### B. Paiement
| Fonctionnalité | Prototype | Prod | Notes |
|---|---|---|---|
| Chariow principal (`prd_6wx1czzp` → Art oratoire) | ✅ | ✅ | Pulse signé HMAC + delivery-id dédoublonné |
| CinetPay secours | ✅ | 🔶 | |
| Frais à la charge de l'étudiant | ✅ | 🔶 | paramètre checkout |
| Ventes admin (statuts, déclarés à vérifier) | ✅ | ❌ | `sales` |

### C. Expérience étudiant (V4)
| Fonctionnalité | Prototype | Prod | Notes |
|---|---|---|---|
| Accueil cockpit (date + heure, salutation) | ✅ | ❌ | |
| Mes formations + progression verrouillée à 100 % une fois terminée | ✅ | ❌ | `enrollments.completed_at` |
| Modules (vidéo principale obligatoire, ratios libres) | ✅ | ❌ | R2 + URL signée Worker |
| Exercices non bloquants / Évaluations bloquantes (quiz min %, soumission humaine) | ✅ | ❌ | |
| **Enrichissement silencieux** (vidéos compl., ressources, chapitres, exos, évals — jamais de reset, jamais de notif) | ✅ | ❌ | Règle d'or à préserver |
| Livres (lecteur paginé) & livres audio | ✅ | ❌ | R2 |
| Mes ressources par étudiant | ✅ | ❌ | attribution tous/par-étudiant |
| Assistant IA : nom/photo/langue configurables, isolation par formation, nom de l'étudiant | ✅ | ❌ | Fournisseurs gratuits (Groq/Gemini/OpenRouter/HF), supervision coach |
| Questions : IA immédiate + coach 48 h, panneau dédié | ✅ | ❌ | `threads/messages` |
| Support flottant casque (jamais « Support »), WhatsApp wa.me, tel: | ✅ | ❌ | |
| **Accueil flottant : 1 tap = retour, double tap = accueil + indice discret** | ✅ | ❌ | |
| Bouton retour = historique réel (swipe téléphone compatible) | ✅ | ❌ | |
| Menu : plein écran téléphone / tiroir grands écrans | ✅ | ❌ | |
| Notifications : cloche, **lues = disparaissent 48 h après lecture** | ✅ | ❌ | `notifs.read_at` + Worker |
| Ticker bas : annonces + vrais logos couleur ; désabonnement = disparaît du ticker de l'utilisateur ; validation https | ✅ | ❌ | |
| **Avis obligatoires** (2 sem plateforme / 1 mois formation, ≤1000 mots, audio transcrit) + Spotlight catalogue | ✅ | ❌ | `reviews` |
| Profil : Annuler/Enregistrer, sortie après enregistrement | ✅ | ❌ | |
| Paramètres SANS déconnexion | ✅ | ❌ | |
| Catalogue + checkout direct Chariow | ✅ | 🔶 | |
| Modes sombre (défaut, zéro blanc) / clair violacé ; 4 palettes au choix (violet/indigo/forêt/bordeaux) | ✅ | ❌ | variables CSS `data-palette` |

### D. Récompenses
| Fonctionnalité | Prototype | Prod | Notes |
|---|---|---|---|
| Premier Pas après le PREMIER COURS ; En Route au 1er chapitre terminé | ✅ | ❌ | `rewards` mode AUTOMATIQUE |
| Retour en Force unique, rappels 14 j chaleureux, récupération, jalons | ✅ | ❌ | |
| Attribution manuelle journalisée MANUEL ; serveur décide toujours | ✅ | ❌ | |
| 10 badges par formation, lignes mystère (pas de cadenas), emblèmes élégants | ✅ | ❌ | |

### E. Certification
| Fonctionnalité | Prototype | Prod | Notes |
|---|---|---|---|
| Demande → validation humaine → génération | ✅ | ❌ | `cert_requests` |
| Apps Script + Google Slides : PDF officiel + preview image, **slide de travail supprimé** | ✅ (contrat) | ❌ | endpoint Apps Script à créer |
| Certificat **figé** (nom capturé à l'émission) | ✅ | ❌ | `certs.holder_name` |
| Preview 16:9 + bouton PDF officiel + page publique `#/verifier/CODE` (QR) | ✅ | ❌ | route publique |
| Rétention propre (PDF + preview même cycle) | ✅ | ❌ | moteur |

### F. Administration
| Fonctionnalité | Prototype | Prod | Notes |
|---|---|---|---|
| Vue d'ensemble, Analytics | ✅ | ❌ | |
| Éditeur de formations complet (structure + infos + publication) | ✅ | ❌ | |
| Étudiants (détail, ajout grâce, suspension) | ✅ | ❌ | |
| Conversations (supervision IA, réponses coach) | ✅ | ❌ | |
| Certifications (demandes, génération, refus motivé) | ✅ | ❌ | |
| E-mails : section test + production (Apps Script) | ✅ | ❌ | |
| Exports CSV (`;`+BOM) protégés mot de passe, périodes, sortie auto après export | ✅ | ❌ | |
| Google Sheets sync (étudiants, ventes, progression, certifications, avis) | ✅ | ❌ | clé API dédiée |
| Espace Développeur : clés API créer/révoquer, journalisées | ✅ | ❌ | `api_keys` |
| Motivations : push dimanche uniquement, numérotation 1./2./3., alerte stock vide, invisibles côté étudiant | ✅ | ❌ | |
| **Cycle de vie** (page supervision du moteur) | ✅ | ❌ | |
| Super admin SANS ticker | ✅ | ❌ | |

### G. DAVAR DATA LIFECYCLE & PURGE ENGINE (brique critique)
Porter INTÉGRALEMENT `js/lifecycle.js` en module serveur (Worker cron 12 h).
Règles à respecter à la lettre :
- Fichier d'évaluation : supprimé après TOUTE décision ; limites **20 Mo audio / 128 Mo vidéo / 10 Mo doc** (verrouillées) ; extension ET MIME croisés ; formats doc configurables.
- Écrasement des soumissions (1 fichier actif par tentative) ; abandonnés 24 h ; expiration sécurité 14 j ; orphelins purgés.
- Conversations : coach 12 mois (exception `hold`), IA 90 j + stats anonymisées.
- Notifications : lues 48 h après lecture, max 180 j.
- Sessions/codes/jetons : purge après utilisation/expiration.
- Logs : 90 j techniques, 12 mois sécurité.
- Comptes : 12 mois sans NOUVELLE acquisition (connexion/relecture ne comptent pas) → quarantaine 7 j avec vérification d'exceptions → purge PII réelle ; certificats + stats anonymisées survivent.
- Certificats : fin de politique → PDF + preview purgés, statut expiré.
- Journal de purge minimal (`purge_log`), jamais de contenu.

### H. Temps réel
| Fonctionnalité | Prototype | Prod | Notes |
|---|---|---|---|
| Mise à jour SANS rechargement, zones ciblées, groupée, zéro appel inutile | ✅ (BroadcastChannel/storage) | ❌ | **SSE via Worker** : le Worker publie les zones modifiées ; le client ne rafraîchit que la zone ; fallback polling 30 s |

---

## 3. ARCHITECTURE CLOUDFLARE CIBLE

| Brique | Implémentation |
|---|---|
| App | **Next.js 15 LTS** sur Workers via **OpenNext** (Next 16 non supporté) |
| Base | **Turso** (gratuit : 5 Go, 500 M lectures/mois) — Drizzle ou libSQL client |
| Fichiers | **R2** : buckets `davar-videos` (signées), `davar-files` (soumissions temporaires, cycle court), `davar-certs` (PDF+preview), `davar-assets` |
| Moteur de purge | **Worker cron** (toutes les 12 h) appelant le module lifecycle (Turso + `R2.delete`) |
| Temps réel | Worker SSE `GET /api/live?since=rev` (révisions comme dans le prototype) |
| E-mails | Apps Script (URL + clé dans `settings`) |
| Certificats | Apps Script + Slides : reçoit JSON {nom figé, formation, dates, code, URL vérification + QR} → renvoie {pdfKey, previewKey} puis supprime le slide de travail |
| Push | web-push (VAPID) côté Worker |

## 3 bis. DAVAR SECURITY SHIELD — sécurité conçue en interne, indépendante de toute plateforme

Doctrine : aucune solution « inviolable » n'existe dans l'industrie ; notre réponse est une
**défense en profondeur construite par nous**, sans dépendre du bouclier d'un hébergeur.
Chaque couche est développée et possédée par DAVAR :

| Couche | Implémentation maison |
|---|---|
| Identité | Mots de passe **argon2id** (hashage propre), sessions à jetons aléatoires 256 bits, expiration courte, révocation |
| Empreinte | **WebAuthn** : la clé privée ne quitte JAMAIS l'appareil ; le serveur ne garde que la clé publique (résistant au phishing et aux fuites de base) |
| Force brute | Verrouillage progressif par e-mail + par IP (5 échecs → 5 min, puis escalade), **journalisé** et alerté (déjà actif dans le prototype) |
| Injection/XSS | Requêtes préparées 100 % (libSQL), échappement systématique côté client, **CSP** stricte (déjà dans le prototype), cookies HttpOnly+SameSite si utilisés |
| CSRF | Jetons anti-CSRF sur toute mutation |
| Accès | URLs R2 **signées et courtes** (5 min), droits vérifiés côté serveur à chaque requête (jamais côté client) |
| Anomalies | Détection maison : fréquence anormale, payloads suspects, geo-écart → alerte admin + défi temporaire |
| Données | Chiffrement au repos (Turso/R2), chiffrement TLS en transit, **purge automatique** par le Lifecycle Engine (moins de données = moins de surface d'attaque) |
| Secrets | Variables d'environnement côté Worker uniquement ; clés API hashées et révocables |
| Sauvegardes | Chiffrées, rotation stricte, accès limité (la sauvegarde ne doit pas devenir une fuite) |
| Humain | Double authentification équipe, transfert de propriété avec e-mail de confirmation, journal d'audit 12 mois |
| Mise à jour | Dépendances minimales, audits réguliers, correctifs appliqués sous 72 h |

Le prototype embarque déjà : verrouillage anti force brute journalisé, CSP,
WebAuthn réel, audit, Lifecycle Engine. Le reste se branche à la Phase 0/1
selon le tableau ci-dessus.

## 4. CONFORMITÉ
- Durées techniques à valider au regard du droit ivoirien (loi n°2013-450 relative aux données personnelles) et du RGPD si utilisateurs UE.
- Purge PII réelle (jamais simple désactivation) ; registre certificats séparé ; anonymisation irréversible (pas de table « statistiques » re-nominable).
- Exports sensibles protégés par mot de passe + audit ; clés API hashées.

## 5. ORDRE DE MIGRATION (proposition)
1. **Turso + auth applicative** (schema.sql, sessions, inscription par achat, WebAuthn) — socle.
2. **Catalogue + lecteur + progression verrouillée + enrichissement silencieux.**
3. **Paiement** (brancher le Pulse existant sur Turso) + accès gracieux.
4. **Moteur lifecycle + R2** (soumissions, limites, purges) — avant d'accepter de vrais fichiers.
5. **Certification** (Apps Script complet, vérification publique).
6. **Admin complet** (exports, Sheets, équipes, avis/sparklight, récompenses, motivations, cycle de vie).
7. **Temps réel SSE + push VAPID + palettes/thèmes.**

## 6. POINTS DE VIGILANCE (décisions figées)
- Next **15 LTS** maximum (OpenNext) ; Vercel Hobby interdit en usage commercial → Cloudflare.
- Le mot « WebAuthn », « VAPID », « Support » ne doivent JAMAIS apparaître côté étudiant.
- Zéro jargon technique côté étudiant ; exercice non bloquant, évaluation bloquante.
- Les limites de fichiers ne changent QUE sur validation du propriétaire.
- Une donnée n'est conservée que tant qu'une finalité légitime le justifie.
