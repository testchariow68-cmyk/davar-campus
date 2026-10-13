/**
 * ASSIDUITÉ ET RÉCOMPENSES — les rappels chaleureux et les distinctions du temps.
 *
 * Protégé ici :
 *   - les quatre messages du propriétaire partent dans son ordre, un cycle à la fois,
 *     et jamais deux fois le même cycle ;
 *   - Réglages du moteur rangés en base, avec les valeurs par défaut du prototype ;
 *   - Régularité, Persévérance et Retour en Force se calculent sur l'historique réel ;
 *   - une distinction manuelle garde son motif, et prévient l'étudiant ;
 *   - un étudiant qui a coupé les notifications n'est pas relancé — et on ne dit
 *     jamais qu'un rappel est parti s'il ne l'est pas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  RAPPELS,
  enregistrerReglagesAssiduite,
  lireReglagesAssiduite,
  verifierAssiduite,
} from '../lib/server/assiduite.ts';
import { attribuerBadge } from '../lib/server/recompenses.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-assiduite-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

const MAINTENANT = 1_760_000_000_000;
const JOUR_MS = 24 * 60 * 60 * 1000;

async function utilisateur(db, id, nom, role = 'student', estTest = 0) {
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES (?,?,?,'peu-importe',?,?,'active',?,?)`,
    args: [id, `${id}@davar.test`, nom, MAINTENANT, role, MAINTENANT, estTest],
  });
}

async function lecon(db, id, jourMs) {
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,published) VALUES ('trn_1','Orateur',39900,1) ON CONFLICT(id) DO NOTHING`,
  });
  await db.execute({
    sql: `INSERT INTO course_modules(id,training_id,title,position) VALUES ('mod_1','trn_1','Module',1) ON CONFLICT(id) DO NOTHING`,
  });
  await db.execute({
    sql: `INSERT INTO course_lessons(id,module_id,title,kind,position) VALUES (?, 'mod_1', ?, 'text', ?) ON CONFLICT(id) DO NOTHING`,
    args: [id, `Leçon ${id}`, Number(String(id).replace(/\D/g, '')) || 1],
  });
  await db.execute({
    sql: `INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES ('usr_1',?,?)`,
    args: [id, jourMs],
  });
}

test('les réglages du moteur suivent le prototype et se rangent en base', async () => {
  const db = await baseVide();
  const defauts = await lireReglagesAssiduite(db);
  assert.deepEqual(defauts, { absenceDays: 14, periodDays: 14, minActiveDays: 3 }, 'les valeurs du propriétaire');

  const modifies = await enregistrerReglagesAssiduite(db, { absenceDays: 7, periodDays: 21, minActiveDays: 5 });
  assert.deepEqual(modifies, { absenceDays: 7, periodDays: 21, minActiveDays: 5 });
  assert.deepEqual(await lireReglagesAssiduite(db), modifies, 'relus depuis la base');
  await db.close();
});

test('le rappel part après absence, une fois par cycle, dans l’ordre du propriétaire', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  // Sa dernière trace remonte à 15 jours : premier cycle (14 jours) dépassé.
  await lecon(db, 'lec_1', MAINTENANT - 15 * JOUR_MS);

  const premier = await verifierAssiduite(db, MAINTENANT);
  assert.equal(premier.rappels.length, 1);
  assert.equal(premier.rappels[0].titre, RAPPELS[0].title, 'le premier message du propriétaire');
  assert.equal(premier.examines, 1);

  const cloche = await db.execute("SELECT title, body, kind FROM notifications WHERE user_id = 'usr_1'");
  assert.equal(cloche.rows.length, 1);
  assert.equal(String(cloche.rows[0].kind), 'rappel');
  assert.equal(String(cloche.rows[0].title), RAPPELS[0].title);
  assert.equal(String(cloche.rows[0].body), RAPPELS[0].body, 'le texte est recopié mot pour mot');

  // Rejouer tout de suite : rien de plus — le cycle est déjà servi.
  const deuxieme = await verifierAssiduite(db, MAINTENANT);
  assert.equal(deuxieme.rappels.length, 0, 'le même cycle ne repart jamais');

  // 29 jours plus tard : deuxième cycle, deuxième message de la liste.
  const plusTard = MAINTENANT + 14 * JOUR_MS;
  const troisieme = await verifierAssiduite(db, plusTard);
  assert.equal(troisieme.rappels.length, 1);
  assert.equal(troisieme.rappels[0].titre, RAPPELS[1].title, 'le message tourne, il ne se répète pas');
  await db.close();
});

test('un étudiant qui a coupé les notifications n’est pas relancé — et on le dit', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await db.execute({
    sql: `INSERT INTO user_prefs(user_id, pref_key, pref_value, updated_at_ms) VALUES ('usr_1', 'notifications.actives', '0', ?)`,
    args: [MAINTENANT],
  });
  await lecon(db, 'lec_1', MAINTENANT - 20 * JOUR_MS);

  const resultat = await verifierAssiduite(db, MAINTENANT);
  assert.equal(resultat.rappels.length, 0, 'aucun rappel n’est annoncé');
  assert.equal(resultat.rappelRefuses, 1, 'il est compté à part');
  const cloche = await db.execute("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'usr_1'");
  assert.equal(Number(cloche.rows[0].n), 0, 'et rien n’est écrit dans sa cloche');
  await db.close();
});

test('Régularité, Persévérance et Retour en Force se lisent dans l’historique réel', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await db.execute({
    sql: `INSERT INTO badge_defs(id,name,cat,icon,short_text,position,auto_rule) VALUES
          ('BADGE_REGULARITE','Régularité','parcours','rw_lines','La constance est votre force.',3,'trois_jours'),
          ('BADGE_PERSEVERANCE','Persévérance','parcours','rw_resume','Vous êtes revenu.',4,'retour_apres_pause'),
          ('BADGE_RETOUR_EN_FORCE','Retour en Force','parcours','rw_circle','Vous avez avancé.',5,'retour_avec_progres')`,
  });
  // Trois jours travaillés dans la fenêtre de 14 jours, dont le retour après 20
  // jours de pause — et l'aujourd'hui travaillé.
  await lecon(db, 'lec_1', MAINTENANT - 30 * JOUR_MS);
  await lecon(db, 'lec_2', MAINTENANT - 2 * JOUR_MS);
  await lecon(db, 'lec_3', MAINTENANT - JOUR_MS);
  await lecon(db, 'lec_4', MAINTENANT - 1000);

  // Persévérance : une évaluation ratée, puis réussie.
  await db.execute({
    sql: `INSERT INTO lesson_assessments(id,lesson_id,title,min_score,requires_review,created_at_ms)
          VALUES ('asm_1','lec_1','Évaluation',80,1,?)`,
    args: [MAINTENANT - 30 * JOUR_MS],
  });
  await db.execute({
    sql: `INSERT INTO assessment_attempts(id,user_id,assessment_id,score,total,pct,passed,at_ms) VALUES
          ('att_1','usr_1','asm_1',4,10,40,0,?), ('att_2','usr_1','asm_1',9,10,90,1,?)`,
    args: [MAINTENANT - 30 * JOUR_MS, MAINTENANT - 2 * JOUR_MS],
  });

  const resultat = await verifierAssiduite(db, MAINTENANT);
  const badges = resultat.distinctions.map((ligne) => ligne.badge).sort();
  assert.deepEqual(badges, ['Persévérance', 'Retour en Force', 'Régularité']);
  assert.match(resultat.distinctions.find((l) => l.badge === 'Régularité').motif, /3 jours \/ 14/);

  // Rejouer ne redouble rien : la base garde une seule fois chaque distinction.
  const encore = await verifierAssiduite(db, MAINTENANT);
  assert.equal(encore.distinctions.length, 0);
  await db.close();
});

test('une distinction attribuée à la main garde son motif et prévient l’étudiant', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await utilisateur(db, 'staff_1', 'Coach Réel', 'staff');
  await db.execute({
    sql: `INSERT INTO badge_defs(id,name,cat,icon,short_text,position) VALUES ('BADGE_COURAGE','Courage','accomplissement','award','Votre courage est remarquable.',10)`,
  });

  const pose = await attribuerBadge(
    db,
    { userId: 'usr_1', badgeId: 'BADGE_COURAGE', source: 'manuel', awardedBy: 'staff_1', note: 'reprise exceptionnelle validée par le coach' },
    MAINTENANT
  );
  assert.equal(pose, true);

  const ligne = await db.execute("SELECT source, awarded_by, note FROM badge_awards WHERE user_id = 'usr_1'");
  assert.equal(String(ligne.rows[0].source), 'manuel');
  assert.equal(String(ligne.rows[0].awarded_by), 'staff_1', 'on sait qui l’a donnée');
  assert.equal(String(ligne.rows[0].note), 'reprise exceptionnelle validée par le coach', 'et pourquoi');

  const cloche = await db.execute("SELECT title, body FROM notifications WHERE user_id = 'usr_1'");
  assert.equal(String(cloche.rows[0].title), 'Nouvelle distinction');
  assert.match(String(cloche.rows[0].body), /Courage — Votre courage est remarquable/);

  // Une seconde fois : refusé, et aucune seconde notification.
  const encore = await attribuerBadge(db, { userId: 'usr_1', badgeId: 'BADGE_COURAGE' }, MAINTENANT + 1000);
  assert.equal(encore, false);
  const compte = await db.execute("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'usr_1'");
  assert.equal(Number(compte.rows[0].n), 1);
  await db.close();
});
