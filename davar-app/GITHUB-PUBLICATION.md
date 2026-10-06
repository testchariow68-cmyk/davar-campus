# DAVAR — publication GitHub à préparer, pas encore effectuée

Source à publier : le projet `davar-app/` (Next.js/Workers/Turso) avec code, tests, documentation, configuration non secrète et migration SQL revue. Une archive source mise à jour est disponible séparément. Aucune authentification GitHub ou URL de dépôt n'a été fournie à cet environnement d'assistance : **aucun commit ni push GitHub n'a été réalisé ici**.

## État à ne pas surdéclarer

- Schéma Turso `davar-campus-staging` appliqué par le propriétaire : 9 tables, 3 index, reçu vérifié, tables métier contrôlées vides. Catalogue vide choisi pour le premier test privé.
- `npx cf deploy --dry-run` réussi sur son PC ; cela **n'a pas mis DAVAR en ligne**.
- Le propriétaire a ensuite déclaré avoir créé/déployé les variables/secrets du Worker via l'interface Cloudflare. Le bouton de l'interface déploie une version du Worker préexistant ; **cela n'atteste pas que le nouveau code Next.js a été déployé**. Demander une sortie de `npx cf deploy` réel et la recette avant d'affirmer que DAVAR est en ligne.
- Worker distinct `davar-campus-next-staging-2026`, Workers Free, `workers.dev` sous Cloudflare Access tout trafic selon le propriétaire. Pas de domaine acheté, pas de Workers Paid. Paiements dans l'app et comptes/campus encore désactivés.

## Protection avant mise en dépôt

- Ne jamais ajouter `.env.local`, autres `.env*`, jetons, sauvegarde SQLite Turso, fichiers `.bak`, caches/builds, `node_modules`, ZIP ni journaux avec secrets. `.gitignore` exclut ces catégories ; revérifier malgré tout la liste exacte des fichiers avant un commit.
- Ne pas publier les valeurs Cloudflare/Turso, ni des captures montrant les jetons. Une URL de dépôt n'est pas un secret ; demander l'URL exacte `https://github.com/PROPRIETAIRE/davar-campus` sans demander de mot de passe, PAT ou clé.
- Préserver l'historique et les fichiers du dépôt distant existant : comparer avant intégration, travailler sur branche dédiée si le dépôt existe et contient autre chose. **Jamais** `git push --force`, `git reset --hard`, suppression massive ou remplacement de `main` sans revue et accord distinct.
- Aucune synchronisation GitHub ne déploie automatiquement DAVAR sans vérifier les éventuels workflows/auto-deploy du dépôt. Vérifier ces intégrations avant de pousser.
