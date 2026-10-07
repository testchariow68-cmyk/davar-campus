/**
 * BADGES & DISTINCTIONS ET ACTIVITÉ DES ÉTUDIANTS — les deux derniers écrans
 * d'analyse du prototype.
 *
 * Protégé ici :
 *   - les comptes de test n'entrent dans AUCUN chiffre (ni badges, ni activité) ;
 *   - le mode d'attribution est dit tel quel, avec le nom de qui l'a donnée à la main ;
 *   - « dernière activité » est la plus récente de TOUTES les traces, pas seulement
 *     la connexion — un étudiant qui travaille sans se reconnecter reste visible ;
 *   - le catalogue dit ce que personne n'a encore reçu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { jourDe } from '../lib/server/assistant.ts';
import { analyseActivite, analyseBadges } from '../lib/server/analytique.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-analytique-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

async function utilisateur(db, id, nom, role = 'student', estTest = 0) {
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES (?,?,?,'peu-importe',?,?,'active',?,?)`,
    args: [id, `${id}@davar.test`, nom, Date.now(), role, Date.now(), estTest],
  });
}

const MAINTENANT = 1_760_000_000_000;
const JOUR_MS = 24 * 60 * 60 * 1000;

test('les badges attribués se lisent au nom près, mode compris', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await utilisateur(db, 'usr_2', 'Étudiant De Test', 'student', 1);
  await utilisateur(db, 'staff_1', 'Coach Réel', 'staff');
  await db.execute({
    sql: `INSERT INTO badge_defs(id,name,cat,icon,position,auto_rule) VALUES
          ('BADGE_PREMIER_PAS','Premier Pas','parcours','rw_door',1,'premiere_connexion'),
          ('BADGE_ORATEUR','Orateur','parcours','rw_mic',2,'certificat')`,
  });
  // Un badge automatique il y a 2 jours, un badge donné à la main aujourd'hui.
  await db.execute({
    sql: `INSERT INTO badge_awards(id,user_id,badge_id,source,at_ms) VALUES ('awd_1','usr_1','BADGE_PREMIER_PAS','auto',?)`,
    args: [MAINTENANT - 2 * JOUR_MS],
  });
  await db.execute({
    sql: `INSERT INTO badge_awards(id,user_id,badge_id,source,awarded_by,at_ms) VALUES ('awd_2','usr_1','BADGE_ORATEUR','manuel','staff_1',?)`,
    args: [MAINTENANT - 60_000],
  });
  // Un badge attribué à un COMPTE DE TEST : il ne doit apparaître nulle part.
  await db.execute({
    sql: `INSERT INTO badge_awards(id,user_id,badge_id,source,at_ms) VALUES ('awd_3','usr_2','BADGE_PREMIER_PAS','auto',?)`,
    args: [MAINTENANT],
  });

  const analyse = await analyseBadges(db, MAINTENANT);
  assert.equal(analyse.total, 2, 'les attributions des comptes de test sont écartées');
  assert.equal(analyse.trenteJours, 2);
  assert.deepEqual(
    analyse.lignes.map((ligne) => ligne.id),
    ['awd_2', 'awd_1'],
    'la plus récente en tête'
  );
  assert.equal(analyse.lignes[0].etudiant, 'Awa Traoré');
  assert.equal(analyse.lignes[0].badge, 'Orateur');
  assert.equal(analyse.lignes[0].source, 'manuel');
  assert.equal(analyse.lignes[0].attribuePar, 'Coach Réel', 'on dit qui l’a attribué à la main');
  assert.equal(analyse.lignes[1].attribuePar, null);
  assert.equal(analyse.catalogue, 2);
  assert.equal(analyse.jamaisAttribues.length, 0, 'les deux badges ont été reçus par une personne réelle');
  await db.close();
});

test('un badge que personne n’a reçu est annoncé comme tel', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await db.execute({
    sql: `INSERT INTO badge_defs(id,name,cat,icon,position) VALUES ('BADGE_EN_ROUTE','En Route','parcours','rw_path',1)`,
  });
  const analyse = await analyseBadges(db, MAINTENANT);
  assert.equal(analyse.total, 0);
  assert.deepEqual(analyse.jamaisAttribues, [{ id: 'BADGE_EN_ROUTE', nom: 'En Route', formation: null }]);
  await db.close();
});

test('l’activité compte les connexions réelles et toutes les traces de travail', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await utilisateur(db, 'usr_2', 'Bakary Koffi');
  await utilisateur(db, 'staff_1', 'Coach Réel', 'staff');
  await utilisateur(db, 'usr_3', 'Étudiant De Test', 'student', 1);

  // Awa : deux connexions dans les 30 jours, la dernière il y a 3 jours.
  for (const decalage of [20 * JOUR_MS, 3 * JOUR_MS]) {
    await db.execute({
      sql: `INSERT INTO sessions(token_hash,user_id,created_at_ms,expires_at_ms) VALUES (?,?,?,?)`,
      args: [`jeton-${decalage}`, 'usr_1', MAINTENANT - decalage, MAINTENANT + JOUR_MS],
    });
  }
  await db.execute({
    sql: `UPDATE users SET last_login_at_ms=? WHERE id='usr_1'`,
    args: [MAINTENANT - 3 * JOUR_MS],
  });

  // Awa a posé 4 questions hier, et une leçon a été terminée il y a une heure :
  // elle a donc travaillé APRÈS sa dernière connexion.
  await db.execute({
    sql: `INSERT INTO assistant_user_days(user_id,day,requests) VALUES ('usr_1',?,4)`,
    args: [jourDe(MAINTENANT - JOUR_MS)],
  });
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,published) VALUES ('trn_1','Orateur',39900,1)`,
  });
  await db.execute({
    sql: `INSERT INTO course_modules(id,training_id,title,position) VALUES ('mod_1','trn_1','Module 1',1)`,
  });
  await db.execute({
    sql: `INSERT INTO course_lessons(id,module_id,title,kind,position) VALUES ('lec_1','mod_1','Leçon 1','text',1)`,
  });
  await db.execute({
    sql: `INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES ('usr_1','lec_1',?)`,
    args: [MAINTENANT - 60 * 60 * 1000],
  });
  // Bakary : une connexion il y a 45 jours — endormi, mais il a bien existé.
  await db.execute({
    sql: `INSERT INTO sessions(token_hash,user_id,created_at_ms,expires_at_ms) VALUES ('jeton-vieux','usr_2',?,?)`,
    args: [MAINTENANT - 45 * JOUR_MS, MAINTENANT - 40 * JOUR_MS],
  });
  await db.execute({ sql: `UPDATE users SET last_login_at_ms=? WHERE id='usr_2'`, args: [MAINTENANT - 45 * JOUR_MS] });

  const analyse = await analyseActivite(db, MAINTENANT);
  assert.equal(analyse.suivis, 2, 'le staff et les comptes de test sont exclus');
  assert.equal(analyse.actifsTrenteJours, 1, 'seule Awa s’est connectée dans les 30 jours');
  assert.equal(analyse.jamaisConnectes, 0);
  assert.equal(analyse.endormis, 1);
  assert.deepEqual(
    analyse.etudiants.map((etudiant) => etudiant.nom),
    ['Awa Traoré', 'Bakary Koffi'],
    'l’activité la plus récente en tête'
  );

  const awa = analyse.etudiants[0];
  assert.equal(awa.connexionsTrenteJours, 2);
  assert.equal(awa.derniereConnexionMs, MAINTENANT - 3 * JOUR_MS);
  assert.equal(
    awa.derniereActiviteMs,
    MAINTENANT - 60 * 60 * 1000,
    'la leçon terminée après la dernière connexion compte comme activité'
  );
  assert.equal(awa.questionsTrenteJours, 4, 'les questions posées sur 30 jours sont visibles');
  assert.equal(analyse.etudiants[1].connexionsTrenteJours, 0, 'hors des 30 jours, la connexion ne compte plus');
  await db.close();
});
