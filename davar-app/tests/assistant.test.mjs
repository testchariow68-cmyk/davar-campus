/**
 * ASSISTANT VIRTUEL — les règles du propriétaire, verrouillées par des tests.
 * Exécution : npm test — base libSQL temporaire, aucun accès réseau.
 *
 * Ce qui est protégé ici :
 *   - la chaîne de secours : quota atteint → le moteur suivant prend le relais ;
 *   - la base de connaissances PAR FORMATION : aucune fuite d'une formation à l'autre ;
 *   - le plafond de questions par étudiant et par jour (protection des quotas gratuits) ;
 *   - la consigne du 7 octobre 2026 : ne pas répéter la leçon que l'étudiant vient d'écouter ;
 *   - les durées de conservation : 90 jours pour l'assistant, 12 mois pour le coach.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  moteurPersonnalisePret,
  chaineActive,
  compterQuestionEtudiant,
  contexteAutorise,
  definirAssociation,
  jourDe,
  lireConfig,
  limiteFournisseur,
  nomAssistant,
  promptSysteme,
  purgeApres,
  questionsRestantes,
} from '../lib/server/assistant.ts';
import { poserQuestionAuxFournisseurs } from '../lib/server/ai-providers.ts';
import { ajouterMessage, messagesDeConversation, ouvrirConversation } from '../lib/server/echanges.ts';
import { compterNonLues, listerNotifications, marquerLue, notifier } from '../lib/server/notifications.ts';
import { ecrireReglages, lireReglages } from '../lib/server/settings.ts';

process.env.APP_ENV = 'development';

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-assistant-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

async function preparer(db) {
  const maintenant = Date.now();
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES ('u-eleve','eleve@davar.test','Élève Réel','x',?,'student','active',?,0)`,
    args: [maintenant, maintenant],
  });
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('t-orateur','Devenir un excellent orateur',39900,'prd_test',1)`,
  });
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('t-autre','Une autre formation',1000,'prd_autre',1)`,
  });
  // Une vente vérifiée est une pièce comptable : l'inscription s'y rattache réellement.
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES ('sale_1','eleve@davar.test','t-orateur','39900','XOF',?)`,
    args: [maintenant],
  });
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms)
          VALUES ('u-eleve','t-orateur','verified_purchase','sale_1',?)`,
    args: [maintenant],
  });
  await db.execute({
    sql: `INSERT INTO course_modules(id,training_id,position,title,summary) VALUES ('m-1','t-orateur',1,'Vaincre le trac','Reconnaître le trac et le transformer.')`,
  });
  await db.execute({
    sql: `INSERT INTO course_lessons(id,module_id,position,title,kind,resource_url,duration_min,content_text)
          VALUES ('l-1','m-1',1,'Respirer avant de parler','video','https://exemple.test/v.mp4',8,'La respiration diaphragmatique calme le rythme cardiaque.')`,
  });
  await db.execute({
    sql: `INSERT INTO course_modules(id,training_id,position,title,summary) VALUES ('m-secret','t-autre',1,'Contenu d une autre formation','Ne doit jamais fuiter.')`,
  });
  await db.execute({
    sql: `INSERT INTO course_lessons(id,module_id,position,title,kind,duration_min,content_text)
          VALUES ('l-secret','m-secret',1,'Leçon privée','text',5,'Contenu réservé à une autre formation.')`,
  });
}

test('le nom affiché suit la règle du prototype : personnalisé, sinon celui du système', () => {
  assert.equal(nomAssistant({ displayName: 'Monsieur Koffi', defaultName: 'Monsieur Koffi' }), 'Monsieur Koffi');
  assert.equal(nomAssistant({ displayName: '  Coach IA Davar  ', defaultName: 'Monsieur Koffi' }), 'Coach IA Davar');
  assert.equal(nomAssistant({ displayName: '   ', defaultName: 'Monsieur Koffi' }), 'Monsieur Koffi');
});

test('la chaîne de secours : le premier disponible répond, un quota atteint passe la main', () => {
  const config = {
    id: 'principal',
    defaultName: 'Monsieur Koffi',
    displayName: '',
    hue: 265,
    photoKey: null,
    lang: 'fr',
    temperature: 0.4,
    primaryProvider: 'groq',
    chaine: ['groq', 'gemini', 'openrouter', 'hf'],
    modeles: {},
    limites: {},
    studentDailyCap: 30,
    transcription: 'browser-whisper',
    status: 'disconnected',
  };
  assert.deepEqual(chaineActive(config, {}), ['groq', 'gemini', 'openrouter', 'hf']);

  const groqEpuise = chaineActive(config, { groq: { requests: 1000, exhausted: false } });
  assert.deepEqual(groqEpuise, ['gemini', 'openrouter', 'hf'], 'le quota journalier atteint doit passer la main');

  const bascule = chaineActive(config, { groq: { requests: 10, exhausted: true } });
  assert.deepEqual(bascule, ['gemini', 'openrouter', 'hf'], 'un moteur marqué épuisé ne revient pas avant demain');

  const tous = chaineActive(config, {
    groq: { requests: 0, exhausted: false },
    gemini: { requests: 0, exhausted: true },
    openrouter: { requests: 0, exhausted: true },
    hf: { requests: 0, exhausted: true },
  });
  assert.deepEqual(tous, ['groq'], 'ce qui reste disponible reste disponible');
  assert.deepEqual(chaineActive(config, { groq: { requests: 0, exhausted: true } }), ['gemini', 'openrouter', 'hf']);

  const limitePersonnalisee = { ...config, limites: { groq: 5 } };
  assert.equal(limiteFournisseur(limitePersonnalisee, 'groq'), 5);
  assert.equal(limiteFournisseur(config, 'groq'), 1000);
  assert.deepEqual(chaineActive(limitePersonnalisee, { groq: { requests: 5, exhausted: false } }), ['gemini', 'openrouter', 'hf']);
});

test("la base de connaissances est isolée : jamais de fuite d'une formation non achetée", async () => {
  const db = await baseVide();
  await preparer(db);
  await definirAssociation(db, 't-orateur', true);
  await definirAssociation(db, 't-autre', true);

  const avant = await contexteAutorise(db, 'u-eleve', 't-orateur', 'm-1');
  assert.ok(avant, 'la formation achetée et associée doit être lisible');
  assert.equal(avant.formation, 'Devenir un excellent orateur');
  assert.ok(avant.lignes.join(' ').includes('Vaincre le trac'));
  assert.ok(avant.lignes.join(' ').includes('respiration diaphragmatique'), 'le texte de la leçon doit nourrir l’assistant');

  const autre = await contexteAutorise(db, 'u-eleve', 't-autre');
  assert.equal(autre, null, 'une formation non achetée ne doit JAMAIS être lisible');

  // Formation achetée mais NON associée à l'assistant : il n'en parle pas non plus.
  await definirAssociation(db, 't-orateur', false);
  assert.equal(await contexteAutorise(db, 'u-eleve', 't-orateur'), null, 'sans association, l’assistant se taet propose le coach');

  await definirAssociation(db, 't-orateur', true);
  assert.ok(await contexteAutorise(db, 'u-eleve', 't-orateur'));
});

test('le plafond par étudiant protège les quotas gratuits', async () => {
  const db = await baseVide();
  await preparer(db);
  const jour = jourDe(Date.now());
  assert.equal(await questionsRestantes(db, 'u-eleve', jour, 3), 3);
  await compterQuestionEtudiant(db, 'u-eleve', jour);
  await compterQuestionEtudiant(db, 'u-eleve', jour);
  assert.equal(await questionsRestantes(db, 'u-eleve', jour, 3), 1);
  await compterQuestionEtudiant(db, 'u-eleve', jour);
  assert.equal(await questionsRestantes(db, 'u-eleve', jour, 3), 0, 'plafond atteint : on le dit honnêtement');
  assert.equal(await questionsRestantes(db, 'u-eleve', jour, 30), 27, 'le plafond est bien celui de la configuration');
});

test('les consignes portent la demande du propriétaire : s’appuyer sur ses cours SANS les répéter', () => {
  const consignes = promptSysteme({
    nomAssistant: 'Monsieur Koffi',
    nomEtudiant: 'Élève Réel',
    langue: 'fr',
    formation: 'Devenir un excellent orateur',
    module: 'Vaincre le trac',
    contexte: '— Module : Vaincre le trac',
  });
  assert.ok(consignes.includes('Monsieur Koffi'));
  assert.ok(consignes.includes('Élève Réel'), 'l’assistant reçoit le nom de l’étudiant');
  assert.ok(consignes.includes('Devenir un excellent orateur'));
  assert.ok(consignes.includes('Vaincre le trac'));
  assert.ok(consignes.includes('EXCLUSIVEMENT'), 'il ne parle que des contenus fournis');
  assert.ok(consignes.includes('NE RÉPÈTES PAS'), 'il ne répète pas la leçon que l’étudiant vient d’écouter');
  assert.ok(consignes.includes('coach'), 'quand il ne sait pas, il renvoie au coach');
  assert.ok(!/groq|gemini|openrouter|hugging/i.test(consignes), 'jamais de nom de fournisseur dans les consignes');
});

test('la bascule réelle : le moteur en quota est écarté, le suivant répond', async () => {
  process.env.GROQ_API_KEY = 'cle-de-test';
  process.env.OPENROUTER_API_KEY = 'cle-de-test';
  const appels = [];
  const fetchSimule = async (url) => {
    appels.push(String(url));
    if (String(url).includes('groq')) {
      return new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), { status: 429 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Réponse du second moteur' } }] }), { status: 200 });
  };

  const { resultat, epuises } = await poserQuestionAuxFournisseurs({
    chaine: [
      { provider: 'groq', modele: 'modele-a', cleEnvironnement: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions' },
      { provider: 'openrouter', modele: 'modele-b', cleEnvironnement: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions' },
    ],
    question: 'Comment vaincre le trac ?',
    systeme: 'Consignes',
    temperature: 0.4,
    fetchImpl: fetchSimule,
  });

  assert.equal(resultat.ok, true);
  assert.equal(resultat.texte, 'Réponse du second moteur');
  assert.equal(resultat.provider, 'openrouter');
  assert.deepEqual(epuises, ['groq'], 'le moteur en quota est marqué pour la bascule du jour');
  assert.equal(appels.length, 2, 'le premier a été tenté, le second a pris le relais');

  const sansCle = await poserQuestionAuxFournisseurs({
    chaine: [{ provider: 'gemini', modele: 'x', cleEnvironnement: 'GEMINI_API_KEY', url: 'https://exemple.test' }],
    question: 'Test',
    systeme: 'Consignes',
    temperature: 0.4,
    fetchImpl: fetchSimule,
  });
  assert.equal(sansCle.resultat.ok, false);
  assert.equal(sansCle.resultat.raison, 'sans_cle');
});

test('les conversations gardent leurs durées : 90 jours pour l’assistant, 12 mois pour le coach', () => {
  const maintenant = Date.UTC(2026, 0, 1);
  const jours = (ms) => Math.round(ms / (24 * 60 * 60 * 1000));
  assert.equal(jours(purgeApres('ai', maintenant) - maintenant), 90);
  assert.equal(jours(purgeApres('coach', maintenant) - maintenant), 365);
});

test('une conversation reste lisible par son auteur, dans l’ordre', async () => {
  const db = await baseVide();
  await preparer(db);
  const id = await ouvrirConversation(db, { userId: 'u-eleve', formationId: 't-orateur', moduleId: 'm-1', mode: 'ai' });
  await ajouterMessage(db, { conversationId: id, auteur: 'student', texte: 'Ma question' }, Date.now());
  await ajouterMessage(db, { conversationId: id, auteur: 'ai', texte: 'La réponse', provider: 'groq', modele: 'm' }, Date.now() + 1);
  const fil = await messagesDeConversation(db, id);
  assert.deepEqual(
    fil.map((message) => message.auteur),
    ['student', 'ai']
  );
  assert.equal(fil[1].texte, 'La réponse');
  assert.equal(fil[1].provider, 'groq');
});

test('les notifications disparaissent 48 heures APRÈS leur lecture', async () => {
  const db = await baseVide();
  await preparer(db);
  const maintenant = Date.UTC(2026, 0, 1, 12, 0, 0);
  await notifier(db, { userId: 'u-eleve', titre: 'Bonjour' }, maintenant);
  assert.equal(await compterNonLues(db, 'u-eleve', maintenant), 1);

  const [notification] = await listerNotifications(db, 'u-eleve', maintenant);
  assert.equal(notification.lue, false);
  assert.ok(notification.expiresAtMs > maintenant + 59 * 24 * 60 * 60 * 1000, 'non lue : elle ne disparaît pas tout de suite');

  const marquee = await marquerLue(db, 'u-eleve', notification.id, maintenant);
  assert.equal(marquee, true);
  const apres = (await listerNotifications(db, 'u-eleve', maintenant))[0];
  assert.equal(apres.expiresAtMs, maintenant + 2 * 24 * 60 * 60 * 1000, 'lue : elle disparaît 48 h plus tard');
  assert.equal(await compterNonLues(db, 'u-eleve', maintenant), 0);
  assert.equal((await listerNotifications(db, 'u-eleve', maintenant + 3 * 24 * 60 * 60 * 1000)).length, 0, 'expirée : elle n’est plus listée');
});

test('les réglages du propriétaire ont ses vraies valeurs, et se modifient', async () => {
  const db = await baseVide();
  const defauts = await lireReglages(db);
  assert.ok(defauts['support.whatsapp'].startsWith('https://'));
  assert.equal(defauts['support.phone'], '+225 0585375999');
  assert.ok(defauts['support.email'].includes('@'));

  await ecrireReglages(db, { 'support.phone': '+225 07 00 00 00 00' });
  const apres = await lireReglages(db);
  assert.equal(apres['support.phone'], '+225 07 00 00 00 00');
  assert.equal(apres['support.email'], defauts['support.email'], 'les autres réglages ne bougent pas');
});

test('la configuration de l’assistant se lit et s’écrit, nom personnalisé compris', async () => {
  const db = await baseVide();
  const defauts = await lireConfig(db);
  assert.equal(defauts.defaultName, 'Monsieur Koffi');
  assert.equal(defauts.primaryProvider, 'groq');
  assert.deepEqual(defauts.chaine, ['groq', 'gemini', 'openrouter', 'hf']);
  assert.equal(defauts.studentDailyCap, 30);
});

/**
 * Le moteur « de votre choix » (ASSISTANT_CUSTOM_URL + ASSISTANT_CUSTOM_KEY)
 * n'était dans AUCUNE chaîne par défaut : on pouvait remplir ses deux variables
 * sans qu'il soit jamais appelé. Il rejoint désormais la chaîne dès qu'il est prêt.
 */
test('le moteur de votre choix rejoint la chaîne dès qu’il est prêt', () => {
  const config = {
    primaryProvider: 'groq',
    chaine: ['groq', 'gemini', 'openrouter', 'hf'],
    limites: {},
  };
  delete process.env.ASSISTANT_CUSTOM_URL;
  delete process.env.ASSISTANT_CUSTOM_KEY;
  assert.equal(moteurPersonnalisePret(), false, 'deux variables vides : rien à ajouter');
  assert.deepEqual(chaineActive(config, {}), ['groq', 'gemini', 'openrouter', 'hf']);

  // L'adresse sans la clé (ou l'inverse) : toujours rien, et c'est volontaire.
  process.env.ASSISTANT_CUSTOM_URL = 'https://api.exemple.test/v1/chat/completions';
  assert.equal(moteurPersonnalisePret(), false, 'il faut les DEUX');
  assert.deepEqual(chaineActive(config, {}), ['groq', 'gemini', 'openrouter', 'hf']);

  process.env.ASSISTANT_CUSTOM_KEY = 'cle-de-test';
  assert.equal(moteurPersonnalisePret(), true);
  assert.deepEqual(
    chaineActive(config, {}),
    ['groq', 'gemini', 'openrouter', 'hf', 'custom'],
    'en dernier recours : les moteurs gratuits d’abord, le sien ensuite'
  );

  // S'il a été choisi comme moteur principal, son rang est respecté : il n'est
  // pas rejeté en fin de chaîne par-dessus le réglage du propriétaire.
  const avecRang = { ...config, primaryProvider: 'custom', chaine: ['custom', 'groq', 'gemini'] };
  assert.deepEqual(chaineActive(avecRang, {}), ['custom', 'groq', 'gemini']);

  delete process.env.ASSISTANT_CUSTOM_URL;
  delete process.env.ASSISTANT_CUSTOM_KEY;
});
