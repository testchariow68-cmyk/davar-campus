/**
 * Test de cohérence du déploiement : toute variable d'environnement LUE par le
 * code doit être DÉCLARÉE comme liaison dans `cloudflare.config.ts`.
 *
 * Pourquoi ce test existe : sur Cloudflare Workers, `process.env.X` ne contient
 * que les liaisons déclarées dans la configuration. Un secret saisi dans le
 * tableau de bord mais non déclaré est INERTE — silencieusement. Deux oublis
 * réels ont été trouvés ainsi (le jeton de diagnostic, puis l'origine publique
 * et les identifiants du Pulse Chariow), chacun capable de casser une fonction
 * en production sans message clair.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** Variables lues sans être déclarées : chacune doit avoir une raison écrite. */
const ACCEPTED_WITHOUT_BINDING = {
  NODE_ENV: 'fourni par le runtime, jamais par la configuration',
  APP_ENV: 'déclaré dans cloudflare.config.ts (vérifié plus bas) mais aussi lu hors Worker',
  AUTH_PBKDF2_ITERATIONS: 'réglage hérité du hachage serveur, borné par défaut dans le code',
  QUOTA_FLUSH_EVERY: 'réglage de fréquence des compteurs, défaut sûr dans le code',
  AUTH_KDF_URL: 'mode « remote » hérité, inutilisé depuis la dérivation côté client',
  AUTH_KDF_TOKEN: 'mode « remote » hérité, inutilisé depuis la dérivation côté client',
  AUTH_KDF_ALLOWED_ORIGINS: 'mode « remote » hérité, inutilisé depuis la dérivation côté client',
  AUTH_ALLOW_LOCAL_KDF: 'drapeau de secours pour outils internes, jamais en production',
  AUTH_ALLOW_LOW_KDF: 'drapeau de secours pour outils internes, jamais en production',
  AUTH_ALLOW_NO_PEPPER: 'drapeau de secours pour outils internes, jamais en production',
  SUPABASE_URL: 'chemin Supabase archivé, retiré du chemin actif',
  SUPABASE_SERVICE_ROLE_KEY: 'chemin Supabase archivé, retiré du chemin actif',
  NEXT_PUBLIC_SUPABASE_URL: 'chemin Supabase archivé, retiré du chemin actif',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'chemin Supabase archivé, retiré du chemin actif',
  CINETPAY_API_KEY: 'CinetPay banni par le propriétaire, code inerte',
  CINETPAY_SITE_ID: 'CinetPay banni par le propriétaire, code inerte',
  CINETPAY_BASE_URL: 'CinetPay banni par le propriétaire, code inerte',
};

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(join(ROOT, directory))) {
    const path = join(ROOT, directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(join(directory, entry)));
    else if (/\.(ts|tsx|mjs)$/.test(entry)) found.push(path);
  }
  return found;
}

test('chaque variable lue par le code est déclarée comme liaison du Worker', () => {
  const used = new Set();
  for (const directory of ['lib', 'app'])
    for (const file of sourceFiles(directory))
      for (const match of readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g))
        used.add(match[1]);
  for (const match of readFileSync(join(ROOT, 'proxy.ts'), 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g))
    used.add(match[1]);

  const config = readFileSync(join(ROOT, 'cloudflare.config.ts'), 'utf8');
  const declared = new Set(
    [...config.matchAll(/^\s+([A-Z0-9_]+):\s*bindings\./gm)].map((match) => match[1])
  );

  const undeclared = [...used]
    .filter((name) => !declared.has(name) && !(name in ACCEPTED_WITHOUT_BINDING))
    .sort();
  assert.deepEqual(
    undeclared,
    [],
    `Ces variables sont lues par le code mais ne sont pas déclarées dans cloudflare.config.ts : ${undeclared.join(', ')}. ` +
      'Sur Workers elles seraient vides en silence : déclarez-les, ou ajoutez-les à la liste justifiée du test.'
  );
});

test('les liaisons indispensables au service réel sont déclarées', () => {
  const config = readFileSync(join(ROOT, 'cloudflare.config.ts'), 'utf8');
  const declared = new Set([...config.matchAll(/^\s+([A-Z0-9_]+):\s*bindings\./gm)].map((m) => m[1]));
  // Sans APP_PUBLIC_ORIGIN, l'inscription échoue en production (liens d'e-mail).
  // Sans les identifiants Chariow, le webhook ne peut jamais authentifier une vente.
  for (const required of ['APP_PUBLIC_ORIGIN', 'CHARIOW_PULSE_ID', 'CHARIOW_STORE_ID', 'APP_DIAGNOSTIC_TOKEN'])
    assert.ok(declared.has(required), `${required} doit être déclarée dans cloudflare.config.ts`);
});

test('la production ne peut pas viser la base de recette', () => {
  const config = readFileSync(join(ROOT, 'cloudflare.config.ts'), 'utf8');
  assert.match(config, /ressemble à du staging/, 'le refus d’un hôte staging en production doit rester présent');
  assert.match(config, /DAVAR_PUBLIC_ORIGIN requise pour la production/, 'l’origine publique doit rester obligatoire en production');
  assert.match(config, /davar-campus-production-2026/, 'le Worker de production doit être distinct de la recette');
});
