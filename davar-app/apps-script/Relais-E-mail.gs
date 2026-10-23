/**
 * DAVAR — relais d'e-mail par Google Apps Script
 * ------------------------------------------------
 * POURQUOI : le campus envoie les e-mails de confirmation depuis un Worker
 * Cloudflare. Un Worker ne peut pas parler directement à Gmail ; ce petit script
 * sert de pont, gratuitement, depuis le compte Google de l'académie.
 *
 * CE QUE FAIT LE CAMPUS (contrat exact, déjà implémenté côté application) :
 *   POST <URL-du-script>
 *   en-tête : content-type: application/json
 *   corps   : { "secret": "<jeton>", "to": "…", "subject": "…", "text": "…" }
 *
 * INSTALLATION, DANS L'ORDRE
 *   1. Ouvrez https://script.google.com depuis le compte de l'académie → « Nouveau projet ».
 *   2. Effacez le contenu par défaut, collez TOUT ce fichier, puis enregistrez.
 *   3. Menu « Projet » (icône engrenage) → « Propriétés du script » →
 *      « Ajouter une propriété de script » :
 *         Nom   : DAVAR_MAIL_SECRET
 *         Valeur: une longue chaîne aléatoire (16 caractères au minimum)
 *      Cette valeur est le « jeton » que vous saisirez aussi dans Cloudflare.
 *   4. Menu « Déployer » → « Nouveau déploiement » → type « Application Web » :
 *         Description      : Relais e-mail DAVAR
 *         Exécuter en tant que : MOI
 *         Qui a accès       : TOUT LE MONDE   ← indispensable : le Worker n'est pas
 *                             connecté à votre compte Google ; c'est le jeton
 *                             ci-dessus qui protège l'accès, pas la connexion.
 *      Puis « Déployer » et autorisez l'accès (Google affiche un avertissement :
 *      c'est votre propre script, choissez « Paramètres avancés » → « Accéder »).
 *   5. Copiez l'« URL de l'application Web » (elle finit par /exec).
 *
 * À SAISIR ENSUITE DANS CLOUDFLARE (Worker → Settings → Variables and Secrets),
 * les deux en « Secret » :
 *      MAIL_APPS_SCRIPT_URL   = l'URL /exec copiée à l'étape 5
 *      MAIL_APPS_SCRIPT_TOKEN = la valeur choisie à l'étape 3
 *
 * L'ANCIEN SCRIPT SUPABASE NE PEUT PLUS SERVIR. Il attendait `token` et
 * `htmlBody` ; la plateforme envoie `secret`, `to`, `subject` et `text`. Avec
 * l'ancien script, chaque appel répondait « Token invalide » — et quand bien
 * même il aurait passé, le corps du message serait parti vide. Si vous aviez
 * ce script, remplacez-le entièrement par celui-ci : rien n'en est repris.
 *
 * PIÈGE CONNU, DÉJÀ TRAITÉ CÔTÉ APPLICATION : une application Web Apps Script
 * répond toujours par une redirection (302) avant le vrai résultat. Suivie
 * automatiquement, cette redirection change le POST en GET : c'est alors
 * doGet — et non doPost — qui s'exécute, le relais répond « actif »… et aucun
 * e-mail ne part. La plateforme suit la redirection à la main, en conservant
 * le POST. Si vous déployez ce fichier, redéployez-le entier (la réponse
 * porte maintenant « envoye », que l'application vérifie).
 *
 * SÉCURITÉ : le jeton est vérifié à chaque appel, avec une comparaison à durée
 * constante ; un appel sans jeton correct est refusé et journalisé. Une fois que
 * tout fonctionne, vous pouvez aussi restreindre les adresses d'expédition ci-dessous.
 */

/** Nom affiché comme expéditeur, en majuscules : c'est la marque. */
const EXPEDITEUR_NOM = 'DAVAR ACADÉMIE';
/** Nombre maximal d'envois par jour, pour ne jamais dépasser le quota Google. */
const PLAFOND_JOURNALIER = 250;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return reponse('requête vide', 400);
    let corps;
    try {
      corps = JSON.parse(e.postData.contents);
    } catch (erreur) {
      return reponse('JSON illisible', 400);
    }

    const attendu = PropertiesService.getScriptProperties().getProperty('DAVAR_MAIL_SECRET');
    // 16 caractères au minimum : en dessous, ce n'est plus un secret. Si vous
    // en générez un nouveau, prenez-le long (32 ou plus) et changez les deux
    // côtés — le script et Cloudflare — le même jour.
    if (!attendu || attendu.length < 16) return reponse('jeton non configuré côté script', 500);
    if (!egalConstante(String(corps.secret || ''), attendu)) {
      console.warn('Appel refusé : jeton invalide');
      return reponse('non autorisé', 401);
    }

    const destinataire = String(corps.to || '').trim();
    const sujet = String(corps.subject || '').trim().slice(0, 200);
    const texte = String(corps.text || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinataire)) return reponse('destinataire invalide', 400);
    if (!sujet || !texte) return reponse('sujet ou contenu manquant', 400);

    // Plafond journalier : on refuse plutôt que de risquer le blocage du compte.
    const verrou = LockService.getScriptLock();
    verrou.waitLock(10000);
    try {
      const proprietes = PropertiesService.getScriptProperties();
      const jour = Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd');
      const cle = 'envois_' + jour;
      const dejaEnvoyes = Number(proprietes.getProperty(cle) || 0);
      if (dejaEnvoyes >= PLAFOND_JOURNALIER) return reponse('plafond journalier atteint', 429);
      MailApp.sendEmail({ to: destinataire, subject: sujet, body: texte, name: EXPEDITEUR_NOM });
      proprietes.setProperty(cle, String(dejaEnvoyes + 1));
    } finally {
      verrou.releaseLock();
    }

    // « envoye » est la preuve que doPost a bien tourné. Sans ce mot, la
    // plateforme refuse de croire que l'e-mail est parti — c'est volontaire :
    // une réponse de doGet (« actif ») ressemble à un succès et n'envoie rien.
    return reponse('envoyé', 200, true);
  } catch (erreur) {
    console.error(erreur);
    return reponse('erreur interne', 500);
  }
}

/** Vérification simple : dit seulement si le script est déployé (aucun secret exposé). */
function doGet() {
  return reponse('relais e-mail DAVAR actif', 200);
}

function egalConstante(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function reponse(message, code, envoye) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: code === 200, envoye: envoye === true, message: message })
  ).setMimeType(ContentService.MimeType.JSON);
}
