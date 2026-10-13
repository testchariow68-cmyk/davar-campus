/**
 * BANDEAU DU BAS — annonces et réseaux sociaux, verrouillés.
 * Exécution : npm test — base libSQL temporaire, aucun réseau.
 *
 * Ce qui est protégé ici :
 *   - une plateforme sans lien https réel n'existe pas (pas de faux bouton) ;
 *   - une plateforme confirmée quitte le bandeau, et repasser ne change pas la date ;
 *   - une plateforme inventée est refusée ;
 *   - l'audience de l'annonce est respectée (tout le monde / étudiants / équipe) ;
 *   - le propriétaire voit qui s'est abonné, à quoi, quand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  PLATEFORMES,
  abonnements,
  annonceDepuisReglages,
  annonceViseLUtilisateur,
  confirmerAbonnement,
  plateformes,
  plateformesNonSuivies,
  totalParPlateforme,
} from '../lib/server/social.ts';

process.env.APP_ENV = 'development';

const MAINTENANT = 1_760_000_000_000;

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-social-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms)
          VALUES ('usr_1','etudiant@davar.test','Awa','peu-importe',?,'student','active',?)`,
    args: [MAINTENANT, MAINTENANT],
  });
  return db;
}

async function regler(db, cle, valeur) {
  await db.execute({
    sql: `INSERT INTO app_settings(key,value,updated_at_ms) VALUES (?,?,?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [cle, valeur, MAINTENANT],
  });
}

test('les trois plateformes du propriétaire, avec les noms du prototype', async () => {
  const db = await baseVide();
  assert.deepEqual(
    PLATEFORMES.map((entree) => entree.nom),
    ['Instagram', 'TikTok', 'Facebook']
  );

  // Valeurs par défaut : les siennes, celles du prototype.
  const toutes = await plateformes(db);
  assert.deepEqual(toutes.map((entree) => entree.nom), ['Instagram', 'TikTok', 'Facebook']);
  assert.equal(await plateformesNonSuivies(db, 'usr_1').then((liste) => liste.length), 3);

  // Un lien douteux retire la plateforme : aucun bouton ne mène nulle part.
  await regler(db, 'social.tiktok', 'http://tiktok.com/@davar');
  const apres = await plateformes(db);
  assert.deepEqual(apres.map((entree) => entree.nom), ['Instagram', 'Facebook']);

  // Une valeur VIDE retombe sur sa valeur par défaut (l'application n'affiche
  // jamais un trou) ; c'est donc un lien non https qui retire vraiment la plateforme.
  await regler(db, 'social.instagram', '');
  assert.deepEqual((await plateformes(db)).map((entree) => entree.nom), ['Instagram', 'Facebook']);
  await regler(db, 'social.instagram', 'http://instagram.com/davaracademie');
  assert.deepEqual((await plateformes(db)).map((entree) => entree.nom), ['Facebook']);
  await db.close();
});

test('une plateforme confirmée quitte le bandeau, et la date ne bouge plus', async () => {
  const db = await baseVide();
  assert.equal(await confirmerAbonnement(db, 'usr_1', 'instagram', MAINTENANT), true);
  assert.equal(await confirmerAbonnement(db, 'usr_1', 'instagram', MAINTENANT + 9999), true, 'repasser ne casse rien');

  const restantes = await plateformesNonSuivies(db, 'usr_1');
  assert.deepEqual(restantes.map((entree) => entree.id), ['tiktok', 'facebook']);

  const ligne = await db.execute('SELECT confirmed_at_ms, link FROM social_subscriptions WHERE user_id = ?', ['usr_1']);
  assert.equal(Number(ligne.rows[0].confirmed_at_ms), MAINTENANT, 'la première confirmation est la bonne');
  assert.equal(String(ligne.rows[0].link), 'https://instagram.com/davaracademie', 'le lien proposé est conservé');

  assert.equal(await confirmerAbonnement(db, 'usr_1', 'myspace', MAINTENANT), false, 'une plateforme inventée est refusée');

  const vus = await abonnements(db, 10);
  assert.equal(vus.length, 1);
  assert.equal(vus[0].etudiant, 'Awa');
  assert.equal(vus[0].plateforme, 'instagram');
  const totaux = await totalParPlateforme(db);
  assert.deepEqual(totaux, [{ plateforme: 'instagram', total: 1 }]);
  await db.close();
});

test('l’annonce respecte son audience — tout le monde, les étudiants, ou l’équipe', async () => {
  const db = await baseVide();
  assert.equal(annonceDepuisReglages({}), null, 'sans texte : aucune annonce');

  const reglages = {
    'announce.text': 'Nouveau module disponible',
    'announce.active': '1',
    'announce.audience': 'students',
  };
  const annonce = annonceDepuisReglages(reglages);
  assert.deepEqual(annonce, { texte: 'Nouveau module disponible', audience: 'students' });
  assert.equal(annonceViseLUtilisateur(annonce, 'student'), true);
  assert.equal(annonceViseLUtilisateur(annonce, 'staff'), false);
  assert.equal(annonceViseLUtilisateur(annonce, 'admin'), false);

  const pourTous = annonceDepuisReglages({ ...reglages, 'announce.audience': 'inconnu' });
  assert.equal(pourTous.audience, 'all', 'une audience inconnue ne cache pas l’annonce');
  assert.equal(annonceViseLUtilisateur(pourTous, 'admin'), true);

  const eteinte = annonceDepuisReglages({ ...reglages, 'announce.active': '0' });
  assert.equal(eteinte, null, 'une annonce éteinte n’apparaît pas, même si son texte reste enregistré');
  assert.equal(annonceViseLUtilisateur(null, 'student'), false);
  await db.close();
});
