/* RECETTE DE LA VUE TEST — vérifier le parcours réel, de la connexion au retour.
 *
 * Ce que cette recette prouve, et que les tests unitaires ne peuvent pas
 * montrer : un vrai navigateur n'est pas nécessaire, mais il faut un VRAI
 * serveur. Elle :
 *   1. crée un propriétaire de recette dans la base LOCALE de développement ;
 *   2. se connecte comme lui (dérivation PBKDF2 600 000 itérations, comme le
 *      navigateur) ;
 *   3. prépare les comptes de test, ouvre la vue « Coach », et vérifie que la
 *      navigation de l'Espace Direction devient celle du coach (« Réglages »
 *      disparaît) ;
 *   4. vérifie que le propriétaire GARDE ses droits pendant la visite ;
 *   5. quitte la vue, retire les comptes de test, et efface son propriétaire.
 *
 * GARDE-FOU : la base visée doit être un FICHIER local de `dev-data/`. Tant pis
 * pour l'ergonomie — un script qui fabrique un propriétaire au mot de passe connu
 * n'a rien à faire ailleurs.
 *
 * Usage (le serveur de développement doit tourner) :
 *   npm run dev
 *   npm run recette:vue-test
 */
import { createClient } from '@libsql/client';
import { randomClientSalt, hashClientVerifier } from '../lib/server/auth-core.ts';
import { deriveClientKey } from '../lib/client/derive.ts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3000';
const URL_BASE = process.env.TURSO_DATABASE_URL ?? 'file:dev-data/davar-dev.db';
if (!URL_BASE.startsWith('file:') || !URL_BASE.includes('dev-data/')) {
  console.error('REFUS : cette recette ne vise que la base locale de développement (dev-data/).');
  process.exit(2);
}
const COURRIEL = 'proprietaire.recette@davar.test';
const CODE = 'Recette-Davar-2026!';
const db = createClient({ url: URL_BASE });

try {
  const ping = await fetch(`${BASE}/connexion`, { redirect: 'manual' });
  if (ping.status !== 200) throw new Error(`HTTP ${ping.status}`);
} catch {
  console.error(`REFUS : aucun serveur ne répond sur ${BASE}. Lancez « npm run dev » d'abord.`);
  process.exit(2);
}

let echecs = 0;
function controler(nom, condition, detail = '') {
  console.log(`${condition ? '  OK  ' : 'ÉCHEC '} ${nom}${detail ? ` — ${detail}` : ''}`);
  if (!condition) echecs += 1;
}

async function cookiesReponse(reponse, pot) {
  const brut = reponse.headers.getSetCookie?.() ?? [];
  for (const ligne of brut) {
    const [paire] = ligne.split(';');
    const [cle, valeur] = paire.split('=');
    if (valeur === '') pot.delete(cle);
    else pot.set(cle, valeur);
  }
}

function enteteCookies(pot) {
  return [...pot.entries()].map(([cle, valeur]) => `${cle}=${valeur}`).join('; ');
}

async function appel(pot, chemin, options = {}) {
  const reponse = await fetch(`${BASE}${chemin}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      cookie: enteteCookies(pot),
      // Le serveur refuse toute requête d'origine inconnue : on se déclare.
      origin: BASE,
      'x-forwarded-host': new URL(BASE).host,
    },
    redirect: 'manual',
  });
  await cookiesReponse(reponse, pot);
  return reponse;
}

/* --------------------------------------------------- le propriétaire de recette */
const sel = randomClientSalt();
const cleDerivee = await deriveClientKey(CODE, { salt: sel, iterations: 600_000 });
const empreinte = await hashClientVerifier(cleDerivee);
const maintenant = Date.now();
await db.execute({
  sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test,kdf_scheme,client_salt,client_iterations)
        VALUES ('usr_recette','${COURRIEL}','M. Recette',?,?,'admin','active',?,0,'client-v1',?,600000)
        ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash`,
  args: [empreinte, maintenant, maintenant, sel],
});

try {
  const pot = new Map();

  const connexion = await appel(pot, '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: COURRIEL, verifier: cleDerivee }),
  });
  controler('connexion du propriétaire', connexion.status === 200, `HTTP ${connexion.status}`);

  const directionAvant = await appel(pot, '/direction');
  const htmlAvant = await directionAvant.text();
  controler('Espace Direction ouvert', directionAvant.status === 200);
  controler('la navigation complète est là', htmlAvant.includes('Réglages') && htmlAvant.includes('Vue test'));

  // Les deux écrans de la dictée vocale des avis : celui où le propriétaire
  // choisit le moteur, et celui où l'étudiant dicte.
  for (const [chemin, marqueur] of [
    ['/direction/assistant', 'Transcription fidèle des avis audio'],
    ['/campus/avis', 'Mes avis'],
  ]) {
    const page = await appel(pot, chemin);
    const html = await page.text();
    controler(`${chemin} s’ouvre`, page.status === 200 && html.includes(marqueur), `HTTP ${page.status}`);
  }
  const assistantHtml = await (await appel(pot, '/direction/assistant')).text();
  controler(
    'les deux moteurs de dictée sont proposés, Groq en premier',
    assistantHtml.includes('Whisper large-v3 via Groq (recommandé)') &&
      assistantHtml.indexOf('Whisper large-v3 via Groq') < assistantHtml.indexOf('Whisper dans le navigateur'),
    'l’ordre du prototype : Groq, puis le navigateur'
  );

  const creation = await appel(pot, '/api/direction/comptes-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'creer' }),
  });
  const creationJson = await creation.json();
  controler('les huit comptes de test sont préparés', creationJson.comptes?.length === 8, `${creationJson.message ?? ''}`);

  const directionAvecComptes = await appel(pot, '/direction');
  const htmlComptes = await directionAvecComptes.text();
  controler('« Tester une vue » est proposé dans la Direction', htmlComptes.includes('Tester une vue'));
  controler('les vues portent le nom du rôle', htmlComptes.includes('Vue Coach — Coach (test)'));

  const entree = await appel(pot, '/api/direction/view-as', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'entrer', id: 'u-test-coach' }),
  });
  controler('la vue test « Coach » s’ouvre', entree.status === 200 && (await entree.json()).vue?.nom === 'Coach (test)');

  const directionPendant = await appel(pot, '/direction');
  const htmlPendant = await directionPendant.text();
  controler('le bandeau de vue test est affiché', htmlPendant.includes('Vue test'));
  controler(
    'la navigation est celle du coach, pas celle du propriétaire',
    htmlPendant.includes('Conversations') && htmlPendant.includes('Devoirs') && !htmlPendant.includes('Réglages'),
    'Réglages doit disparaître de la navigation'
  );
  controler('la vue d’ensemble parle de l’équipe', htmlPendant.includes('Vue d’ensemble de l’équipe'));

  const reglagesPendant = await appel(pot, '/direction/reglages');
  controler(
    'le propriétaire GARDE ses droits pendant la visite',
    reglagesPendant.status === 200,
    `HTTP ${reglagesPendant.status}`
  );

  const postePendant = await appel(pot, '/api/direction/motivations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'etat' }),
  });
  controler('il peut même agir (motivations)', postePendant.status === 200, `HTTP ${postePendant.status}`);

  await appel(pot, '/api/direction/view-as', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'quitter' }),
  });
  const directionApres = await appel(pot, '/direction');
  const htmlApres = await directionApres.text();
  controler('« Quitter » rend la navigation complète', htmlApres.includes('Réglages'));

  // Les nouveaux écrans d'analyse : le propriétaire, puis l'analyste en vue test.
  const ECRANS_ANALYSE = [
    ['/direction/analytics', 'Analytics'],
    ['/direction/sante', 'Santé technique'],
    ['/direction/assistants', 'Analyse des assistants'],
    ['/direction/badges', 'Badges &amp; distinctions'],
    ['/direction/activite', 'Activité des étudiants'],
  ];
  for (const [chemin, marqueur] of [
    ['/direction/ventes', 'Ventes'],
    ['/direction/recompenses', 'Récompenses'],
    ['/direction/activites', 'Activités de l’équipe'],
  ]) {
    const page = await appel(pot, chemin);
    const html = await page.text();
    controler(`${chemin} s’ouvre`, page.status === 200 && html.includes(marqueur), `HTTP ${page.status}`);
  }
  const pageVentes = await appel(pot, '/direction/ventes');
  const htmlVentes = await pageVentes.text();
  controler(
    '/direction/ventes s’ouvre',
    pageVentes.status === 200 && htmlVentes.includes('Ventes'),
    `HTTP ${pageVentes.status}`
  );
  for (const [chemin, marqueur] of ECRANS_ANALYSE) {
    const page = await appel(pot, chemin);
    const html = await page.text();
    controler(`${chemin} s’ouvre`, page.status === 200 && html.includes(marqueur), `HTTP ${page.status}`);
  }

  const entreeAnalyste = await appel(pot, '/api/direction/view-as', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'entrer', id: 'u-test-analyste' }),
  });
  controler('la vue test « Analyste » s’ouvre', entreeAnalyste.status === 200);
  const directionAnalyste = await appel(pot, '/direction');
  const htmlAnalyste = await directionAnalyste.text();
  controler(
    'l’analyste voit ses écrans et rien d’autre',
    ECRANS_ANALYSE.every(([, marqueur]) => htmlAnalyste.includes(marqueur)) &&
      !htmlAnalyste.includes('Réglages') &&
      !htmlAnalyste.includes('Formations'),
    'ni Réglages ni Formations pour l’analyste'
  );
  const pageAnalyse = await appel(pot, '/direction/analytics');
  controler('l’analyste ouvre son écran d’analyse', pageAnalyse.status === 200, `HTTP ${pageAnalyse.status}`);
  // Les finances restent au propriétaire et au manager : l'analyste ne les voit
  // même pas dans sa navigation. (Le propriétaire, lui, garde ses droits pendant
  // la visite — c'est voulu : la vue test change l'affichage, pas les droits.)
  controler(
    'l’analyste ne voit ni Ventes ni Récompenses dans sa navigation',
    !htmlAnalyste.includes('href="/direction/ventes"') && !htmlAnalyste.includes('href="/direction/recompenses"'),
    'les finances et les distinctions à la main ne sont pas des écrans d’analyse'
  );
  await appel(pot, '/api/direction/view-as', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'quitter' }),
  });

  const retrait = await appel(pot, '/api/direction/comptes-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'retirer' }),
  });
  const retraitJson = await retrait.json();
  controler('les comptes de test se retirent', retraitJson.comptes?.length === 0, `${retraitJson.message ?? ''}`);
} finally {
  // Les clés étrangères SONT appliquées : on retire d'abord les lignes filles.
  // `staff_events` en fait partie depuis le journal de l'équipe : la recette
  // écrit de vraies actions, et le journal refuse un auteur qui n'existe plus.
  for (const table of ['sessions', 'notifications', 'user_prefs', 'social_subscriptions']) {
    await db.execute({ sql: `DELETE FROM ${table} WHERE user_id = 'usr_recette'` }).catch(() => {});
  }
  await db.execute({ sql: "DELETE FROM staff_events WHERE actor_id = 'usr_recette'" }).catch(() => {});
  await db.execute({ sql: "DELETE FROM users WHERE id = 'usr_recette'" });
  await db.close();
}

console.log(echecs === 0 ? '\nRECETTE : tout est vert.' : `\nRECETTE : ${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
