/**
 * ANALYTICS — les quatre compteurs du prototype, sans jamais estimer.
 *
 * Protégé ici :
 *   - la progression se calcule sur les leçons de CHAQUE formation, pas sur un total global ;
 *   - l'activité des quatorze derniers jours vient de gestes réels, jour par jour ;
 *   - l'exercice ne produit aucun taux (il ne bloque pas) ; l'évaluation, si ;
 *   - les comptes de test et le staff n'entrent dans aucun chiffre.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { jourDe } from '../lib/server/assistant.ts';
import { analysePilotage } from '../lib/server/pilotage.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-pilotage-')), 'test.db');
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

async function formation(db, id, titre, lecons) {
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,published) VALUES (?,?,39900,1)`,
    args: [id, titre],
  });
  for (let index = 0; index < lecons; index += 1) {
    await db.execute({ sql: `INSERT INTO course_modules(id,training_id,title,position) VALUES (?,?,?,?)`, args: [`mod_${id}_${index}`, id, `Module ${index}`, index + 1] });
    await db.execute({
      sql: `INSERT INTO course_lessons(id,module_id,title,kind,position) VALUES (?,?,?, 'text', 1)`,
      args: [`lec_${id}_${index}`, `mod_${id}_${index}`, `Leçon ${index}`],
    });
  }
}

test('la progression se lit formation par formation, jamais en bloc', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await formation(db, 'trn_1', 'Orateur', 4);
  await formation(db, 'trn_2', 'Prise de parole', 1);
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,acquired_at_ms) VALUES ('usr_1','trn_1','staff_grant',?)`,
    args: [MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,acquired_at_ms) VALUES ('usr_1','trn_2','staff_grant',?)`,
    args: [MAINTENANT],
  });
  // Deux leçons sur quatre (50 %), et la seule leçon de la seconde (100 %) :
  // la moyenne de l'étudiante est donc 75 %, pas 3/5 des leçons confondues.
  for (const lecon of ['lec_trn_1_0', 'lec_trn_1_1', 'lec_trn_2_0']) {
    await db.execute({
      sql: `INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES ('usr_1',?,?)`,
      args: [lecon, MAINTENANT - 1000],
    });
  }

  const analyse = await analysePilotage(db, MAINTENANT);
  assert.equal(analyse.leconsTerminees, 3);
  assert.equal(analyse.etudiantsSuivis, 1);
  assert.equal(analyse.progressionMoyennePct, 75);
  const orateur = analyse.parFormation.find((f) => f.titre === 'Orateur');
  const prise = analyse.parFormation.find((f) => f.titre === 'Prise de parole');
  assert.equal(orateur.moyennePct, 50);
  assert.equal(prise.moyennePct, 100);
  await db.close();
});

test('un étudiant sans formation compte pour zéro — on ne flatte pas le chiffre', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await utilisateur(db, 'usr_2', 'Bakary Koffi');
  await formation(db, 'trn_1', 'Orateur', 2);
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,acquired_at_ms) VALUES ('usr_1','trn_1','staff_grant',?)`,
    args: [MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES ('usr_1','lec_trn_1_0',?)`,
    args: [MAINTENANT],
  });
  const analyse = await analysePilotage(db, MAINTENANT);
  assert.equal(analyse.progressionMoyennePct, 25, '50 % pour l’une, 0 % pour l’autre');
  await db.close();
});

test('l’activité compte les gestes réels des quatorze derniers jours', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_1', 'Awa Traoré');
  await utilisateur(db, 'usr_2', 'Étudiant De Test', 'student', 1);
  await formation(db, 'trn_1', 'Orateur', 1);
  const aujourdHui = jourDe(MAINTENANT);
  const hier = jourDe(MAINTENANT - JOUR_MS);

  // Aujourd'hui : une leçon terminée, une session ouverte, deux questions.
  await db.execute({
    sql: `INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES ('usr_1','lec_trn_1_0',?)`,
    args: [MAINTENANT - 60_000],
  });
  await db.execute({
    sql: `INSERT INTO sessions(token_hash,user_id,created_at_ms,expires_at_ms) VALUES ('jeton-1','usr_1',?,?)`,
    args: [MAINTENANT - 50_000, MAINTENANT + JOUR_MS],
  });
  await db.execute({
    sql: `INSERT INTO assistant_user_days(user_id,day,requests) VALUES ('usr_1',?,2)`,
    args: [aujourdHui],
  });
  // Hier : un devoir rendu. Le compte de test ne doit rien ajouter.
  await db.execute({
    sql: `INSERT INTO lesson_assessments(id,lesson_id,title,min_score,requires_review,created_at_ms)
          VALUES ('asm_1','lec_trn_1_0','Évaluation','80',1,?)`,
    args: [MAINTENANT],
  });
  await db.execute({
    sql: `INSERT INTO submissions(id,user_id,assessment_id,training_id,status,at_ms) VALUES ('sub_1','usr_1','asm_1','trn_1','pending',?)`,
    args: [MAINTENANT - JOUR_MS],
  });
  await db.execute({
    sql: `INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES ('usr_2','lec_trn_1_0',?)`,
    args: [MAINTENANT - 1_000],
  });
  await db.execute({
    sql: `INSERT INTO assessment_attempts(id,user_id,assessment_id,score,total,pct,passed,at_ms)
          VALUES ('att_1','usr_1','asm_1',8,10,80,1,?)`,
    args: [MAINTENANT - 40_000],
  });
  await db.execute({
    sql: `INSERT INTO assessment_attempts(id,user_id,assessment_id,score,total,pct,passed,at_ms)
          VALUES ('att_2','usr_1','asm_1',5,10,50,0,?)`,
    args: [MAINTENANT - 30_000],
  });

  const analyse = await analysePilotage(db, MAINTENANT);
  assert.equal(analyse.leconsTerminees, 1, 'la leçon du compte de test ne compte pas');
  assert.equal(analyse.parJour.length, 14);
  assert.equal(analyse.parJour[13].jour, aujourdHui);
  assert.equal(analyse.actionsAujourdHui, 4, 'leçon + session + 2 questions');
  assert.equal(analyse.parJour[12].actions, 1, 'le devoir rendu d’hier');
  assert.equal(analyse.actionsAujourdHui, analyse.parJour[analyse.parJour.length - 1].actions);
  assert.equal(analyse.evaluation.tentatives, 2);
  assert.equal(analyse.evaluation.reussies, 1);
  assert.equal(analyse.evaluation.taux, 50);
  assert.equal(analyse.evaluation.scoreMoyenPct, 65);
  assert.equal(analyse.leconsTerminees + analyse.lectures, 1, 'seule la leçon réelle de l’étudiante est comptée');
  await db.close();
});

test('sans étudiants, les écrans le disent au lieu d’inventer', async () => {
  const db = await baseVide();
  const analyse = await analysePilotage(db, MAINTENANT);
  assert.equal(analyse.progressionMoyennePct, null);
  assert.equal(analyse.evaluation.taux, null);
  assert.equal(analyse.actionsAujourdHui, 0);
  assert.deepEqual(analyse.parFormation, []);
  await db.close();
});
