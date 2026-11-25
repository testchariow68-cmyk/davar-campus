# Proposition de cadrage — séances audio/vidéo Davar

> **Statut : idée cadrée, non implémentée.** Ce document ne constitue pas l’annonce d’une fonctionnalité disponible.
>
> Aujourd’hui, Davar reconnaît seulement `kind = live` comme un type de leçon. Il n’existe ni séance créée, ni salle audio/vidéo, ni lien de rejoindre, ni intégration Discord, Luma ou WebRTC. Une livraison live ne pourra être annoncée qu’après un test réel de bout en bout.

## 1. Ce que l’étude retient

| Référence | Ce qui est intéressant | Ce que Davar doit en retenir — sans copier le produit |
| --- | --- | --- |
| **Discord** | Les événements peuvent être planifiés dans un salon vocal ou Stage, avec des permissions distinctes pour créer et gérer l’événement. Les permissions comprennent notamment la demande de parole et la modération. | Séparer clairement **organisateur**, **co-animateur**, **intervenant** et **participant**. Prévoir salle d’attente, demande de parole, mute/exclusion et droits par séance. Discord serait éventuellement un canal communautaire ou un connecteur, pas la source de vérité pédagogique. |
| **Luma** | L’événement est un objet planifié rattaché à un calendrier, avec visibilité, approbation, capacité, liste d’attente, invités, rappels et gestion après création. | Faire de la séance un objet Davar relié à une formation/leçon : inscription, capacité, rappels, présence et lien d’accès ne doivent pas être gérés dans un tableur ou uniquement chez le fournisseur vidéo. |
| **ClassIn** | La salle est pensée pour l’enseignement : audio/vidéo bidirectionnel, tableau, groupes séparés, main levée, placement, mute, enregistrements, présence et métriques d’activité. | Ajouter une couche pédagogique autour du média : objectif de la séance, consigne avant l’entrée, activités, présence, replay et ressources après séance. |
| **Tencent Meeting / VooV** | Les notes produit documentent inscription, réglage micro/caméra avant l’entrée, répétition avant webinaire, co-animateurs, salles séparées et enregistrement cloud. | Prévoir un vrai état **préparation / test technique** et des rôles opérables pendant la séance. L’enregistrement doit être explicite, consenti et gouverné par Davar. |

Ces références sont des signaux de conception. Elles ne justifient pas d’ajouter un simple bouton qui ouvrirait un lien externe et ne suffirait pas à appeler cela une séance Davar.

## 2. Produit recommandé pour Davar

Proposer trois modes, avec la même identité de séance et le même cycle de vie :

1. **Atelier** — petit groupe audio/vidéo, caméra et micro, chat, main levée, partage d’écran ou tableau selon le fournisseur choisi.
2. **Conférence** — quelques intervenants, audience principalement en écoute, demandes de parole et modération inspirées d’un Stage.
3. **Rendez-vous** — appel privé apprenant-équipe ou petit groupe, planifié ou déclenché depuis une demande d’accompagnement. C’est la piste à conserver pour les appels directs depuis Davar.

Davar devrait posséder la planification, les inscriptions, les droits, la présence, les états et les traces. Un fournisseur média compatible WebRTC pourrait fournir le SFU, les flux audio/vidéo et éventuellement l’enregistrement via un **adaptateur de fournisseur**. Ainsi, changer de fournisseur ne ferait pas perdre l’historique pédagogique.

### Adaptateur média — contrat à cadrer

Le fournisseur retenu devra au minimum permettre :

- créer et fermer une room réelle ;
- émettre des jetons de courte durée selon le rôle ;
- rejoindre depuis le navigateur et vérifier micro/caméra avant l’entrée ;
- remonter les entrées, sorties, mute, caméra et déconnexions ;
- gérer une salle d’attente et les permissions de parole ;
- démarrer/arrêter un enregistrement seulement si la politique de la séance l’autorise ;
- fournir un statut fiable de fin de séance et, si activé, un replay privé.

Discord et Luma peuvent être étudiés comme connecteurs complémentaires (communauté, découverte, calendrier), mais ils ne doivent pas remplacer cette interface média ni le contrôle d’accès Davar.

## 3. Modèle fonctionnel minimal

### Côté Direction

- créer une séance depuis une formation, un module ou une leçon ;
- choisir le mode, le titre, le fuseau, les horaires, la capacité, les animateurs et la politique d’enregistrement ;
- publier, modifier, annuler, ouvrir ou fermer les inscriptions ;
- voir les inscrits, la liste d’attente, les présents et les journaux ;
- démarrer une salle de répétition puis la séance réelle ;
- récupérer le replay privé et décider s’il devient une ressource complémentaire du cours.

### Côté apprenant

- voir la séance dans la formation et dans l’accueil avec son état réel ;
- s’inscrire ou se désinscrire selon les règles ;
- recevoir un rappel et ne voir le bouton **Rejoindre** que dans la fenêtre autorisée ;
- passer un test micro/caméra avant l’entrée ;
- attendre l’admission si la séance le demande ;
- voir les autres participants selon la politique de visibilité ;
- retrouver après la séance la présence, le replay autorisé et les ressources complémentaires.

### États obligatoires

`brouillon → planifiée → inscriptions ouvertes → salle d’attente → en direct → terminée → replay disponible` avec les sorties `annulée` et `échec technique`.

Un participant doit également avoir un état traçable : `inscrit`, `liste d’attente`, `présent`, `admis`, `intervenant`, `absent`, `expulsé` ou `déconnecté`.

## 4. Données et sécurité à prévoir

Le nom exact des tables reste à décider après le spike, mais le modèle doit couvrir au moins :

- `live_sessions` : séance, leçon/formation, mode, horaires, capacité, statut, fournisseur et identifiant de room ;
- `live_session_hosts` : animateurs, co-animateurs et permissions ;
- `live_session_attendees` : inscription, liste d’attente, admission, présence et durée ;
- `live_session_events` : audit des changements d’état, entrées, sorties, mute, modération et erreurs ;
- `live_session_recordings` : consentement, statut de traitement, rétention, visibilité et lien privé.

Mesures non négociables :

- contrôler côté serveur l’inscription à la formation et le droit de rejoindre ;
- ne jamais exposer un secret permanent ni une room publique ;
- délivrer un jeton court, lié à l’utilisateur, à la séance et au rôle ;
- limiter la fenêtre et le nombre de tentatives de connexion ;
- journaliser création, annulation, changement de rôle, admission, expulsion et accès au replay ;
- afficher avant l’entrée si la séance est enregistrée, obtenir le consentement requis et permettre une politique « aucune captation » ;
- stocker les replays dans un espace privé avec durée de conservation et suppression contrôlées ;
- prévoir chiffrement en transit, règles de rétention et vérification RGPD avant ouverture à de vrais apprenants.

## 5. Découpage proposé avant implémentation

### Étape 0 — spike fermé

Décider entre fournisseur hébergé, SDK intégré ou infrastructure auto-hébergée. Tester deux navigateurs et un téléphone avec une vraie room : création, jeton, entrée, micro, caméra, déconnexion, fermeture et absence d’accès hors inscription. Aucun écran ne sera présenté comme live avant ce test.

### Étape 1 — séance Davar v1

Livrer la planification, le lien/salle réelle, l’accès apprenant, audio/vidéo, rôles, participants, états avant/pendant/après, journalisation et politique d’enregistrement. Tester une séance 1:1 puis un petit groupe avec une personne Direction et plusieurs comptes de test.

### Étape 2 — pédagogie et modération

Ajouter salle d’attente, main levée, chat, co-animateur, partage d’écran, présence détaillée, replay privé, ressources post-séance et éventuellement groupes séparés.

### Étape 3 — appels d’accompagnement

Ajouter les appels apprenant-équipe et apprenant-groupe depuis une demande ou un créneau, avec disponibilité, invitation ciblée, confidentialité renforcée et historique minimal. Ce flux ne doit pas être confondu avec une conférence de cours.

## 6. Critère de complétude

La fonctionnalité ne sera considérée comme terminée que si une personne Direction peut créer et planifier une séance, qu’un apprenant autorisé peut rejoindre une **salle réelle** depuis Davar, que l’audio/vidéo et les participants fonctionnent, que les états avant/pendant/après sont visibles, et qu’une stratégie testée de sécurité, consentement, enregistrement et conservation est documentée. Tant que l’un de ces points manque, l’interface doit rester honnête et parler d’une leçon ou d’une séance à préparer — pas d’une visioconférence disponible.

## Sources consultées

- [Discord — Scheduled Events](https://support.discord.com/hc/en-us/articles/4409494125719-Scheduled-Events)
- [Discord — Permissions](https://docs.discord.com/developers/topics/permissions)
- [Luma — Creating an Event](https://help.luma.com/p/creating-an-event)
- [Luma — Waitlist](https://help.luma.com/p/waitlist)
- [ClassIn — Teacher Features](https://www.classin.com/teachers/)
- [ClassIn — Student Features](https://www.classin.com/students/)
- [Tencent Cloud — VooV Meeting release notes](https://www.tencentcloud.com/document/product/1054/43773)
