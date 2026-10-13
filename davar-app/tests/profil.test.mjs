/**
 * PROFIL & PARAMÈTRES — ce que la personne règle pour elle-même, verrouillé.
 * Exécution : npm test — base libSQL temporaire, aucun réseau.
 *
 * Protégé ici :
 *   - le nom des certificats : 2 à 21 caractères, espaces resserrés ;
 *   - l'interrupteur des notifications : coupé, plus rien ne passe — SAUF la sécurité ;
 *   - le code secret : l'ancien est exigé, et les autres appareils sont déconnectés ;
 *   - la photo : une clé de stockage, jamais une adresse publique.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { hashClientVerifier, verifyClientVerifier } from '../lib/server/auth-core.ts';
import { notifier, listerNotifications } from '../lib/server/notifications.ts';
import {
  analyserPreference,
  changerCodeSecret,
  definirPhoto,
  enregistrerNom,
  lirePreferences,
  lireProfil,
} from '../lib/server/profil.ts';

process.env.APP_ENV = 'development';
const MAINTENANT = 1_760_000_000_000;
const CLE_A = 'A'.repeat(43);
const CLE_B = 'B'.repeat(43);

async function baseAvecEtudiant() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-profil-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,kdf_scheme,status,created_at_ms)
          VALUES ('usr_1','etudiant@davar.test','Nom Initial','ancien-hash',?,'student','client-v1','active',?)`,
    args: [MAINTENANT, MAINTENANT],
  });
  return db;
}

test('le nom est celui des certificats : 2 à 21 caractères, rien de plus', async () => {
  const db = await baseAvecEtudiant();
  assert.equal((await enregistrerNom(db, 'usr_1', 'A')).ok, false);
  assert.equal((await enregistrerNom(db, 'usr_1', 'A'.repeat(22))).ok, false);
  assert.equal((await enregistrerNom(db, 'usr_1', '   ')).ok, false);

  const bon = await enregistrerNom(db, 'usr_1', '  Yao   Kouassi  ');
  assert.equal(bon.ok, true);
  assert.equal(bon.nom, 'Yao Kouassi', 'les espaces en trop sont resserrés');
  assert.equal((await enregistrerNom(db, 'usr_1', 'A'.repeat(21))).ok, true, '21 caractères passent');
  assert.equal((await enregistrerNom(db, 'usr_1', 'B'.repeat(21))).ok, true, 'seul le nom change');

  const profil = await lireProfil(db, 'usr_1');
  assert.equal(profil.nom, 'B'.repeat(21));
  assert.equal(profil.email, 'etudiant@davar.test');
  assert.equal(profil.preferences.notifications, true, 'par défaut, les notifications sont activées');
  assert.equal(profil.preferences.echelle, 1);
  await db.close();
});

test('les préférences sont contrôlées : rien d’inventé n’entre en base', async () => {
  const db = await baseAvecEtudiant();
  assert.equal(analyserPreference('inconnu', '1').ok, false);
  assert.equal(analyserPreference('photo.cle', 'photos/x.jpg').ok, false, 'la photo ne s’écrit que par le dépôt');
  assert.equal(analyserPreference('affichage.echelle', '3').ok, false, 'une échelle hors liste est refusée');
  assert.deepEqual(analyserPreference('affichage.echelle', '1.25'), { ok: true, cle: 'affichage.echelle', valeur: '1.25' });

  await definirPhoto(db, 'usr_1', 'photos/usr_1/portrait.jpg', MAINTENANT);
  let preferences = await lirePreferences(db, 'usr_1');
  assert.equal(preferences.photoCle, 'photos/usr_1/portrait.jpg');
  await definirPhoto(db, 'usr_1', null, MAINTENANT);
  preferences = await lirePreferences(db, 'usr_1');
  assert.equal(preferences.photoCle, null, 'retirer la photo ne laisse aucun résidu');
  await db.close();
});

test('notifications coupées : plus rien ne passe, sauf la sécurité', async () => {
  const db = await baseAvecEtudiant();
  await db.execute({
    sql: `INSERT INTO user_prefs(user_id,pref_key,pref_value,updated_at_ms) VALUES ('usr_1','notifications.actives','0',?)`,
    args: [MAINTENANT],
  });

  await notifier(db, { userId: 'usr_1', kind: 'encouragement', titre: 'Motivation du dimanche' }, MAINTENANT);
  assert.equal((await listerNotifications(db, 'usr_1', MAINTENANT)).length, 0, 'la cloche reste muette');

  await notifier(db, { userId: 'usr_1', kind: 'security', titre: 'Ce n’était pas moi ?' }, MAINTENANT);
  const liste = await listerNotifications(db, 'usr_1', MAINTENANT);
  assert.equal(liste.length, 1, 'la sécurité prévient toujours');
  assert.equal(liste[0].kind, 'security');
  await db.close();
});

test('changer le code secret exige l’ancien, et déconnecte les autres appareils', async () => {
  const db = await baseAvecEtudiant();
  const ancien = await hashClientVerifier(CLE_A);
  await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [ancien, 'usr_1'] });
  for (const jeton of ['jeton_courant', 'jeton_autre']) {
    await db.execute({
      sql: 'INSERT INTO sessions(token_hash,user_id,created_at_ms,expires_at_ms) VALUES (?,?,?,?)',
      args: [jeton, 'usr_1', MAINTENANT, MAINTENANT + 86_400_000],
    });
  }

  const mauvais = await changerCodeSecret(db, {
    userId: 'usr_1',
    tokenActuel: 'jeton_courant',
    ancienVerifier: CLE_B,
    nouveauVerifier: CLE_A,
    maintenant: MAINTENANT,
  });
  assert.equal(mauvais.ok, false);
  assert.equal(mauvais.erreur, 'code_actuel_incorrect');
  const inchange = await db.execute("SELECT password_hash FROM users WHERE id = 'usr_1'");
  assert.equal(String(inchange.rows[0].password_hash), ancien, 'un refus ne touche à rien');

  const bon = await changerCodeSecret(db, {
    userId: 'usr_1',
    tokenActuel: 'jeton_courant',
    ancienVerifier: CLE_A,
    nouveauVerifier: CLE_B,
    maintenant: MAINTENANT,
  });
  assert.equal(bon.ok, true);

  const nouveauHash = String((await db.execute("SELECT password_hash FROM users WHERE id = 'usr_1'")).rows[0].password_hash);
  assert.equal((await verifyClientVerifier(CLE_B, nouveauHash)).ok, true, 'le nouveau code ouvre la porte');
  assert.equal((await verifyClientVerifier(CLE_A, nouveauHash)).ok, false, 'l’ancien ne l’ouvre plus');

  const sessions = await db.execute('SELECT token_hash FROM sessions ORDER BY token_hash');
  assert.deepEqual(sessions.rows.map((ligne) => String(ligne.token_hash)), ['jeton_courant'], 'l’appareil courant reste connecté');
  await db.close();
});
