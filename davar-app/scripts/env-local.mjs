/* PRÉPARER .env.local — un seul endroit où coller vos valeurs.
 *
 * Trois des valeurs demandées par le campus n'existent nulle part : personne ne
 * peut vous les fournir, il faut les FABRIQUER (ce sont les clés qui protègent
 * les comptes et le diagnostic). Ce script les fabrique pour vous, puis écrit un
 * `.env.local` prêt à remplir — avec tous les noms attendus, groupés par service.
 *
 * Ce qu'il fait, exactement :
 *   - lit le `.env.local` existant et CONSERVE toute valeur déjà présente ;
 *   - fabrique (seulement si elles manquent) AUTH_PARAMS_SECRET,
 *     AUTH_VERIFIER_PEPPER et APP_DIAGNOSTIC_TOKEN ;
 *   - réécrit le fichier avec tous les noms, des commentaires courts, et rien
 *     d'autre ;
 *   - affiche la liste des noms ENCORE À REMPLIR — jamais une valeur.
 *
 * `.env.local` est ignoré par git (`.gitignore` : `.env*`) : il ne part JAMAIS
 * sur GitHub, et il n'est jamais envoyé dans une conversation.
 *
 * Usage : npm run env:local
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const chemin = new URL('../.env.local', import.meta.url);
const secret = () => randomBytes(32).toString('hex'); // 64 caractères hexadécimaux

/* --------------------------------------------------- lecture du fichier existant */

/** Toutes les valeurs déjà présentes, connues ou non : rien n'est perdu. */
function lireExistant() {
  const valeurs = new Map();
  if (!existsSync(chemin)) return valeurs;
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const propre = ligne.trim();
    if (propre.length === 0 || propre.startsWith('#')) continue;
    const separateur = propre.indexOf('=');
    if (separateur < 1) continue;
    const nom = propre.slice(0, separateur).trim();
    const valeur = propre.slice(separateur + 1).trim();
    if (/^[A-Z0-9_]+$/.test(nom)) valeurs.set(nom, valeur);
  }
  return valeurs;
}

const existantes = lireExistant();
const garder = (nom, defaut = '') => existantes.get(nom) || defaut;
const fabriquer = (nom) => garder(nom) || secret();

/* --------------------------------------------------------------- écriture */

const lignes = [
  '# ═══════════════════════════════════════════════════════════════════════════',
  '#  VOS VALEURS — fichier PRIVÉ. Jamais sur GitHub, jamais dans une conversation.',
  '#  Remplissez ce qui est vide, puis : npm run recette:services',
  '#  Fabriqué par « npm run env:local » le ' + new Date().toISOString().slice(0, 10),
  '# ═══════════════════════════════════════════════════════════════════════════',
  '',
  '# ── Le campus tourne en mode développement (sûr sur votre machine) ──────────',
  'APP_ENV=' + garder('APP_ENV', 'development'),
  '',
  '# ── 1. BASE DE DONNÉES (Turso) ─────────────────────────────────────────────',
  '# Laissez la base locale pour travailler hors ligne, ou collez l\'URL libsql://…',
  '# de Turso pour que la recette vérifie la VRAIE base.',
  'TURSO_DATABASE_URL=' + garder('TURSO_DATABASE_URL', 'file:dev-data/davar-dev.db'),
  '# Le jeton d\'accès de cette base (il commence par eyJ… et il est long : c\'est normal).',
  'TURSO_AUTH_TOKEN=' + garder('TURSO_AUTH_TOKEN'),
  '# L\'hôte seul, sans « libsql:// » ni « / » : la partie qui précède le premier point',
  '# (ex. davar-campus-xxxx.aws-eu-west-1.turso.io). Sert au déploiement public.',
  '# TURSO_EXPECTED_HOST=',
  '',
  '# ── 2. VOS CLÉS FABRIQUÉES (personne ne peut vous les donner) ──────────────',
  '# Elles sont déjà écrites ci-dessous. Ne les changez plus une fois le campus',
  '# ouvert : cela déconnecterait les comptes existants.',
  'AUTH_PARAMS_SECRET=' + fabriquer('AUTH_PARAMS_SECRET'),
  'AUTH_VERIFIER_PEPPER=' + fabriquer('AUTH_VERIFIER_PEPPER'),
  'APP_DIAGNOSTIC_TOKEN=' + fabriquer('APP_DIAGNOSTIC_TOKEN'),
  '',
  '# ── 3. ENVOI DES E-MAILS (Google Apps Script) ──────────────────────────────',
  '# C\'est ce qui autorise la recette à parler à votre relais.',
  'MAILER_KIND=' + garder('MAILER_KIND', 'apps_script'),
  '# L\'URL du déploiement, celle qui finit par /exec.',
  'MAIL_APPS_SCRIPT_URL=' + garder('MAIL_APPS_SCRIPT_URL'),
  '# La propriété DAVAR_MAIL_SECRET de votre script — exactement la même valeur.',
  'MAIL_APPS_SCRIPT_TOKEN=' + garder('MAIL_APPS_SCRIPT_TOKEN'),
  '',
  '# ── 4. STOCKAGE DES FICHIERS (Cloudflare R2) ──────────────────────────────',
  '# ATTENTION : la clé d\'accès et son secret viennent de « Gérer les clés d\'API S3 »',
  '# dans R2 — ce n\'est PAS le jeton d\'API Cloudflare.',
  'R2_ACCOUNT_ID=' + garder('R2_ACCOUNT_ID'),
  'R2_ACCESS_KEY_ID=' + garder('R2_ACCESS_KEY_ID'),
  'R2_SECRET_ACCESS_KEY=' + garder('R2_SECRET_ACCESS_KEY'),
  'R2_BUCKET=' + garder('R2_BUCKET'),
  '',
  '# ── 5. VENTE CHARIOW (automatisation Pulse) ───────────────────────────────',
  '# Le drapeau reste FERMÉ jusqu\'à la recette sur le compte marchand.',
  'CHARIOW_ENABLE_PULSE=' + garder('CHARIOW_ENABLE_PULSE', 'false'),
  'CHARIOW_PULSE_SECRET=' + garder('CHARIOW_PULSE_SECRET'),
  'CHARIOW_PULSE_ID=' + garder('CHARIOW_PULSE_ID'),
  'CHARIOW_API_KEY=' + garder('CHARIOW_API_KEY'),
  'CHARIOW_STORE_ID=' + garder('CHARIOW_STORE_ID'),
  '',
  '# ── 6. ASSISTANTS (un seul des deux suffit pour démarrer) ──────────────────',
  'GROQ_API_KEY=' + garder('GROQ_API_KEY'),
  'GEMINI_API_KEY=' + garder('GEMINI_API_KEY'),
  '',
  '# ── Rappel : ces deux valeurs-là ne se saisissent PAS dans Cloudflare ───────',
  '# MAILER_KIND et APP_PUBLIC_ORIGIN sont écrits par le déploiement lui-même.',
  '',
];

/* Les valeurs inconnues du modèle ci-dessus sont recopiées telles quelles. */
const connus = new Set(
  [...lignes.join('\n').matchAll(/^([A-Z0-9_]+)=/gm)].map((correspondance) => correspondance[1])
);
const inconnues = [...existantes.keys()].filter((nom) => !connus.has(nom));
if (inconnues.length > 0) {
  lignes.push('# ── Valeurs déjà présentes, recopiées sans modification ──────────────────');
  for (const nom of inconnues) lignes.push(`${nom}=${existantes.get(nom)}`);
  lignes.push('');
}

writeFileSync(chemin, lignes.join('\n'), 'utf8');

/* ------------------------------------------------------------------- verdict */

const aRemplir = [...lignes.join('\n').matchAll(/^([A-Z0-9_]+)=$/gm)].map((correspondance) => correspondance[1]);
console.log(`Fichier prêt : ${chemin.pathname}`);
console.log(`Valeurs fabriquées pour vous : AUTH_PARAMS_SECRET, AUTH_VERIFIER_PEPPER, APP_DIAGNOSTIC_TOKEN (64 caractères hexadécimaux).`);
if (aRemplir.length === 0) {
  console.log('Il ne reste rien à remplir : lancez « npm run recette:services ».');
} else {
  console.log(`Encore à remplir (${aRemplir.length}) — les valeurs, elles, ne sont jamais affichées :`);
  for (const nom of aRemplir) console.log(`   - ${nom}`);
}
console.log('Ce fichier est ignoré par git : il ne partira jamais sur GitHub.');
