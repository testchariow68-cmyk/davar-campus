/**
 * SANTÉ TECHNIQUE ET ANALYSE DES ASSISTANTS — des faits, jamais des estimations.
 * Exécution : npm test — base libSQL temporaire, aucun réseau.
 *
 * Protégé ici :
 *   - l'écran ne dit « relié » que pour ce qui l'est vraiment, et nomme ce qui reste ;
 *   - « qui répond » suit exactement la règle du module (chaineActive), épuisement compris ;
 *   - les compteurs de questions sont ceux de la base, par jour et par étudiant ;
 *   - la base de connaissances dit la vérité : associée ou non, texte rédigé ou non.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { compterAppelFournisseur, compterQuestionEtudiant, marquerQuotaAtteint, jourDe } from '../lib/server/assistant.ts';
import { analyseAssistants } from '../lib/server/assistants.ts';
import { santeTechnique } from '../lib/server/sante.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-sante-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

const MAINTENANT = 1_760_000_000_000;
const JOUR = jourDe(MAINTENANT);

test('la santé technique ne dit « relié » que pour ce qui l’est', async () => {
  const db = await baseVide();
  const etat = await santeTechnique(db, MAINTENANT);

  const base = etat.services.find((service) => service.cle === 'base');
  assert.equal(base.etat, 'relie', 'la base répond, elle est reliée');
  assert.match(base.detail, /49 tables/, 'les 16 migrations ont laissé leurs 49 tables');

  const stockage = etat.services.find((service) => service.cle === 'stockage');
  assert.equal(stockage.etat, 'en_attente', 'sans clés R2, le stockage est annoncé en attente');
  const email = etat.services.find((service) => service.cle === 'email');
  assert.equal(email.etat, 'en_attente', 'sans relais d’e-mail, l’envoi est annoncé en attente');

  // Aucun secret ne doit sortir de cet écran : on cherche des formes de clés.
  const tout = JSON.stringify(etat);
  assert.ok(!/sk-[A-Za-z0-9]/.test(tout), 'aucune clé de fournisseur');
  assert.ok(!/Bearer /.test(tout), 'aucun jeton');

  // Les quotas des offres gratuites sont affichés, avec leur verdict.
  assert.ok(etat.quotas.length >= 4);
  assert.ok(etat.quotas.every((quota) => quota.limit > 0 && quota.verdict));
  await db.close();
});

test('« qui répond » suit la chaîne : le premier au clair, puis le suivant si le quota tombe', async () => {
  const db = await baseVide();
  const avant = await analyseAssistants(db, MAINTENANT);
  assert.equal(avant.actif, 'groq', 'le principal du prototype est le premier de la chaîne');
  assert.equal(avant.fournisseurs[0].position, 1);
  assert.deepEqual(
    avant.fournisseurs.map((fournisseur) => fournisseur.provider),
    ['groq', 'gemini', 'openrouter', 'hf'],
    'l’ordre de secours du prototype'
  );
  assert.match(avant.basculeDuJour, /Aucune bascule/);

  // Le quota de Groq tombe : la bascule est réelle, et se voit.
  await compterAppelFournisseur(db, 'groq', JOUR, true);
  await marquerQuotaAtteint(db, 'groq', JOUR);
  const apres = await analyseAssistants(db, MAINTENANT);
  assert.equal(apres.actif, 'gemini', 'Gemini prend le relais');
  assert.equal(apres.fournisseurs[0].epuiseAujourdHui, true);
  assert.match(apres.basculeDuJour, /Quota atteint chez Groq → c’est Google Gemini qui prend le relais/);

  // Tous épuisés : plus personne, et l'écran le dit.
  for (const provider of ['gemini', 'openrouter', 'hf']) await marquerQuotaAtteint(db, provider, JOUR);
  const personne = await analyseAssistants(db, MAINTENANT);
  assert.equal(personne.actif, null);
  assert.match(personne.basculeDuJour, /plus aucun fournisseur disponible/);
  await db.close();
});

test('les questions sont comptées par jour et par étudiant, et le plafond vient de la configuration', async () => {
  const db = await baseVide();
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES ('usr_1','etudiant@davar.test','Étudiant Un','peu-importe',?,'student','active',?,0)`,
    args: [MAINTENANT, MAINTENANT],
  });
  await compterQuestionEtudiant(db, 'usr_1', JOUR);
  await compterQuestionEtudiant(db, 'usr_1', JOUR);
  await compterAppelFournisseur(db, 'groq', JOUR);

  const analyse = await analyseAssistants(db, MAINTENANT);
  assert.equal(analyse.questionsAujourdhui, 2);
  assert.equal(analyse.etudiantsServisAujourdhui, 1);
  assert.equal(analyse.plafondParEtudiant, 30, 'le plafond par étudiant du prototype');
  assert.equal(analyse.fournisseurs[0].requetesAujourdhui, 1, 'une requête fournisseur comptée');
  assert.deepEqual(analyse.parJour, [{ jour: JOUR, questions: 2 }]);
  await db.close();
});

test('la base de connaissances dit la vérité : associée, rédigée, ou pas', async () => {
  const db = await baseVide();
  await db.execute({
    sql: `INSERT INTO trainings(id,title,description,price_cfa,chariow_product_id,published) VALUES ('trn_1','Orateur','',39900,'prd_1',1)`,
  });
  await db.execute({
    sql: `INSERT INTO course_modules(id,training_id,title,summary,position) VALUES ('mod_1','trn_1','Module 1',NULL,1)`,
  });
  await db.execute({
    sql: `INSERT INTO course_lessons(id,module_id,title,kind,position,content_text) VALUES ('lec_1','mod_1','Leçon rédigée','text',1,'Un vrai contenu de leçon.')`,
  });
  await db.execute({
    sql: `INSERT INTO course_lessons(id,module_id,title,kind,position,content_text) VALUES ('lec_2','mod_1','Leçon vide','video',2,NULL)`,
  });

  const avant = await analyseAssistants(db, MAINTENANT);
  assert.equal(avant.baseDeConnaissances[0].associee, false, 'rien n’est associé par défaut');
  assert.equal(avant.baseDeConnaissances[0].lecons, 2);
  assert.equal(avant.baseDeConnaissances[0].leconsAvecTexte, 1, 'une seule leçon a du texte');

  await db.execute({
    sql: `INSERT INTO assistant_kb(training_id,enabled,updated_at_ms) VALUES ('trn_1',1,?)`,
    args: [MAINTENANT],
  });
  const apres = await analyseAssistants(db, MAINTENANT);
  assert.equal(apres.baseDeConnaissances[0].associee, true);
  await db.close();
});
