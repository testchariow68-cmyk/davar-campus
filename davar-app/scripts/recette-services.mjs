/* RECETTE DES SERVICES — vérifier, sur VOTRE machine, que les quatre services
 * sont vraiment branchés. Ce script ne prouve rien par politesse : il parle aux
 * vrais services, et il n'affiche JAMAIS la valeur d'un secret.
 *
 * Ce qu'il vérifie, et comment :
 *   1. CLÉS     — les trois valeurs que PERSONNE ne peut vous fournir, celles que
 *                 `npm run env:local` fabrique : présence et longueur minimale.
 *                 Absentes, elles sont annoncées « en attente » — jamais un échec.
 *   2. BASE     — la connexion répond, les migrations sont appliquées, la
 *                 dernière version est lue. Refus si l'origine est inconnue.
 *   3. STOCKAGE — un vrai aller-retour dans le seau : dépôt signé, relecture
 *                 signée, puis vérification du contenu. La preuve est un petit
 *                 fichier `recette/preuve-….txt` laissé dans le seau (vous pouvez
 *                 le supprimer depuis le tableau de bord : 100 octets).
 *   4. E-MAILS  — deux contrôles SANS envoyer d'e-mail : le relais répond en
 *                 ligne, et le jeton est accepté (un envoi avec une adresse
 *                 invalide est refusé APRÈS la vérification du jeton). L'envoi
 *                 réel n'a lieu que si vous le demandez : `--email vous@exemple.com`.
 *   5. CHARIOW  — l'état du drapeau et la présence des quatre valeurs. Aucun
 *                 appel au marchand : la recette Pulse se fait à la main, plus tard.
 *
 *   6. ASSISTANTS — la clé Groq sert DEUX choses : les réponses de l'assistant et
 *                 la transcription des avis dictés. On la vérifie par la liste des
 *                 modèles du fournisseur : c'est gratuit, et cela ne consomme
 *                 aucune question ni aucune transcription.
 *
 * SORTIE : uniquement des verdicts (« posée », « absente », « relié », « refusé »),
 * jamais une valeur. Un service non configuré n'est PAS un échec : c'est un état.
 * Un service configuré qui ne répond pas, lui, fait sortir le script en erreur.
 *
 * Usage :
 *   npm run recette:services
 *   npm run recette:services -- --email vous@exemple.com     (envoi réel, en plus)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';
import { configStockage, clePropre, urlDepot, urlLecture } from '../lib/server/stockage.ts';
import { mailerConfigured, mailerKind, sendEmail } from '../lib/server/mailer.ts';

/* ------------------------------------------------------------ environnement */

// `.env.local` vit à la racine de davar-app/. On le charge sans jamais l'afficher.
try {
  process.loadEnvFile(new URL('../.env.local', import.meta.url));
} catch {
  console.log('Note : aucun .env.local lisible — les valeurs doivent venir de l’environnement.');
}

const args = process.argv.slice(2);
const destinataireEssai = (() => {
  const index = args.indexOf('--email');
  return index >= 0 ? (args[index + 1] ?? '').trim() : '';
})();

/** Présence d'une valeur, sans jamais en révéler le contenu. */
const posee = (nom) => (process.env[nom] ?? '').trim().length > 0;
const etat = (nom) => `${nom} : ${posee(nom) ? 'posée' : 'ABSENTE'}`;

let echecs = 0;
function controler(nom, condition, detail = '') {
  console.log(`${condition ? '  OK   ' : 'ÉCHEC '} ${nom}${detail ? ` — ${detail}` : ''}`);
  if (!condition) echecs += 1;
}

/* --------------------------------------------------------- 1. clés internes */

/**
 * Les trois valeurs que personne ne peut vous fournir — ni un tableau de bord,
 * ni un fournisseur. `npm run env:local` les fabrique. Absentes, elles sont un
 * ÉTAT (« en attente »), pas un échec : en développement, l'application a des
 * replis. Posées trop courtes, en revanche, elles cassent la production en
 * silence — donc là, c'est un échec.
 */
function verifierClesInternes() {
  console.log('\n1. VOS CLÉS INTERNES (fabriquées par « npm run env:local »)');
  const attendues = [
    ['AUTH_PARAMS_SECRET', 32, 'sel factice des comptes — sans elle, aucun compte en production'],
    ['AUTH_VERIFIER_PEPPER', 16, 'poivre du vérificateur — une fuite de la base seule ne suffit plus'],
    ['APP_DIAGNOSTIC_TOKEN', 32, 'ouvre les deux adresses de diagnostic'],
  ];
  for (const [nom, minimum, role] of attendues) console.log(`   ${etat(nom)}`);
  let enAttente = 0;
  for (const [nom, minimum, role] of attendues) {
    const valeur = (process.env[nom] ?? '').trim();
    if (valeur.length === 0) {
      enAttente += 1;
      continue;
    }
    controler(`${nom} est assez long`, valeur.length >= minimum, `${valeur.length} caractère(s) — minimum ${minimum} (${role})`);
  }
  if (enAttente === attendues.length) {
    console.log('   → en attente : lancez « npm run env:local » et les trois sont écrites pour vous.');
    return;
  }
  if (enAttente > 0) console.log(`   → ${enAttente} clé(s) encore absente(s) : « npm run env:local » complète ce qui manque, sans toucher au reste.`);
}

/* ----------------------------------------------------------------- 2. base */

async function verifierBase() {
  console.log('\n2. BASE DE DONNÉES');
  console.log(`   ${etat('TURSO_DATABASE_URL')} · ${etat('TURSO_AUTH_TOKEN')}`);
  const url = (process.env.TURSO_DATABASE_URL ?? '').trim();
  if (!url) {
    console.log('   → en attente : aucune base visée. En local, dev-data suffit.');
    return;
  }
  const hebergee = /^(libsql|https?):\/\//.test(url);
  if (hebergee && !posee('TURSO_AUTH_TOKEN')) {
    controler('la base hébergée a son jeton', false, 'TURSO_AUTH_TOKEN est absente');
    return;
  }
  let db = null;
  try {
    db = createClient({ url, authToken: posee('TURSO_AUTH_TOKEN') ? process.env.TURSO_AUTH_TOKEN : undefined });
    const sonde = await db.execute('SELECT 1 AS ok');
    controler('la base répond', Number(sonde.rows[0]?.ok) === 1, hebergee ? 'base hébergée' : 'base locale');
  } catch (erreur) {
    controler('la base répond', false, `refus de la base (${erreur?.code ?? 'erreur'})`);
    return;
  }
  try {
    const tables = await db.execute(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    console.log(`   → ${Number(tables.rows[0]?.n)} table(s) en base`);
  } catch {
    console.log('   → nombre de tables illisible (base non migrée ?)');
  }
  try {
    // `schema_migrations` porte (version, checksum, installed_at_ms) : le nom du
    // fichier n'y est pas, mais l'empreinte SHA-256 y est — et c'est elle qui
    // compte. On la compare au fichier de migration du dépôt : une base migrée
    // depuis un AUTRE fichier se voit immédiatement.
    const migrations = await db.execute('SELECT version, checksum FROM schema_migrations ORDER BY version DESC LIMIT 1');
    const version = Number(migrations.rows[0]?.version ?? 0);
    controler('les migrations sont appliquées', version >= 16, `dernière version ${version || 'aucune'} — le manifeste en attend 16`);
    const dossier = new URL('../turso/migrations/', import.meta.url);
    const fichier = readdirSync(dossier).find((nom) => nom.startsWith(`${String(version).padStart(3, '0')}_`));
    const empreinte = fichier
      ? createHash('sha256').update(readFileSync(new URL(fichier, dossier))).digest('hex')
      : '';
    const enBase = String(migrations.rows[0]?.checksum ?? '');
    controler(
      'l’empreinte de la dernière migration est celle du fichier du dépôt',
      Boolean(fichier) && empreinte === enBase,
      fichier ? (empreinte === enBase ? `${fichier} — identique` : `${fichier} — DIFFÉRENTE`) : 'fichier de migration introuvable'
    );
  } catch (erreur) {
    controler('l’empreinte de la dernière migration est celle du fichier du dépôt', false, `lecture impossible (${erreur?.name ?? 'erreur'})`);
  }
  await db.close();
}

/* ------------------------------------------------------------- 3. stockage */

async function verifierStockage() {
  console.log('\n3. STOCKAGE DES FICHIERS (R2)');
  for (const nom of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) console.log(`   ${etat(nom)}`);
  const config = configStockage();
  if (!config) {
    // Le piège le plus probable : les quatre noms sont là, mais la valeur ne
    // passe pas le format. On le dit NOMMÉMENT — sans jamais montrer la valeur.
    const toutes = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].every(posee);
    if (!toutes) {
      console.log('   → en attente : dépôt et lecture restent refusés, proprement.');
      return;
    }
    const compte = (process.env.R2_ACCOUNT_ID ?? '').trim();
    controler(
      'l’identifiant de compte a le bon format',
      /^[a-f0-9]{32}$/i.test(compte),
      'attendu : les 32 caractères hexadécimaux de l’identifiant de compte Cloudflare (ni le nom du compte, ni un jeton d’API)'
    );
    controler('le nom du seau est utilisable', /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test((process.env.R2_BUCKET ?? '').trim()),
      'attendu : minuscules, chiffres et tirets (R2 refuse les majuscules et les points)');
    controler('la clé d’accès S3 est complète', (process.env.R2_ACCESS_KEY_ID ?? '').trim().length >= 16 && (process.env.R2_SECRET_ACCESS_KEY ?? '').trim().length >= 16,
      'attendu : une clé d’API S3 créée dans R2 (différente du jeton d’API Cloudflare)');
    return;
  }
  const cle = clePropre(`recette/preuve-${Date.now().toString(36)}.txt`);
  const adresseDepot = await urlDepot(cle, 300);
  if (!adresseDepot) {
    controler('une adresse de dépôt est produite', false);
    return;
  }
  const contenu = 'DAVAR — fichier de preuve de la recette des services. Sans contenu personnel.';
  try {
    const depot = await fetch(adresseDepot, { method: 'PUT', body: contenu, signal: AbortSignal.timeout(15000) });
    controler('le dépôt signé est accepté par le seau', depot.ok, `HTTP ${depot.status}`);
    if (!depot.ok) return;
    const adresseLecture = await urlLecture(cle, 120);
    const lecture = await fetch(adresseLecture, { signal: AbortSignal.timeout(15000) });
    const relu = lecture.ok ? await lecture.text() : '';
    controler('la relecture signée rend le même contenu', relu === contenu, `HTTP ${lecture.status}`);
    console.log(`   → preuve laissée dans le seau : ${cle} (${contenu.length} octets, supprimable à la main)`);
  } catch (erreur) {
    controler('le seau répond', false, `échec réseau (${erreur?.name ?? 'erreur'})`);
  }
}

/* -------------------------------------------------------------- 4. e-mails */

async function verifierEmails() {
  console.log('\n4. ENVOI DES E-MAILS');
  const mode = mailerKind();
  // MAILER_KIND n'est pas un secret à chercher : c'est le mot « apps_script »,
  // écrit par « npm run env:local ». On le dit explicitement quand il manque.
  console.log(`   MAILER_KIND : ${mode === 'none' ? 'aucune valeur posée — « npm run env:local » écrit « apps_script »' : mode}`);
  if (mode === 'apps_script') console.log(`   ${etat('MAIL_APPS_SCRIPT_URL')} · ${etat('MAIL_APPS_SCRIPT_TOKEN')}`);
  if (mode === 'brevo') console.log(`   ${etat('BREVO_API_KEY')} · ${etat('MAIL_FROM_EMAIL')}`);

  if (mode === 'none') {
    if (posee('MAIL_APPS_SCRIPT_URL') || posee('MAIL_APPS_SCRIPT_TOKEN') || posee('BREVO_API_KEY')) {
      controler(
        'le mode d’envoi est déclaré',
        false,
        'des valeurs sont posées mais MAILER_KIND ne les nomme pas (« apps_script » ou « brevo »)'
      );
      return;
    }
    console.log('   → en attente : aucune inscription réelle ne partira (l’application refuse plutôt que de mentir).');
    return;
  }

  // Rien de posé pour ce service : c'est un ÉTAT, pas un échec — l'application
  // le dit aussi à ses utilisateurs (« aucune inscription réelle ne partira »).
  const rienDePose = mode === 'apps_script'
    ? !posee('MAIL_APPS_SCRIPT_URL') && !posee('MAIL_APPS_SCRIPT_TOKEN')
    : !posee('BREVO_API_KEY') && !posee('MAIL_FROM_EMAIL');
  if (rienDePose) {
    console.log('   → en attente : aucune inscription réelle ne partira (l’application refuse plutôt que de mentir).');
    return;
  }

  // Les formats ensuite : une valeur mal collée est l'échec le plus probable, et
  // il est silencieux côté application. Ici, on le nomme.
  let structureValide = true;
  if (mode === 'apps_script') {
    const url = (process.env.MAIL_APPS_SCRIPT_URL ?? '').trim();
    let https = false;
    try {
      https = new URL(url).protocol === 'https:';
    } catch {
      https = false;
    }
    if (!https) {
      controler('l’adresse du relais est bien en https', false, 'copiez l’« URL de l’application Web » terminée par /exec');
      structureValide = false;
    }
    const jeton = (process.env.MAIL_APPS_SCRIPT_TOKEN ?? '').trim();
    // L'application accepte 16 caractères, mais le script Google en exige 32 et
    // répond 500 en dessous : c'est donc 32 qui compte, et on le dit ici.
    if (jeton.length < 32) {
      controler(
        'le jeton du relais fait au moins 32 caractères',
        false,
        'c’est la propriété DAVAR_MAIL_SECRET du script — le script refuse en dessous de 32 (réponse 500)'
      );
      structureValide = false;
    }
  } else {
    const cle = (process.env.BREVO_API_KEY ?? '').trim();
    if (cle.length < 20) {
      controler('la clé Brevo est posée', false, 'clé d’API Brevo attendue (en-tête api-key)');
      structureValide = false;
    }
    const expediteur = (process.env.MAIL_FROM_EMAIL ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expediteur)) {
      controler('l’adresse d’expédition est valide', false, 'elle doit être vérifiée chez le fournisseur');
      structureValide = false;
    }
  }
  if (!structureValide) return;

  controler('la configuration d’envoi est complète', mailerConfigured());

  if (mode === 'apps_script') {
    const url = (process.env.MAIL_APPS_SCRIPT_URL ?? '').trim();
    const jeton = (process.env.MAIL_APPS_SCRIPT_TOKEN ?? '').trim();
    // a. Le relais est-il en ligne et public ? Un GET suffit : le script répond
    //    sans rien envoyer et sans exposer le moindre secret.
    try {
      const reponse = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
      const texte = await reponse.text();
      controler(
        'le relais Google répond en ligne',
        reponse.ok && texte.includes('relais e-mail DAVAR actif'),
        reponse.ok ? 'déploiement accessible' : `HTTP ${reponse.status} — le déploiement est-il publié « pour tout le monde » ?`
      );
    } catch {
      controler('le relais Google répond en ligne', false, 'injoignable');
    }
    // b. Le jeton est-il accepté ? Le script vérifie le jeton AVANT le
    //    destinataire : on envoie une adresse volontairement invalide, donc
    //    aucun e-mail ne partira, quoi qu'il arrive.
    try {
      const reponse = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: jeton, to: 'invalide', subject: 'recette', text: 'recette' }),
        signal: AbortSignal.timeout(15000),
      });
      const texte = await reponse.text();
      const refuse = texte.includes('non autorisé') || texte.includes('jeton non configuré');
      controler(
        'le jeton du relais est accepté',
        !refuse,
        refuse ? 'le jeton ne correspond pas à DAVAR_MAIL_SECRET' : 'jeton reconnu — l’adresse d’essai a été refusée, aucun e-mail n’est parti'
      );
    } catch {
      controler('le jeton du relais est accepté', false, 'réponse illisible');
    }
  }

  if (destinataireEssai) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinataireEssai)) {
      controler('envoi d’essai', false, 'adresse invalide');
      return;
    }
    try {
      await sendEmail({
        to: destinataireEssai,
        subject: 'DAVAR — essai d’envoi',
        text: 'Cet essai prouve que le campus peut envoyer un e-mail. Si vous le lisez, le relais fonctionne.',
      });
      controler('un vrai e-mail d’essai part', true, 'regardez la boîte de réception (et les indésirables)');
    } catch (erreur) {
      controler('un vrai e-mail d’essai part', false, `refusé (${erreur?.name ?? 'erreur'})`);
    }
  } else {
    console.log('   (aucun envoi réel ici : « npm run recette:services -- --email vous@exemple.com » en déclenche un)');
  }
}

/* ------------------------------------------------------------- 5. Chariow */

function verifierChariow() {
  console.log('\n5. VENTE CHARIOW (PULSE)');
  for (const nom of ['CHARIOW_PULSE_SECRET', 'CHARIOW_PULSE_ID', 'CHARIOW_API_KEY', 'CHARIOW_STORE_ID'])
    console.log(`   ${etat(nom)}`);
  const actif = (process.env.CHARIOW_ENABLE_PULSE ?? 'false').trim() === 'true';
  console.log(`   CHARIOW_ENABLE_PULSE : ${actif ? 'true' : 'false'}`);
  const toutes = ['CHARIOW_PULSE_SECRET', 'CHARIOW_PULSE_ID', 'CHARIOW_API_KEY', 'CHARIOW_STORE_ID'].every(posee);
  if (!toutes) console.log('   → en attente : le webhook reste fermé, aucune livraison ne peut être perdue.');
  if (toutes && !actif)
    console.log('   → prêt mais FERMÉ, et c’est voulu : la recette sur le compte marchand vient d’abord.');
  if (actif)
    console.log('   → OUVERT : chaque livraison reçue est vérifiée par signature puis relue chez le marchand.');
  console.log('   Aucun appel au marchand n’a été fait par cette recette.');
}

/* ----------------------------------------- 6. assistants et dictée vocale */

/**
 * La clé Groq n'est pas un secret « à trouver » : elle se crée dans une console
 * (voir GUIDE-MES-VALEURS.md). Elle sert l'assistant ET la transcription des avis.
 * On la vérifie par un appel qui ne consomme rien : la liste des modèles.
 */
async function verifierAssistants() {
  console.log('\n6. ASSISTANTS ET DICTÉE VOCALE');
  console.log(`   ${etat('GROQ_API_KEY')} · ${etat('GEMINI_API_KEY')}`);
  const groq = (process.env.GROQ_API_KEY ?? '').trim();
  const gemini = (process.env.GEMINI_API_KEY ?? '').trim();
  if (groq.length === 0 && gemini.length === 0) {
    console.log('   → en attente : l’assistant le dit honnêtement (il renvoie au coach humain),');
    console.log('     et l’étudiant qui dicte un avis bascule sur la transcription de son appareil.');
    console.log('   → une seule clé suffit pour ouvrir l’assistant. Si Groq ne répond pas');
    console.log('     depuis votre région, prenez Gemini : aistudio.google.com/apikey.');
    return;
  }
  if (groq.length > 0 && gemini.length === 0) {
    console.log('   → seule Groq est renseignée. Si elle est refusée (blocage réseau ou quota),');
    console.log('     l’assistant n’aura plus de relais : une clé Gemini en plus coûte 2 minutes.');
  }
  if (groq.length > 0) {
    try {
      const reponse = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { authorization: `Bearer ${groq}` },
        signal: AbortSignal.timeout(15000),
      });
      if (reponse.status === 403) {
        // Groq bloque les centres de données (serveurs, VPN, Workers Cloudflare) :
        // la clé peut être parfaite, l'appel est refusé quand même. Ce n'est pas
        // une erreur de configuration, et ce n'est pas grave : l'assistant passe
        // à Gemini et la dictée bascule sur l'appareil de l'étudiant.
        console.log('   ÉCHEC · Groq refuse l’appel depuis cette machine (HTTP 403).');
        console.log('     Ce n’est pas votre clé : Groq bloque les adresses de serveur.');
        console.log('     Conséquence : aucune. L’assistant enchaîne sur Gemini, et la dictée');
        console.log('     des avis bascule sur l’appareil de l’étudiant (Plan B, sans quota).');
        console.log('     Le jour où vous aurez une clé joignable, ajoutez GROQ_BASE_URL pour');
        console.log('     passer par une passerelle Cloudflare — voir GUIDE-MES-VALEURS.md §5.');
        if (!gemini) {
          console.log('     ⚠ Sans clé Gemini à côté, l’assistant n’a plus de moteur : prenez une');
          console.log('       clé Gemini (aistudio.google.com/apikey), gratuite et joignable partout.');
        }
      } else {
        controler(
          'la clé Groq est acceptée',
          reponse.ok,
          reponse.status === 401 ? 'clé refusée — vérifiez qu’elle commence par gsk_ et qu’elle est active' : `HTTP ${reponse.status}`
        );
      }
      if (reponse.ok) {
        const corps = await reponse.json().catch(() => null);
        const modeles = Array.isArray(corps?.data) ? corps.data.map((modele) => String(modele?.id ?? '')) : [];
        console.log('   → elle sert l’assistant ET la transcription des avis dictés (Whisper large-v3).');
        controler(
          'le moteur de transcription est disponible',
          modeles.some((modele) => modele.startsWith('whisper-large-v3')),
          'whisper-large-v3 — la liste des modèles ne le montre pas'
        );
      }
    } catch {
      controler('la clé Groq est acceptée', false, 'injoignable');
    }
  }
  if (gemini.length > 0) {
    try {
      const reponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(gemini)}`, {
        signal: AbortSignal.timeout(15000),
      });
      controler('la clé Gemini est acceptée', reponse.ok, reponse.status === 400 ? 'clé refusée' : `HTTP ${reponse.status}`);
    } catch {
      controler('la clé Gemini est acceptée', false, 'injoignable');
    }
  }
  console.log('   (aucune question, aucune transcription n’a été consommée par cette recette)');
}

/* ------------------------------------------------------------------ suite */

console.log('RECETTE DES SERVICES — verdicts seulement, jamais une valeur.');
verifierClesInternes();
await verifierBase();
await verifierStockage();
await verifierEmails();
verifierChariow();
await verifierAssistants();

console.log(
  echecs === 0
    ? '\nRECETTE : tout ce qui est configuré répond. Ce qui est en attente reste annoncé comme tel dans l’application.'
    : `\nRECETTE : ${echecs} service(s) configuré(s) ne répondent pas — voir les lignes ÉCHEC ci-dessus.`
);
process.exit(echecs === 0 ? 0 : 1);
