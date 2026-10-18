#!/usr/bin/env node
/* PRÉPARER L'ENVOI DES SECRETS VERS CLOUDFLARE — sans jamais les afficher.
 *
 * Pourquoi ce fichier existe, et pourquoi en Node plutôt qu'en PowerShell :
 * la ligne de commande Cloudflare a deux pièges documentés, et ils ne
 * provoquent AUCUNE erreur — c'est le pire cas.
 *
 *   1. `cf workers secrets bulk --file corps.json` envoie le fichier en
 *      `application/octet-stream` ; l'API ne le parse pas, le jeu de changements
 *      est vide, la commande répond 200 et ne change rien. Il faut `--body`.
 *   2. Un corps « à plat » (`{"NOM": {...}}`) est traité comme un patch vide.
 *      L'API exige la forme ENVELOPPÉE :
 *          {"secrets": {"NOM": {"type":"secret_text","name":"NOM","text":"…"}}}
 *      Sans l'enveloppe : succès affiché, secret absent en production.
 *   3. `cf workers secrets update` REMPLACE tout le jeu de secrets au lieu d'en
 *      ajouter un. On n'y touche jamais : `bulk` est un patch (ce qui n'est pas
 *      mentionné reste inchangé).
 *
 * Ce script fabrique donc le corps, l'écrit dans un fichier, et n'imprime que
 * des NOMS. Le script PowerShell se contente d'appeler la commande avec
 * `--body @fichier` : les valeurs ne passent jamais par la ligne de commande,
 * où elles seraient visibles dans la liste des processus.
 *
 * Usage :
 *   node scripts/preparer-secrets.mjs                    # écrit le corps, affiche les noms
 *   node scripts/preparer-secrets.mjs --dry-run          # n'écrit rien, compte seulement
 *   node scripts/preparer-secrets.mjs --production       # refuse une base de recette
 *   node scripts/preparer-secrets.mjs --format env --completer
 *       # ajoute une valeur inerte aux clés déclarées mais vides, ce
 *       # qu'exige Cloudflare pour créer un Worker qui n'existe pas encore
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Les secrets tels que DÉCLARÉS dans cloudflare.config.ts. Un secret saisi dans
 * le tableau de bord mais absent d'ici est INERTE — silencieusement. Cette liste
 * est donc la référence, et un test vérifie qu'elle n'a pas divergé du fichier.
 */
export const SECRETS_DECLARES = [
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'AUTH_PARAMS_SECRET',
  'AUTH_VERIFIER_PEPPER',
  'APP_DIAGNOSTIC_TOKEN',
  'MAIL_APPS_SCRIPT_URL',
  'MAIL_APPS_SCRIPT_TOKEN',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'CHARIOW_PULSE_ID',
  'CHARIOW_STORE_ID',
  'CHARIOW_PULSE_SECRET',
  'CHARIOW_API_KEY',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'HUGGINGFACE_API_KEY',
  'ASSISTANT_CUSTOM_URL',
  'ASSISTANT_CUSTOM_KEY',
  // Ces deux-là ne servent qu'à Brevo, que le propriétaire a remplacé par le
  // relais Google Apps Script. On les garde pour ne rien casser le jour où il
  // voudrait revenir en arrière ; vides, ils sont simplement ignorés.
  'BREVO_API_KEY',
  'MAIL_FROM_EMAIL',
];

/** Valeurs à ne JAMAIS envoyer : le déploiement les écrit lui-même. */
export const ECRITS_PAR_LE_DEPLOIEMENT = ['MAILER_KIND', 'APP_PUBLIC_ORIGIN', 'APP_ENV'];

/** Lit un fichier .env : `NOM=valeur`, `#` en commentaire, guillemets retirés. */
export function lireEnvLocale(contenu) {
  const valeurs = new Map();
  for (const ligne of contenu.split(/\r?\n/)) {
    const nue = ligne.trim();
    if (!nue || nue.startsWith('#')) continue;
    const egal = nue.indexOf('=');
    if (egal <= 0) continue;
    const nom = nue.slice(0, egal).trim();
    let valeur = nue.slice(egal + 1).trim();
    if ((valeur.startsWith('"') && valeur.endsWith('"')) || (valeur.startsWith("'") && valeur.endsWith("'")))
      valeur = valeur.slice(1, -1);
    if (nom) valeurs.set(nom, valeur);
  }
  return valeurs;
}

/**
 * Le corps de requête attendu par l'API — la forme ENVELOPPÉE, seule forme qui
 * soit réellement appliquée.
 */
export function corpsSecrets(valeurs) {
  const secrets = {};
  for (const nom of SECRETS_DECLARES) {
    const valeur = (valeurs.get(nom) ?? '').trim();
    if (!valeur) continue; // une valeur vide n'écrase rien : elle est ignorée
    secrets[nom] = { type: 'secret_text', name: nom, text: valeur };
  }
  return { secrets };
}

function argumentsDe(argv) {
  const options = { dryRun: false, production: false, env: null, out: null, format: 'bulk', completer: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') options.dryRun = true;
    else if (argv[i] === '--production') options.production = true;
    else if (argv[i] === '--env') options.env = argv[i + 1] ?? null;
    else if (argv[i] === '--out') options.out = argv[i + 1] ?? null;
    else if (argv[i] === '--format') options.format = argv[i + 1] ?? 'bulk';
    else if (argv[i] === '--completer') options.completer = true;
  }
  return options;
}

export function main(argv = process.argv.slice(2), racine = RACINE) {
  const options = argumentsDe(argv);
  const cheminEnv = options.env ? resolve(options.env) : join(racine, '.env.local');
  let contenu;
  try {
    contenu = readFileSync(cheminEnv, 'utf8');
  } catch {
    console.error(`REFUS : ${cheminEnv} est introuvable. Remplissez-le d'abord (npm run env:local).`);
    return 1;
  }

  const valeurs = lireEnvLocale(contenu);
  const corps = corpsSecrets(valeurs);
  const noms = Object.keys(corps.secrets);

  // Garde-fou : une base de RECETTE envoyée en production viderait le campus.
  if (options.production) {
    const url = String(valeurs.get('TURSO_DATABASE_URL') ?? '');
    if (url && /staging/i.test(url)) {
      console.error('REFUS : TURSO_DATABASE_URL contient « staging ». Déploiement arrêté.');
      console.error('       La production et la recette ne partagent pas la même base.');
      return 1;
    }
  }

  console.log(`Secrets prêts : ${noms.length}`);
  console.log(`  ${noms.join(', ') || '— aucun —'}`);

  const manquants = SECRETS_DECLARES.filter((nom) => !noms.includes(nom));
  if (manquants.length > 0) {
    console.log('');
    console.log('Non renseignés (ignorés, pas effacés) :');
    console.log(`  ${manquants.join(', ')}`);
  }

  if (noms.length === 0) {
    console.error('\nREFUS : aucun secret à envoyer. Rien ne sera envoyé à Cloudflare.');
    return 1;
  }

  if (options.dryRun) {
    console.log('\nSimulation : aucun fichier écrit.');
    return 0;
  }

  const dossier = mkdtempSync(join(tmpdir(), 'davar-secrets-'));
  const cheminCorps = options.out ? resolve(options.out) : join(dossier, 'corps.json');

  if (options.format === 'env') {
    // Format attendu par « cf deploy --secrets-file » : une ligne NOM=valeur
    // par secret. C'est la SEULE façon de créer un Worker qui DÉCLARE des
    // secrets : Cloudflare refuse de créer le Worker sans les recevoir en
    // même temps, et refuse aussi de poser un secret sur un Worker qui
    // n'existe pas encore. Le serpent se mord la queue ; --secrets-file le
    // tranche d'un coup.
    const lignes = noms.map((nom) => `${nom}=${corps.secrets[nom].text}`);
    // Un Worker qui n'existe pas encore ne peut pas être créé sans recevoir
    // TOUS les secrets qu'il déclare, y compris ceux que le propriétaire n'a
    // pas remplis : Cloudflare les exige et refuse la création. On les
    // complète donc avec un simple espace — une valeur inerte, que le campus
    // reconnaît partout comme « vide » (chaque lecture fait .trim()) et qui ne
    // peut donc rien déclencher : ni le Pulse marchand (désactivé et qui
    // exige un préfixe « pulse_ »), ni Brevo (remplacé par le relais Apps
    // Script), ni le moteur d'assistant sur mesure (exige une longueur après
    // .trim()). Une clé présente avec un espace vaut mieux qu'une clé absente
    // qui bloque la mise en ligne.
    if (options.completer) for (const nom of manquants) lignes.push(`${nom}=" "`);
    writeFileSync(cheminCorps, `${lignes.join('\n')}\n`, { mode: 0o600 });
  } else {
    writeFileSync(cheminCorps, JSON.stringify(corps), { mode: 0o600 });
  }

  if (options.completer && manquants.length > 0) {
    console.log('');
    console.log(`Clés déclarées mais vides, complétées pour la création : ${manquants.join(', ')}`);
    console.log('  (un espace : une valeur inerte, jamais utilisée par le campus)');
  }

  console.log('');
  console.log(`Corps écrit : ${cheminCorps}`);
  if (options.format === 'env') {
    console.log('À utiliser avec (les valeurs ne passent PAS par la ligne de commande) :');
    console.log('  npx cf deploy --secrets-file ' + cheminCorps);
  } else {
    console.log('Commande à utiliser (les valeurs ne passent PAS par la ligne de commande) :');
    console.log('  npx cf workers secrets bulk --worker <nom> --body @' + cheminCorps);
  }
  console.log('');
  console.log('⚠ Ce fichier contient vos secrets : supprimez-le juste après l’envoi.');

  if (!options.out) {
    // On ne supprime pas : l'appelant doit s'en servir. On dit où il est.
    console.log(`   (sinon : Remove-Item '${cheminCorps}')`);
  }
  return 0;
}

// Exécuté seulement si lancé directement (les tests importent les fonctions).
if (process.argv[1] && process.argv[1].endsWith('preparer-secrets.mjs')) {
  process.exit(main());
}

export { rmSync };
