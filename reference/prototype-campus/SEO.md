# 🔎 SEO — être en tête sur les requêtes de marque

## Structure : 2 sites, 2 domaines (séparés, testés smoke52)

**Site vitrine `site/`** — domaine propre (nom définitif au déploiement, placeholder `davar-academie.pages.dev`) :
- `<title>` + meta description + keywords : « Davar Académie », « art oratoire », « éloquence », « prise de parole en public », « Yopougon / Abidjan / Côte d'Ivoire ».
- Open Graph + Twitter Card (partages Telegram/WhatsApp/Facebook propres).
- **JSON-LD** : EducationalOrganization + Course « Devenir un excellent orateur » (prix 45 000 XOF + offre Chariow) + ItemList 5 formations → résultats enrichis.
- Page **lisible sans JS** (hero, formations, comment ça marche, contact).
- **Boutons d'achat → checkout Chariow** de « Devenir un excellent orateur ». Après paiement, Chariow + la plateforme envoient les accès par e-mail.
- **Aucun lien vers l'application** : la plateforme est privée, on y entre uniquement après achat.

**Application `davar-campus/`** — domaine propre (davarcampus.co) :
- Plateforme privée : SEO d'origine conservé (landing statique pour les crawlers, retirée au rendu), accès après achat uniquement.

## Off-page (à faire chez vous — c'est ça qui verrouille la 1ʳᵉ place)
1. **Google Search Console** : vérifier davarcampus.co puis soumettre `sitemap.xml`.
2. **Fiche Google Business Profile** « Davar Académie » — Yopougon, catégorie « École / Centre de formation » : panneau local + Maps au-dessus même des résultats organiques.
3. **Réseaux cohérents** : même nom exact partout (Instagram @davaracademie, TikTok, Facebook), lien davarcampus.co dans chaque bio ; ils sont déjà dans le `sameAs` du JSON-LD.
4. **Backlinks maison** : chaque profil social, chaque vidéo TikTok/YouTube pointe vers le site — la marque unique + ces liens = n°1 rapide.
5. **Annuaires & presse locaux** (éducation / entrepreneuriat CI) : quelques citations NAP (nom, adresse, téléphone) suffisent.
6. **Contenu public régulier** : ajouter des pages publiques dans `site/` (une par formation, extraits gratuits) donne des URL indexables au-delà de la page d'accueil — les ajouter au `sitemap.xml`.
7. **Surveillance** : recherche `site:davarcampus.co` + requêtes de marque dans Search Console ; viser position ≤ 2 sous 4-6 semaines.

Le nom de marque étant unique, la 1ʳᵉ place est quasi automatique dès l'indexation ; ce paquet accélère l'indexation et sécurise les extraits enrichis (formations, adresse, logo).
