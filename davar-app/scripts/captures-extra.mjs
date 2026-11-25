import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/shot/package.json');
const puppeteer = require('puppeteer-core');
const tokens = JSON.parse(readFileSync('/tmp/shot/jetons.json', 'utf8'));
const out = '/home/user/davar-campus/captures/final';
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/tmp/chromium',
  headless: 'shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function settle(page) {
  await new Promise((resolve) => setTimeout(resolve, 4300));
  await page.waitForFunction(() => !document.querySelector('.splash-shell'), { timeout: 10000 }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function capture({ name, url, token, width, height, light = false, click = null, animation = false }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width <= 900, hasTouch: width <= 900 });
  await page.setCookie({ name: 'davar_session', value: token, domain: 'localhost', path: '/' });
  await page.goto(url, { waitUntil: animation ? 'domcontentloaded' : 'networkidle2', timeout: 60000 });
  if (animation) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
  } else {
    await settle(page);
  }
  // Chaque vue fixe son thème au lieu de réutiliser le localStorage de la
  // capture précédente : K/O/P restent réellement sombres, E/H/J/L/M/N
  // fournissent les comparaisons claires demandées.
  await page.evaluate((theme) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('davar_theme', theme);
  }, light ? 'light' : 'dark');
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (click) {
    await page.click(click);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log(name);
  await page.close();
}

const student = tokens['visite@davar.test'];
const staff = tokens['staff@davar.test'];

await capture({ name: 'D-profil-informations-ordinateur', url: 'http://localhost:3000/campus/profil', token: student, width: 1440, height: 900 });
await capture({ name: 'E-profil-informations-tablette', url: 'http://localhost:3000/campus/profil', token: student, width: 820, height: 1180, light: true });
await capture({ name: 'F-profil-informations-telephone', url: 'http://localhost:3000/campus/profil', token: student, width: 390, height: 844 });

await capture({ name: 'G-menu-apprenant-ordinateur', url: 'http://localhost:3000/campus', token: student, width: 1440, height: 900, click: '.rail button[title="Menu"]' });
await capture({ name: 'H-menu-apprenant-tablette', url: 'http://localhost:3000/campus', token: student, width: 820, height: 1180, light: true, click: '.rail button[title="Menu"]' });
await capture({ name: 'I-menu-apprenant-telephone', url: 'http://localhost:3000/campus', token: student, width: 390, height: 844, click: '.cp-top button[title="Menu"]' });
await capture({ name: 'J-menu-apprenant-paysage', url: 'http://localhost:3000/campus', token: student, width: 844, height: 390, light: true, click: '.cp-top button[title="Menu"]' });

await capture({ name: 'K-staff-ordinateur-sombre', url: 'http://localhost:3000/direction', token: staff, width: 1440, height: 900 });
await capture({ name: 'L-staff-ordinateur-clair', url: 'http://localhost:3000/direction', token: staff, width: 1440, height: 900, light: true });
await capture({ name: 'M-staff-tablette-clair', url: 'http://localhost:3000/direction', token: staff, width: 820, height: 1180, light: true });
await capture({ name: 'N-staff-telephone-portrait', url: 'http://localhost:3000/direction', token: staff, width: 390, height: 844, light: true });
await capture({ name: 'O-staff-telephone-paysage', url: 'http://localhost:3000/direction', token: staff, width: 844, height: 390 });

await capture({ name: 'P-animation-campus', url: 'http://localhost:3000/campus', token: student, width: 390, height: 844, animation: true });
await browser.close();
