/**
 * Prend les captures du parcours, puis fabrique la galerie HTML.
 *
 * Le propriétaire consulte une page, pas un dossier : on enchaîne donc
 * toujours les deux. Un seul geste, un seul fichier à ouvrir.
 *
 * Usage : node scripts/captures.mjs
 * Prérequis : « npm run dev » qui tourne, et scripts/demo.mjs déjà passé.
 *
 * Si le navigateur a disparu (l'environnement est parfois vidé) :
 *   mkdir -p /tmp/shot /tmp/libs && cd /tmp/shot && npm init -y
 *   npm i puppeteer-core @sparticuz/chromium
 *   puis décompresser node_modules/@sparticuz/chromium/bin/ dans /tmp/libs
 *   (chromium.br + al2023.tar.br + fonts.tar.br + swiftshader.tar.br)
 */
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const CHROMIUM = '/tmp/libs/chromium';
const DOSSIER = '/home/user/captures-parcours';
const OUTILS = '/tmp/shot/';
const PUBLIC = '/home/user/davar-campus/davar-app/public';

/**
 * Les logos, dans l'ordre : les trois EN SERVICE (avec leur rôle), puis les
 * modèles proposés au choix. Le propriétaire ne savait pas où ils étaient
 * ni à quoi chacun servait : ils rejoignent donc la galerie, étiquetés.
 */
const LOGOS = [
  ['campus-icon.svg', 'L1-favicon.svg'],
  ['campus-splash.svg', 'L2-animation-ouverture.svg'],
  ['logo-structure.svg', 'L3-structure.svg'],
  ['campus-marque.svg', 'L4-marque-pages-auth.svg'],
  ['logos-propositions/1-la-tribune.svg', 'L5-modele-la-tribune.svg'],
  ['logos-propositions/2-la-signature.svg', 'L6-modele-la-signature.svg'],
  ['logos-propositions/3-l-ecusson.svg', 'L7-modele-l-ecusson.svg'],
  ['logos-propositions/4-le-sceau.svg', 'L8-modele-le-sceau.svg'],
];

// puppeteer-core vit hors du projet, dans un dossier d'outils jetable :
// on ne veut surtout pas l'ajouter aux dépendances de la plateforme.
if (!existsSync(CHROMIUM) || !existsSync(OUTILS + 'node_modules/puppeteer-core')) {
  console.error('Outils de capture absents : ' + CHROMIUM);
  console.error('Voir les prérequis en tête de scripts/captures.mjs');
  process.exit(1);
}
const puppeteer = createRequire(OUTILS)('puppeteer-core');

const jetons = JSON.parse(readFileSync('/tmp/shot/jetons.json', 'utf8'));
mkdirSync(DOSSIER, { recursive: true });

const MODULE = 'http://localhost:3000/campus/formation/t-orateur?chapitre=chap-demo-1&module=mod-demo-1-1';
const ACCUEIL = 'http://localhost:3000/campus';

const n = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  executablePath: CHROMIUM,
  headless: 'shell',
});

async function photo(url, nom, largeur, hauteur, tactile, action) {
  const page = await n.newPage();
  await page.setViewport({
    width: largeur,
    height: hauteur,
    deviceScaleFactor: 1,
    hasTouch: !!tactile,
    isMobile: !!tactile,
  });
  await page.setCookie({
    name: 'davar_session',
    value: jetons['visite@davar.test'],
    domain: 'localhost',
    path: '/',
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1600));
  if (action) {
    await action(page);
    await new Promise((r) => setTimeout(r, 1700));
  }
  await page.screenshot({ path: `${DOSSIER}/${nom}.png` });
  console.log('  capture : ' + nom);
  await page.close();
}

const ouvrirPdf = (p) =>
  p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Ouvrir');
    b?.click();
  });

const complementaire = (p) =>
  p.evaluate(() => {
    const c = [...document.querySelectorAll('.vid-card')].find((x) => (x.textContent || '').includes('Complément'));
    c?.click();
  });

console.log('Captures du parcours :');
await photo(MODULE, '1-module-telephone', 390, 844, true);
await photo(MODULE, '2-module-tablette', 820, 1180, true);
await photo(MODULE, '3-module-ordinateur', 1440, 900, false);
await photo(MODULE, '4-video-complementaire', 390, 844, true, complementaire);
await photo(MODULE, '5-visionneuse-telephone', 390, 844, true, ouvrirPdf);
await photo(MODULE, '6-visionneuse-tablette', 820, 1180, true, ouvrirPdf);
await photo(MODULE, '7-visionneuse-ordinateur', 1440, 900, false, ouvrirPdf);
await photo(ACCUEIL, '8-accueil-ordinateur', 1440, 900, false);
await photo(ACCUEIL, '9-accueil-telephone', 390, 844, true);

// L'animation d'ouverture ne dure que quatre secondes : on la saisit au vol,
// avant qu'elle ne s'efface.
async function photoAuVol(url, nom, largeur, hauteur, tactile, delai) {
  const page = await n.newPage();
  await page.setViewport({ width: largeur, height: hauteur, hasTouch: tactile, isMobile: tactile });
  await page.setCookie({ name: 'davar_session', value: jetons['visite@davar.test'], domain: 'localhost', path: '/' });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, delai));
  await page.screenshot({ path: `${DOSSIER}/${nom}.png` });
  console.log('  capture : ' + nom);
  await page.close();
}

// Les pages d'authentification : le logo sans son cercle, le slogan en blanc.
await photoAuVol('http://localhost:3000/connexion', 'A-animation-ouverture', 390, 844, true, 1800);
await photo('http://localhost:3000/connexion', 'B-connexion-telephone', 390, 844, true);
await photo('http://localhost:3000/inscription', 'C-inscription-ordinateur', 1440, 900, false);
await n.close();

console.log('\nLogos :');
for (const [source, destination] of LOGOS) {
  const chemin = `${PUBLIC}/${source}`;
  if (!existsSync(chemin)) {
    console.log('  manque : ' + source);
    continue;
  }
  copyFileSync(chemin, `${DOSSIER}/${destination}`);
  console.log('  ' + source + ' -> ' + destination);
}

console.log('\nGalerie :');
console.log(
  execFileSync('node', ['scripts/galerie-captures.mjs'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((l) => '  ' + l)
    .join('\n'),
);
