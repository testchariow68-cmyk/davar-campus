/* Création du compte SUPER ADMIN (propriétaire) — gravé dans la base.
 *
 * LE MOT DE PASSE NE QUITTE JAMAIS VOTRE MACHINE.
 *   - il est saisi en saisie masquée dans votre terminal (aucun écho, aucune
 *     trace dans l'historique du shell, aucun argument de commande) ;
 *   - la dérivation PBKDF2 (600 000 itérations) est faite ici, exactement comme
 *     le navigateur de l'étudiant la fait : seule la clé dérivée est écrite ;
 *   - il n'est ni journalisé, ni écrit dans un fichier, ni envoyé nulle part.
 *   Vous pouvez donc le changer plus tard sans rien casser d'autre.
 *
 * POURQUOI C'EST SÛR : le compte est créé avec le MÊME schéma que les comptes
 * étudiants (`client-v1`), et le même poivre serveur. La connexion depuis le site
 * fonctionnera donc à l'identique, sans aucun traitement particulier.
 *
 * RÈGLE DU PROJET RESPECTÉE : le Super Admin est UNIQUE (`PRODUCTION-MANIFEST.md`).
 * Le script refuse de créer un second administrateur : il faut d'abord transférer
 * ou retirer le rôle existant, jamais empiler les propriétaires.
 *
 * Usage (depuis le dossier davar-app) :
 *   node --experimental-strip-types scripts/create-admin.mjs
 *   DAVAR_OPS_TARGET=production node --experimental-strip-types scripts/create-admin.mjs
 *   (cible par défaut : staging ; `local` pour répéter hors ligne)
 */
import { createClient } from '@libsql/client';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { stdin, stdout } from 'node:process';
import { CLIENT_KDF_ITERATIONS, hashClientVerifier, randomClientSalt, normalizeEmail } from '../lib/server/auth-core.ts';

/* ------------------------------------------------------------- garde-fous */

const target = (process.env.DAVAR_OPS_TARGET ?? 'staging').trim();
if (!['staging', 'production', 'local'].includes(target)) {
  console.error('REFUS : DAVAR_OPS_TARGET inconnu (valeurs admises : staging, production, local)');
  process.exit(2);
}

const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken, TURSO_EXPECTED_HOST: host } = process.env;
let parsed;
try { parsed = new URL(url); } catch {}
const looksStaging = /(^|[.-])staging([.-]|$)/i.test(host ?? '');
const cibleOk = target === 'local'
  ? Boolean(url?.startsWith('file:'))
  : url && authToken && host && parsed && parsed.hostname === host && host.endsWith('.turso.io') &&
    (target === 'production' ? !looksStaging : host.startsWith('davar-campus-staging-'));
if (!cibleOk) {
  console.error(`REFUS : cible DAVAR ${target} non vérifiée (URL, jeton ou hôte incohérent)`);
  console.error('Pour la production : DAVAR_OPS_TARGET=production, TURSO_DATABASE_URL et TURSO_AUTH_TOKEN renseignés.');
  process.exit(2);
}

console.log(`\nCompte SUPER ADMIN — cible : ${target}${target === 'local' ? ' (base locale de répétition)' : ` — ${host}`}\n`);

/* --------------------------------------------- saisie masquée du mot de passe */

/**
 * Lit une ligne sans l'afficher : l'écho est redirigé vers un flux muet, donc
 * rien n'apparaît à l'écran et rien ne reste dans l'historique du terminal.
 * Cette méthode s'appuie sur readline (déjà éprouvé) plutôt que de manipuler
 * le mode brut du terminal, qui s'est révélé fragile.
 * Refuse un terminal non interactif : un mot de passe passé en argument ou par
 * un tuyau resterait traçable.
 */
async function demanderMasque(invite) {
  if (!stdin.isTTY) {
    console.error('REFUS : la saisie masquée exige un terminal interactif.');
    console.error('Lancez la commande directement dans votre terminal (pas via un fichier ni un tuyau) :');
    console.error('un mot de passe passé en argument resterait traçable dans l’historique.');
    process.exit(2);
  }
  stdout.write(invite);
  const muet = new Writable({ write(_morceau, _encodage, suivant) { suivant(); } });
  const champ = createInterface({ input: stdin, output: muet, terminal: true });
  try {
    return (await champ.question('')).trim();
  } finally {
    champ.close();
    stdout.write('\n');
  }
}

/* --------------------------------------------------------------- dérivation */

const base64url = (octets) => Buffer.from(octets).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Dérive la clé comme le fait le navigateur : PBKDF2-SHA256, 600 000 itérations,
 * 32 octets, encodés en base64url. C'est CE résultat, et lui seul, qui est écrit.
 */
async function deriver(motDePasse, selBase64url, iterations) {
  const sel = Buffer.from(selBase64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations },
    cle,
    256
  );
  return base64url(new Uint8Array(bits));
}

const texte = (valeur) => (valeur == null ? '' : String(valeur));

/* ------------------------------------------------------------------ déroulé */

const db = createClient({ url, authToken });
const rl = createInterface({ input: stdin, output: stdout });

try {
  const admins = await db.execute("SELECT id, email_normalized, display_name FROM users WHERE role='admin'");
  const proprietaireExistant = admins.rows[0] ?? null;
  if (proprietaireExistant) {
    console.log(`Un SUPER ADMIN existe déjà : ${proprietaireExistant.email_normalized} (${proprietaireExistant.display_name}).`);
    console.log('Le projet impose un propriétaire UNIQUE. Deux choix, et deux seulement :');
    console.log(`  • changer SON mot de passe  → relancez avec exactement la même adresse : ${proprietaireExistant.email_normalized}`);
    console.log('  • transférer la propriété   → Espace Direction → Équipe, puis « Propriétaire (transféré) »\n');
  }

  // Adresse proposée par défaut : DAVAR_OWNER_EMAIL, ou le propriétaire déjà en
  // base (le cas normal quand on vient changer le mot de passe). Entrée = accepter.
  const adresseProposee = (process.env.DAVAR_OWNER_EMAIL ?? proprietaireExistant?.email_normalized ?? '').trim();
  const inviteEmail = adresseProposee ? `E-mail du propriétaire [${adresseProposee}] : ` : 'E-mail du propriétaire : ';
  const email = normalizeEmail((await rl.question(inviteEmail)).trim() || adresseProposee);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('adresse e-mail invalide');

  const nomPropose = (process.env.DAVAR_OWNER_NAME ?? (email === proprietaireExistant?.email_normalized ? texte(proprietaireExistant.display_name) : '')).trim();
  const inviteNom = nomPropose ? `Nom affiché [${nomPropose}] : ` : 'Nom affiché (ex. YAPO Serge Trésor) : ';
  const nom = ((await rl.question(inviteNom)).trim() || nomPropose).trim();
  if (nom.length < 2 || nom.length > 80) throw new Error('nom invalide (2 à 80 caractères)');
  // IMPÉRATIF : libérer l'entrée avant la saisie masquée. Tant que cette interface
  // vit, elle consomme les caractères et la saisie masquée ne recevrait rien.
  rl.close();

  const existant = await db.execute({
    sql: 'SELECT id, role, display_name FROM users WHERE email_normalized=?',
    args: [email],
  });
  if (existant.rows.length && existant.rows[0].role !== 'admin')
    throw new Error(`un compte existe déjà pour ${email} avec le rôle « ${existant.rows[0].role} ». Changez d’adresse ou élevez d’abord ce compte (production-ops.mjs grant-staff).`);
  if (proprietaireExistant && email !== proprietaireExistant.email_normalized)
    throw new Error(
      `refusé : ${proprietaireExistant.email_normalized} dirige déjà la plateforme. La plateforme n’a qu’un propriétaire. ` +
        `Pour lui donner un mot de passe, relancez avec SON adresse ; pour le remplacer, transférez la propriété depuis l’Espace Direction → Équipe.`
    );
  if (proprietaireExistant && email !== proprietaireExistant.email_normalized)
    throw new Error(
      `refusé : ${proprietaireExistant.email_normalized} dirige déjà la plateforme. La plateforme n’a qu’un propriétaire. ` +
        `Pour lui donner un mot de passe, relancez avec SON adresse ; pour le remplacer, transférez la propriété depuis l’Espace Direction → Équipe.`
    );

  const motDePasse = await demanderMasque('Mot de passe (aucun écho) : ');
  if (motDePasse.length < 12) throw new Error('mot de passe trop court : 12 caractères minimum pour un compte propriétaire');
  const confirmation = await demanderMasque('Confirmez le mot de passe : ');
  if (motDePasse !== confirmation) throw new Error('les deux saisies diffèrent');

  const sel = randomClientSalt();
  const iterations = CLIENT_KDF_ITERATIONS;
  console.log('\nDérivation locale en cours (600 000 itérations, comme le navigateur)…');
  const debut = Date.now();
  const verifier = await deriver(motDePasse, sel, iterations);
  if (!/^[A-Za-z0-9_-]{43}$/.test(verifier)) throw new Error('clé dérivée inattendue');
  const empreinte = await hashClientVerifier(verifier, {
    verifierPepper: process.env.AUTH_VERIFIER_PEPPER,
    verifierIterations: Number(process.env.AUTH_VERIFIER_ITERATIONS) || undefined,
  });
  console.log(`Clé dérivée en ${Date.now() - debut} ms — le mot de passe n’a jamais quitté cette machine.`);

  const now = Date.now();
  if (existant.rows.length) {
    await db.execute({
      sql: `UPDATE users SET display_name=?, password_hash=?, kdf_scheme='client-v1',
              client_salt=?, client_iterations=?, email_verified_at_ms=COALESCE(email_verified_at_ms, ?)
            WHERE id=?`,
      args: [nom, empreinte, sel, iterations, now, String(existant.rows[0].id)],
    });
    console.log(`\n✅ Mot de passe du propriétaire mis à jour : ${email}`);
  } else {
    const id = `usr_admin_${Date.now().toString(36)}`;
    await db.execute({
      sql: `INSERT INTO users(id, email_normalized, display_name, password_hash, role, status,
                              created_at_ms, email_verified_at_ms, kdf_scheme, client_salt, client_iterations)
            VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, 'client-v1', ?, ?)`,
      args: [id, email, nom, empreinte, now, now, sel, iterations],
    });
    console.log(`\n✅ Compte SUPER ADMIN créé : ${email} (${nom})`);
  }

  console.log('   rôle        : admin — propriétaire unique du campus');
  console.log('   e-mail      : marqué confirmé (vous êtes le propriétaire ; aucun e-mail à valider)');
  console.log('   dérivation  : client-v1, PBKDF2-SHA256 600 000 itérations');
  console.log('\nConnectez-vous sur /connexion avec cet e-mail et ce mot de passe : la dérivation');
  console.log('se refera dans votre navigateur, exactement comme pour un étudiant.');
  console.log('\nIMPORTANT : connectez-vous avec L’ADRESSE QUE VOUS RELEVEZ RÉELLEMENT.');
  console.log('C’est elle qui recevra le lien de confirmation lors d’une inscription, et c’est');
  console.log('elle qui rattachera automatiquement vos futurs achats Chariow à votre compte.');
  console.log('Si ce n’est pas la bonne boîte, recommencez avec la bonne adresse : elle sera mise à jour.');
  console.log('\nIMPORTANT : connectez-vous avec L’ADRESSE QUE VOUS RELEVEZ RÉELLEMENT.');
  console.log('C’est elle qui recevra le lien de confirmation lors d’une inscription, et c’est');
  console.log('elle qui rattachera automatiquement vos futurs achats Chariow à votre compte.');
  console.log('Si ce n’est pas la bonne boîte, recommencez avec la bonne adresse : elle sera mise à jour.');
  console.log('\nPour diriger, ouvrez l’Espace Direction dans votre navigateur : /direction');
  console.log('Vous y créerez vos formations, vos modules et vos leçons, vous nommerez votre équipe,');
  console.log('vous ouvrirez les accès à la main et vous viderez le contenu d’essai — sans ligne de commande.');
  console.log('\nLa ligne de commande reste disponible en secours :');
  console.log('  node --experimental-strip-types scripts/production-ops.mjs team');
  console.log('  node --experimental-strip-types scripts/production-ops.mjs purge --confirm VIDER --apply');
} catch (erreur) {
  console.error('\nARRÊT :', erreur instanceof Error ? erreur.message : 'erreur inconnue');
  process.exitCode = 1;
} finally {
  if (!rl.closed) rl.close();
  db.close();
}
