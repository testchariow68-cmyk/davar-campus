/**
 * APPARENCE — la palette du propriétaire, verrouillée.
 * Exécution : npm test — aucune base hébergée, aucun réseau.
 *
 * Ce qui est protégé ici :
 *   - la signature DAVAR (violet & or) reste le défaut : rien ne change tout seul ;
 *   - un identifiant de palette inconnu est REFUSÉ, jamais appliqué en silence ;
 *   - les quatre palettes des documents existent, et le CSS les porte réellement ;
 *   - une palette composée produit exactement les variables du prototype ;
 *   - un réglage illisible retombe sur la signature, sans casser la page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  COULEURS_DEFAUT,
  PALETTES,
  PALETTES_PRINCIPALES,
  PALETTE_DEFAUT,
  assombrir,
  couleursPersonnalisees,
  luminance,
  melanger,
  paletteValide,
  variablesPersonnalisees,
} from '../lib/palette.ts';
import { APPARENCE_DEFAUT, apparenceChoisie, apparenceDepuisReglage } from '../lib/server/apparence.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-apparence-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

test('la signature DAVAR est le défaut : rien ne change sans le propriétaire', () => {
  assert.equal(PALETTE_DEFAUT, 'violet');
  assert.equal(PALETTES.violet.label, 'Violet & Or (signature DAVAR)');
  assert.deepEqual(couleursPersonnalisees(null), COULEURS_DEFAUT);
  assert.equal(APPARENCE_DEFAUT.palette, 'violet');
});

test('les quatre palettes des documents existent, et le CSS les porte', () => {
  assert.deepEqual(PALETTES_PRINCIPALES, ['violet', 'indigo', 'foret', 'bordeaux']);
  for (const id of PALETTES_PRINCIPALES) assert.ok(PALETTES[id], `palette manquante : ${id}`);

  const css = readFileSync(new URL('../app/prototype.css', import.meta.url), 'utf8');
  for (const id of ['indigo', 'foret', 'bordeaux']) {
    assert.ok(css.includes(`[data-palette="${id}"]{`), `le CSS ne définit pas la palette ${id}`);
    assert.ok(
      css.includes(`[data-theme="dark"][data-palette="${id}"]`),
      `le CSS ne définit pas la variante sombre de ${id}`
    );
  }
  // La palette composée doit être reconnue par le CSS, sinon l'aperçu serait un mensonge.
  assert.ok(css.includes('[data-theme="dark"][data-palette="custom"]'), 'le CSS ne reconnaît pas la palette composée');
});

test('un identifiant de palette inconnu est refusé', () => {
  assert.equal(paletteValide('indigo'), true);
  assert.equal(paletteValide('custom'), true);
  assert.equal(paletteValide('rose-fluo'), false);
  assert.equal(paletteValide(''), false);
  assert.equal(paletteValide(42), false);

  assert.equal(apparenceDepuisReglage({ 'apparence.palette': 'rose-fluo' }), null);
  assert.equal(apparenceDepuisReglage({ 'support.phone': '+225' }), null);
  const valide = apparenceDepuisReglage({ 'apparence.palette': 'foret', 'apparence.couleurs': '{"p":"#123456"}' });
  assert.equal(valide.palette, 'foret');
  assert.equal(valide.couleurs.p, '#123456', 'les couleurs composées survivent au réglage');
  assert.equal(valide.couleurs.s, COULEURS_DEFAUT.s, 'une couleur manquante retombe sur le défaut');
});

test('une palette composée produit exactement les variables du prototype', () => {
  assert.equal(melanger('#000000', '#FFFFFF', 50), '#808080');
  assert.equal(assombrir('#808080', -50), '#404040');
  assert.equal(luminance('#FFFFFF'), 1);
  assert.equal(luminance('#000000'), 0);

  const clair = variablesPersonnalisees({ p: '#6D28D9', s: '#8B5CF6', a: '#C9A24B', grad: false }, false);
  assert.equal(clair['--violet'], '#6D28D9');
  assert.equal(clair['--violet2'], '#8B5CF6');
  assert.equal(clair['--violet-deep'], assombrir('#6D28D9', -25));
  assert.equal(clair['--grad-dark'], 'linear-gradient(160deg,#0A0A0C 0%,#131316 60%,#1B1B21 100%)');
  assert.match(clair['--grad'], /^linear-gradient\(135deg, #[0-9a-f]{6} 0%, #6D28D9 55%, #8B5CF6 100%\)$/);

  const sombre = variablesPersonnalisees({ p: '#6D28D9', s: '#8B5CF6', a: '#C9A24B', grad: true }, true);
  assert.notEqual(sombre['--violet-soft'], clair['--violet-soft'], 'le mode sombre assombrit les surfaces');
  assert.match(sombre['--grad-dark'], /^linear-gradient\(160deg, /);
});

test('la palette choisie est lue en base — et une base muette retombe sur la signature', async () => {
  const db = await baseVide();
  assert.deepEqual(await apparenceChoisie(db), APPARENCE_DEFAUT, 'sans réglage : violet & or');

  await db.execute({
    sql: `INSERT INTO app_settings(key,value,updated_at_ms) VALUES (?,?,?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: ['apparence.palette', 'bordeaux', Date.now()],
  });
  await db.execute({
    sql: `INSERT INTO app_settings(key,value,updated_at_ms) VALUES (?,?,?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: ['apparence.couleurs', JSON.stringify({ p: '#123456', s: '#654321', a: '#ABCDEF', grad: true }), Date.now()],
  });
  const choisie = await apparenceChoisie(db);
  assert.equal(choisie.palette, 'bordeaux');
  assert.deepEqual(choisie.couleurs, { p: '#123456', s: '#654321', a: '#ABCDEF', grad: true });

  // Un réglage corrompu ne doit jamais casser l'affichage.
  await db.execute({
    sql: `INSERT INTO app_settings(key,value,updated_at_ms) VALUES (?,?,?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: ['apparence.palette', '<<corrompu>>', Date.now()],
  });
  const secours = await apparenceChoisie(db);
  assert.equal(secours.palette, 'violet');
  await db.close();
});
