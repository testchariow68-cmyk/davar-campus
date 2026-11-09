# HISTORIQUE — ancien plan de passage en production

**Décision actuelle :** Turso est la seule base applicative cible ; voir `TURSO-SEUL-PLAN.md`. Ce document contient des choix **désormais abandonnés**, notamment CinetPay et une purge automatique, et ne doit pas servir de commande de migration, de purge ou de déploiement. Conserver les fichiers existants et revoir le modèle métier avant toute utilisation.

> ⚠️ Mis à jour le 26/09/2026 : **Turso + Cloudflare uniquement** (décision propriétaire).
> Le diagnostic complet et l'inventaire de chaque fonctionnalité se trouvent dans
> **`../davar-app/PRODUCTION-MANIFEST.md`**. Le schéma Turso est prêt : `../davar-app/turso/schema.sql`.

Le prototype (`davar-campus/`) a validé l'expérience V4, les récompenses, les avis,
l'enrichissement silencieux, la certification figée et le **DAVAR DATA LIFECYCLE &
PURGE ENGINE** (39+9+6 tests automatiques verts). La production reproduit chaque
écran 1:1, branché sur les vraies données.

## Stack définitive

| Brique | Choix | Notes |
|---|---|---|
| Application | **Next.js 15 LTS** sur Cloudflare Workers (OpenNext) | Next 16 non supporté par OpenNext |
| Base de données | **Turso** (SQLite edge) | 5 Go gratuits, aucune limite d'utilisateurs, 500 M lectures/mois |
| Auth | **Applicative** (argon2id + sessions + WebAuthn réel) | Turso ne fournit pas d'auth |
| Fichiers | **Cloudflare R2** | 10 Go gratuits, pas de frais sortants |
| Paiement | **Chariow** (principal) + CinetPay (secours) | Pulse signé HMAC, contrat figé |
| E-mails / certificats | **Google Apps Script** | Slides → PDF + preview, slide de travail supprimé |
| Push | web-push (VAPID) côté Worker | Libellés simples côté étudiant |
| Temps réel | Worker SSE par zones + révisions | Zéro rechargement de page |

## Phases

### Phase 0 — Socle Turso (Semaine 1)
- [ ] Supprimer `lib/supabase/*` ; installer le client Turso
- [ ] Exécuter `turso/schema.sql`
- [ ] Auth applicative : mot de passe argon2id, sessions expirables, inscription par e-mail d'achat reconnu
- [ ] WebAuthn réel (empreinte), Super Admin unique
- **Critère d'acceptation** : un étudiant réel s'inscrit via son achat Chariow et se connecte par empreinte.

### Phase 1 — Cœur pédagogique (Semaines 2–3) → première version utilisable
- [ ] Catalogue + lecteur vidéo R2 (URL signées, multi-ratios)
- [ ] Progression verrouillée à 100 % après fin de formation
- [ ] Éditeur de formations + **enrichissement silencieux** (jamais de reset, jamais de notification)
- [ ] Exercices non bloquants / évaluations bloquantes
- **Critère** : un étudiant suit une formation complète et obtient 100 % verrouillés.

### Phase 2 — Paiement & moteur de cycle de vie (Semaines 4–5)
- [ ] Brancher le Pulse Chariow existant sur Turso (dédoublonnage delivery-id)
- [ ] R2 : bucket soumissions + **lifecycle engine** (limites 20/128/10 Mo, écrasement, 24 h, orphelins, purge de secours cron 12 h)
- [ ] Notifications : disparition 48 h après lecture
- **Critère** : aucun fichier d'évaluation ne survit à une décision ; les purges sont journalisées.

### Phase 3 — Certification & avis (Semaine 6)
- [ ] Apps Script complet : PDF officiel + preview, slide supprimé, QR → vérification publique
- [ ] Certificats figés, page publique `/verifier/[code]`
- [ ] Avis obligatoires + Spotlight + modération
- **Critère** : un certificat généré est vérifiable publiquement même après purge du compte.

### Phase 4 — Administration complète (Semaines 7–8)
- [ ] Exports protégés, Google Sheets, espace Développeur (clés API)
- [ ] Récompenses automatiques + manuelles, motivations du dimanche
- [ ] Page Cycle de vie (supervision du moteur), quarantaine des comptes
- **Critère** : l'équipe gère le campus sans jamais toucher la base.

### Phase 5 — Temps réel & finitions (Semaine 9)
- [ ] SSE par zones (aucun rechargement, mises à jour groupées)
- [ ] Push VAPID, palettes de couleurs, modes sombre/clair
- [ ] Conformité : durées validées (droit ivoirien + RGPD le cas échéant)

## Règles absolues (rappel)
1. Une donnée n'est conservée que tant qu'une finalité légitime le justifie.
2. Zéro jargon technique côté étudiant.
3. Les limites de fichiers ne changent que sur validation du propriétaire.
4. L'enrichissement d'une formation ne réinitialise jamais une progression et n'envoie jamais de notification.
5. Le certificat est un document historique figé.
