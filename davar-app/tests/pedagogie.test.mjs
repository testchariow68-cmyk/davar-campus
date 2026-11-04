/**
 * CŒUR PÉDAGOGIQUE — exercices, évaluations, devoirs, certificats, badges, avis.
 * Exécution : npm test — base libSQL temporaire, aucun accès réseau.
 *
 * Ce qui est protégé ici, parce que le propriétaire l'a écrit :
 *   - l'exercice NE BLOQUE JAMAIS ; l'évaluation bloque (score minimum) ;
 *   - les tentatives ne s'effacent jamais, même échouées ;
 *   - un devoir n'est accepté qu'après le score minimum ;
 *   - un refus sans explication est REFUSÉ par le serveur ;
 *   - le certificat se demande, se valide à la main, et son nom est figé ;
 *   - la vérification publique ne révèle que le nécessaire ;
 *   - un avis dépasse 1 000 mots ? il est refusé.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  corriger,
  deciderDevoir,
  pedagogieDeFormation,
  repondreEvaluation,
  repondreExercice,
  rendreDevoir,
} from '../lib/server/pedagogie.ts';
import { deciderCertificat, demanderCertificat, verifierCertificat, codeCertificat } from '../lib/server/certificats.ts';
import { attribuerBadge, badgesDeEtudiant, BADGES_PARCOURS, installerCatalogue, verifierReglesBadges } from '../lib/server/recompenses.ts';
import { avisAttendus, compterMots, deposerAvis, MOTS_MAXIMUM } from '../lib/server/avis.ts';
import { formationTerminee, progressionFormation } from '../lib/server/campus.ts';
import { pathToFileURL } from 'node:url';

process.env.APP_ENV = 'development';

async function basePrete() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-peda-')), 'test.db');
  const db = createClient({ url: pathToFileURL(fichier).href });
  await applyAllMigrations(db);
  const maintenant = Date.now();
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES ('u-eleve','eleve@davar.test','Awa Koné','x',?,'student','active',?,0)`,
    args: [maintenant, maintenant],
  });
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('t-orateur','Devenir un excellent orateur',39900,'prd',1)`,
  });
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_1','eleve@davar.test','t-orateur','39900','XOF',?)`,
    args: [maintenant],
  });
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms) VALUES ('u-eleve','t-orateur','verified_purchase','sale_1',?)`,
    args: [maintenant],
  });
  await db.execute({
    sql: `INSERT INTO course_modules(id,training_id,position,title,summary) VALUES ('m-1','t-orateur',1,'Vaincre le trac','Rester calme.')`,
  });
  await db.execute({
    sql: `INSERT INTO course_lessons(id,module_id,position,title,kind,duration_min,content_text)
          VALUES ('l-1','m-1',1,'Respirer','video',8,'La respiration diaphragmatique.')`,
  });
  await db.execute({
    sql: `INSERT INTO lesson_exercises(id,lesson_id,title,intro,created_at_ms) VALUES ('ex-1','l-1','Exercice — Votre accroche','Ne bloque rien.',?)`,
    args: [maintenant],
  });
  await db.execute({
    sql: `INSERT INTO quiz_questions(id,parent_kind,parent_id,position,question,options,answer_index,explain)
          VALUES ('q-1','exercise','ex-1',1,'Quelle accroche capte le mieux ?','["Une citation longue","Une question vécue"]',1,'Une question projette l’auditoire.')`,
  });
  await db.execute({
    sql: `INSERT INTO lesson_assessments(id,lesson_id,title,intro,min_score,requires_review,created_at_ms)
          VALUES ('ev-1','l-1','Évaluation — Analyse d’un discours','Bloquante.',80,1,?)`,
    args: [maintenant],
  });
  for (const [id, position, question, bonne] of [
    ['evq-1', 1, 'La promesse du début doit…', 1],
    ['evq-2', 2, 'Le silence avant une idée forte…', 1],
    ['evq-3', 3, 'Une conclusion efficace contient…', 1],
  ]) {
    await db.execute({
      sql: `INSERT INTO quiz_questions(id,parent_kind,parent_id,position,question,options,answer_index,explain)
            VALUES (?, 'assessment','ev-1',?,?,'["Faux","Juste"]',?,'Explication.')`,
      args: [id, position, question, bonne],
    });
  }
  return db;
}

test('la correction est juste, et le corrigé explique chaque réponse', () => {
  const questions = [
    { id: 'a', position: 1, question: 'Q1', options: ['x', 'y'], answerIndex: 1, explain: 'Parce que.' },
    { id: 'b', position: 2, question: 'Q2', options: ['x', 'y'], answerIndex: 0, explain: null },
  ];
  const juste = corriger(questions, [
    { questionId: 'a', choiceIndex: 1 },
    { questionId: 'b', choiceIndex: 0 },
  ]);
  assert.equal(juste.score, 2);
  assert.equal(juste.pct, 100);
  assert.ok(juste.detail[0].correct);

  const partiel = corriger(questions, [
    { questionId: 'a', choiceIndex: 0 },
    { questionId: 'b', choiceIndex: 0 },
  ]);
  assert.equal(partiel.score, 1);
  assert.equal(partiel.pct, 50);
  assert.equal(partiel.detail[0].bonne, 1, 'la bonne réponse est rendue à l’étudiant');
  assert.equal(partiel.detail[0].explication, 'Parce que.');
});

test("l'exercice ne bloque rien et l'évaluation bloque au score minimum", async () => {
  const db = await basePrete();

  const exercice = await repondreExercice(db, 'u-eleve', 'ex-1', [{ questionId: 'q-1', choiceIndex: 0 }]);
  assert.equal(exercice.ok, true);
  assert.equal(exercice.pct, 0, 'même raté, l’exercice se corrige et rend le corrigé');
  assert.equal(exercice.detail[0].explication, 'Une question projette l’auditoire.');

  // 3 bonnes réponses sur 3 : 100 % ≥ 80 % → réussie.
  const reussie = await repondreEvaluation(db, 'u-eleve', 'ev-1', [
    { questionId: 'evq-1', choiceIndex: 1 },
    { questionId: 'evq-2', choiceIndex: 1 },
    { questionId: 'evq-3', choiceIndex: 1 },
  ]);
  assert.equal(reussie.ok, true);
  assert.equal(reussie.pct, 100);

  // 1 bonne sur 3 : 33 % < 80 % → échouée, MAIS enregistrée.
  const echouee = await repondreEvaluation(db, 'u-eleve', 'ev-1', [
    { questionId: 'evq-1', choiceIndex: 1 },
    { questionId: 'evq-2', choiceIndex: 0 },
    { questionId: 'evq-3', choiceIndex: 0 },
  ]);
  assert.equal(echouee.pct, 33);

  const tentatives = await db.execute('SELECT pct, passed FROM assessment_attempts WHERE user_id = ? ORDER BY at_ms', ['u-eleve']);
  assert.equal(tentatives.rows.length, 2, 'aucune tentative ne s’efface : même échouée, elle reste');
  assert.equal(Number(tentatives.rows[1].passed), 0);
});

test('un devoir n’est accepté qu’après le score minimum, et un refus exige une explication', async () => {
  const db = await basePrete();

  const tropTot = await rendreDevoir(db, { userId: 'u-eleve', assessmentId: 'ev-1', note: 'Voici mon travail.' });
  assert.equal(tropTot.ok, false);
  assert.equal(tropTot.erreur, 'score_insuffisant', 'sans le minimum, aucun devoir n’est accepté');

  await repondreEvaluation(db, 'u-eleve', 'ev-1', [
    { questionId: 'evq-1', choiceIndex: 1 },
    { questionId: 'evq-2', choiceIndex: 1 },
    { questionId: 'evq-3', choiceIndex: 1 },
  ]);
  const rendu = await rendreDevoir(db, { userId: 'u-eleve', assessmentId: 'ev-1', note: 'Voici mon travail.' });
  assert.equal(rendu.ok, true);

  const enDouble = await rendreDevoir(db, { userId: 'u-eleve', assessmentId: 'ev-1', note: 'Encore.' });
  assert.equal(enDouble.erreur, 'deja_rendu');

  const devoir = await db.execute("SELECT id FROM submissions WHERE status = 'pending'");
  const id = String(devoir.rows[0].id);

  const sansMotif = await deciderDevoir(db, { submissionId: id, decision: 'refused', feedback: 'non', decideur: 'usr_p' });
  assert.equal(sansMotif.ok, false);
  assert.equal(sansMotif.erreur, 'explication_obligatoire', 'un refus muet serait un mur');

  const refuse = await deciderDevoir(db, {
    submissionId: id,
    decision: 'refused',
    feedback: 'Reprenez la conclusion : elle manque d’un appel à l’action clair.',
    decideur: 'usr_p',
  });
  assert.equal(refuse.ok, true);
  const rejoue = await deciderDevoir(db, { submissionId: id, decision: 'approved', feedback: '', decideur: 'usr_p' });
  assert.equal(rejoue.erreur, 'deja_decide', 'une décision ne se reprend pas en silence');
});

test('le certificat se demande, se valide à la main, et son code le rend vérifiable', async () => {
  const db = await basePrete();
  assert.equal(codeCertificat(2026, 147), 'CERT-2026-0147');

  // Le certificat ne se demande qu'à 100 % : on mène donc la formation au bout
  // (leçon vue, évaluation réussie) avant de formuler la demande.
  await db.execute("UPDATE lesson_assessments SET requires_review = 0 WHERE id = 'ev-1'");
  await db.execute({
    sql: 'INSERT INTO lesson_completions(user_id, lesson_id, completed_at_ms) VALUES (?,?,?)',
    args: ['u-eleve', 'l-1', Date.now()],
  });
  await repondreEvaluation(db, 'u-eleve', 'ev-1', [
    { questionId: 'evq-1', choiceIndex: 1 },
    { questionId: 'evq-2', choiceIndex: 1 },
    { questionId: 'evq-3', choiceIndex: 1 },
  ]);

  const demande = await demanderCertificat(db, { userId: 'u-eleve', formationId: 't-orateur', holderName: 'Awa Koné' });
  assert.equal(demande.ok, true);
  const encore = await demanderCertificat(db, { userId: 'u-eleve', formationId: 't-orateur', holderName: 'Awa Koné' });
  assert.equal(encore.erreur, 'demande_deja_en_cours');

  const demandeId = String((await db.execute('SELECT id FROM certificate_requests')).rows[0].id);
  const sansMotif = await deciderCertificat(db, { requestId: demandeId, decision: 'refused', motif: 'non', decideur: 'usr_p' });
  assert.equal(sansMotif.erreur, 'motif_obligatoire');

  const valide = await deciderCertificat(db, { requestId: demandeId, decision: 'approved', motif: '', decideur: 'usr_p' });
  assert.equal(valide.ok, true);
  assert.equal(valide.code, `CERT-${new Date().getUTCFullYear()}-0001`);

  const verification = await verifierCertificat(db, valide.code.toLowerCase());
  assert.equal(verification.trouve, true, 'la vérification est insensible à la casse');
  assert.equal(verification.valide, true);
  assert.equal(verification.holderName, 'Awa Koné');
  assert.equal(verification.formationTitle, 'Devenir un excellent orateur');

  const inconnu = await verifierCertificat(db, 'CERT-2026-9999');
  assert.equal(inconnu.trouve, false);
  assert.equal(inconnu.holderName, undefined, 'aucune fuite : un code inconnu ne révèle rien');
});

test('les badges : catalogue complet, attribution une seule fois, et pas de doublon', async () => {
  const db = await basePrete();
  const posees = await installerCatalogue(db, [{ id: 't-orateur', title: 'Devenir un excellent orateur' }]);
  assert.equal(posees, BADGES_PARCOURS.length + 1, '6 badges de parcours + 1 badge de formation');

  assert.equal(await attribuerBadge(db, { userId: 'u-eleve', badgeId: 'BADGE_PREMIER_PAS' }), true);
  assert.equal(await attribuerBadge(db, { userId: 'u-eleve', badgeId: 'BADGE_PREMIER_PAS' }), false, 'jamais deux fois');

  const obtenus = await badgesDeEtudiant(db, 'u-eleve');
  assert.equal(obtenus.length, 1);
  assert.equal(obtenus[0].name, 'Premier Pas');
  assert.ok(obtenus[0].shortText.includes('commencer'));
});

test('les règles automatiques attribuent les bons badges, et une seule fois', async () => {
  const db = await basePrete();
  await installerCatalogue(db, [{ id: 't-orateur', title: 'Devenir un excellent orateur' }]);

  const premier = await verifierReglesBadges(db, 'u-eleve');
  assert.deepEqual(premier, ['BADGE_PREMIER_PAS'], 'à la première connexion : Premier Pas seulement');

  await db.execute({
    sql: 'INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES (?,?,?)',
    args: ['u-eleve', 'l-1', Date.now()],
  });
  const apresLecon = await verifierReglesBadges(db, 'u-eleve');
  assert.ok(apresLecon.includes('BADGE_EN_ROUTE'));
  assert.ok(apresLecon.includes('BADGE_MISSION_ACCOMPLIE'), 'la seule leçon terminée = formation traversée');
  assert.ok(apresLecon.includes('BADGE_FORMATION_01'), 'le badge de la formation suit');

  const deuxieme = await verifierReglesBadges(db, 'u-eleve');
  assert.deepEqual(deuxieme, [], 'aucun badge n’est attribué deux fois');
});

test('un avis est borné à 1 000 mots, jamais deux fois pour la même étape', async () => {
  const db = await basePrete();
  assert.equal(compterMots('un deux trois'), 3);

  const attendus = await avisAttendus(db, 'u-eleve', 't-orateur');
  assert.equal(attendus.length, 2, 'deux temps : environ 2 semaines, puis environ 1 mois');
  assert.equal(attendus[0].deposeLeMs, null);

  const court = await deposerAvis(db, { userId: 'u-eleve', formationId: 't-orateur', step: 1, body: 'Trop court', kind: 'ecrit' });
  assert.equal(court.erreur, 'avis_trop_court');

  const enorme = 'mot '.repeat(MOTS_MAXIMUM + 10);
  const tropLong = await deposerAvis(db, { userId: 'u-eleve', formationId: 't-orateur', step: 1, body: enorme, kind: 'ecrit' });
  assert.equal(tropLong.erreur, 'avis_trop_long');
  assert.ok(tropLong.mots > MOTS_MAXIMUM);

  const bon = await deposerAvis(db, {
    userId: 'u-eleve',
    formationId: 't-orateur',
    step: 1,
    body: 'Cette formation m’a appris à structurer un discours en trois idées fortes.',
    kind: 'ecrit',
  });
  assert.equal(bon.ok, true);
  assert.ok(bon.mots > 0);

  const double = await deposerAvis(db, {
    userId: 'u-eleve',
    formationId: 't-orateur',
    step: 1,
    body: 'Un second avis sur la même étape, qui ne devrait pas passer.',
    kind: 'ecrit',
  });
  assert.equal(double.erreur, 'avis_deja_depose');

  const apres = await avisAttendus(db, 'u-eleve', 't-orateur');
  assert.ok(apres[0].deposeLeMs !== null);
  assert.equal(apres[1].deposeLeMs, null, 'le second avis reste attendu');
});

test('la lecture groupée d’une formation rassemble exercice et évaluation par module', async () => {
  const db = await basePrete();
  const pedagogie = await pedagogieDeFormation(db, 'u-eleve', 't-orateur');
  assert.equal(pedagogie.length, 1);
  assert.equal(pedagogie[0].exercices.length, 1);
  assert.equal(pedagogie[0].evaluations.length, 1);
  assert.equal(pedagogie[0].exercices[0].exercice.questions[0].id, 'q-1');
  assert.equal(pedagogie[0].evaluations[0].evaluation.minScore, 80);
  assert.equal(pedagogie[0].evaluations[0].evaluation.reussie, false);
});

test('la progression compte les leçons et les évaluations — et jamais l’exercice', () => {
  const presque = progressionFormation({ lessonCount: 4, completedCount: 4, evaluationCount: 1, evaluationsReussies: 0 });
  assert.equal(presque.pct, 80, 'quatre leçons sur cinq étapes : 80 %');
  assert.equal(presque.terminee, false, 'une évaluation en suspens n’est pas une formation terminée');

  const finie = progressionFormation({ lessonCount: 4, completedCount: 4, evaluationCount: 1, evaluationsReussies: 1 });
  assert.equal(finie.pct, 100);
  assert.equal(finie.terminee, true);

  const vide = progressionFormation({ lessonCount: 0, completedCount: 0, evaluationCount: 0, evaluationsReussies: 0 });
  assert.equal(vide.pct, 0);
  assert.equal(vide.terminee, false, 'une formation vide ne se dit pas terminée');
});

test('100 % veut dire formation terminée : leçons vues, évaluation réussie, coach passé', async () => {
  const db = await basePrete();
  const maintenant = Date.now();
  const bonnesReponses = [
    { questionId: 'evq-1', choiceIndex: 1 },
    { questionId: 'evq-2', choiceIndex: 1 },
    { questionId: 'evq-3', choiceIndex: 1 },
  ];

  // 1. Rien n'est fait.
  assert.equal(await formationTerminee(db, 'u-eleve', 't-orateur'), false);

  // 2. La leçon est vue : ce n'est pas suffisant, l'évaluation reste en suspens.
  await db.execute({
    sql: 'INSERT INTO lesson_completions(user_id, lesson_id, completed_at_ms) VALUES (?,?,?)',
    args: ['u-eleve', 'l-1', maintenant],
  });
  assert.equal(await formationTerminee(db, 'u-eleve', 't-orateur'), false);

  // 3. L'évaluation est réussie au score, mais elle exige une validation
  //    humaine : tant que le coach n'a pas validé, ce n'est pas terminé.
  const reussite = await repondreEvaluation(db, 'u-eleve', 'ev-1', bonnesReponses, maintenant);
  assert.equal(reussite.ok, true);
  assert.equal(reussite.pct, 100);
  assert.equal(await formationTerminee(db, 'u-eleve', 't-orateur'), false);

  // 4. Le devoir est rendu, puis validé par le coach : la formation l'est.
  const rendu = await rendreDevoir(
    db,
    { userId: 'u-eleve', assessmentId: 'ev-1', note: 'Mon discours de trois minutes.', fileKey: null },
    maintenant
  );
  assert.equal(rendu.ok, true);
  const soumission = await db.execute("SELECT id FROM submissions WHERE user_id = 'u-eleve'");
  const decision = await deciderDevoir(
    db,
    { submissionId: String(soumission.rows[0].id), decision: 'approved', feedback: 'Très bien.', decideur: 'u-coach' },
    maintenant
  );
  assert.equal(decision.ok, true);
  assert.equal(await formationTerminee(db, 'u-eleve', 't-orateur'), true);
});

test('le certificat se demande à 100 % — et pas une leçon avant', async () => {
  const db = await basePrete();
  const maintenant = Date.now();

  const refus = await demanderCertificat(
    db,
    { userId: 'u-eleve', formationId: 't-orateur', holderName: 'Awa Koné' },
    maintenant
  );
  assert.equal(refus.ok, false);
  assert.equal(refus.erreur, 'formation_non_terminee');

  // Une évaluation sans validation humaine, pour aller au bout sans le coach.
  await db.execute("UPDATE lesson_assessments SET requires_review = 0 WHERE id = 'ev-1'");
  await db.execute({
    sql: 'INSERT INTO lesson_completions(user_id, lesson_id, completed_at_ms) VALUES (?,?,?)',
    args: ['u-eleve', 'l-1', maintenant],
  });
  const reussite = await repondreEvaluation(
    db,
    'u-eleve',
    'ev-1',
    [
      { questionId: 'evq-1', choiceIndex: 1 },
      { questionId: 'evq-2', choiceIndex: 1 },
      { questionId: 'evq-3', choiceIndex: 1 },
    ],
    maintenant
  );
  assert.equal(reussite.pct, 100);
  assert.equal(await formationTerminee(db, 'u-eleve', 't-orateur'), true);

  const accord = await demanderCertificat(
    db,
    { userId: 'u-eleve', formationId: 't-orateur', holderName: 'Awa Koné' },
    maintenant
  );
  assert.equal(accord.ok, true, 'à 100 %, la demande passe');
});
