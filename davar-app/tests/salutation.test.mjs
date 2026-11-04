/**
 * SALUTATION — l'accueil du campus dit bonjour à l'heure qu'il est.
 * Exécution : npm test — aucune base hébergée, aucun réseau.
 *
 * Ce qui est protégé ici, mot pour mot comme le prototype (`cpGreet`) :
 *   - avant 5 h du matin : « Bonne nuit » ;
 *   - de 5 h à midi : « Bonjour » ;
 *   - de midi à 18 h : « Bon après-midi » ;
 *   - le soir : « Bonsoir ».
 * Le campus disait « Bonjour » à 3 h du matin : c'était l'écart, il est fermé.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { salutation } from '../lib/server/campus-recents.ts';

/** Une heure locale précise, exprimée en millisecondes. */
function a(heure, minute = 0) {
  const date = new Date(2026, 10, 3, heure, minute, 0, 0);
  return date.getTime();
}

test('la salutation suit l\'heure, comme le prototype', () => {
  assert.equal(salutation(a(0, 0)), 'Bonne nuit');
  assert.equal(salutation(a(3, 30)), 'Bonne nuit');
  assert.equal(salutation(a(4, 59)), 'Bonne nuit');
  assert.equal(salutation(a(5, 0)), 'Bonjour');
  assert.equal(salutation(a(11, 59)), 'Bonjour');
  assert.equal(salutation(a(12, 0)), 'Bon après-midi');
  assert.equal(salutation(a(17, 59)), 'Bon après-midi');
  assert.equal(salutation(a(18, 0)), 'Bonsoir');
  assert.equal(salutation(a(23, 59)), 'Bonsoir');
});

test('la salutation ne comporte que les quatre formules du prototype', () => {
  const dites = new Set();
  for (let heure = 0; heure < 24; heure += 1) dites.add(salutation(a(heure)));
  assert.deepEqual([...dites].sort(), ['Bon après-midi', 'Bonjour', 'Bonne nuit', 'Bonsoir']);
});
