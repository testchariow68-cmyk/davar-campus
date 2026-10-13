/**
 * CYCLE DE VIE — les règles de conservation du propriétaire, verrouillées.
 * Exécution : npm test — base libSQL temporaire, aucun accès réseau.
 *
 * Ce qui est protégé ici :
 *   - AUCUNE purge automatique : sans geste explicite, rien n'est écrit ;
 *   - les durées sont celles du prototype (90 jours, 12 mois, 48 h, 180 jours…) ;
 *   - un devoir en attente de correction n'est jamais effacé ;
 *   - un compte ne s'efface pas au premier passage : 12 mois sans nouvelle
 *     acquisition, puis 7 jours de quarantaine, puis effacement de l'identité ;
 *   - une exception (devoir à corriger, certificat en cours) annule la purge ;
 *   - le registre de certification survit, non identifiable ;
 *   - les ventes et les accès ne sont jamais purgés : c'est une pièce comptable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  CONFIG_CYCLE_DE_VIE,
  POLITIQUES,
  comptesEligibles,
  deciderQuarantaine,
  effacerIdentite,
  etatCycleDeVie,
  executerCycleDeVie,
  journalDePurge,
} from '../lib/server/cycle-de-vie.ts';

process.env.APP_ENV = 'development';

const JOUR = 86_400_000;

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-cycle-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

async function utilisateur(db, id, role = 'student', isTest = 0) {
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms,is_test)
          VALUES (?,?,?,?,?,?, 'active', ?, ?)`,
    args: [id, `${id}@davar.test`, `Nom ${id}`, 'peu-importe', Date.now(), role, Date.now(), isTest],
  });
}

async function formation(db, id, titre = 'Devenir un excellent orateur') {
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES (?,?,39900,?,1)`,
    args: [id, titre, `prd_${id}`],
  });
}

async function incription(db, userId, trainingId, atMs) {
  await db.execute({
    sql: `INSERT INTO verified_purchases(sale_id,buyer_email_normalized,training_id,amount_value_text,currency,verified_at_ms)
          VALUES (?,?,?,'70.57','USD',?)`,
    args: [`sale_${userId}_${trainingId}`, `${userId}@davar.test`, trainingId, atMs],
  });
  await db.execute({
    sql: `INSERT INTO enrollments(user_id,training_id,source,sale_id,acquired_at_ms)
          VALUES (?,?,'verified_purchase',?,?)`,
    args: [userId, trainingId, `sale_${userId}_${trainingId}`, atMs],
  });
}

test('la matrice des politiques est celle du prototype, et les durées aussi', () => {
  assert.equal(CONFIG_CYCLE_DE_VIE.aiConvDays, 90);
  assert.equal(CONFIG_CYCLE_DE_VIE.coachConvMonths, 12);
  assert.equal(CONFIG_CYCLE_DE_VIE.notifReadHours, 48);
  assert.equal(CONFIG_CYCLE_DE_VIE.notifMaxDays, 180);
  assert.equal(CONFIG_CYCLE_DE_VIE.techLogDays, 90);
  assert.equal(CONFIG_CYCLE_DE_VIE.accountGraceMonths, 12);
  assert.equal(CONFIG_CYCLE_DE_VIE.quarantineDays, 7);
  assert.equal(CONFIG_CYCLE_DE_VIE.abandonedHours, 24);

  const classes = POLITIQUES.map(([classe]) => classe);
  assert.ok(classes.some((classe) => classe.startsWith('Notifications lues')));
  assert.ok(POLITIQUES.some(([, regle]) => regle.includes('48 heures')));
  assert.ok(POLITIQUES.some(([classe]) => classe === 'Statistiques anonymisées'));
});

test('sans geste explicite, RIEN n’est purgé — même quand tout a expiré', async () => {
  const db = await baseVide();
  const maintenant = 2_000_000_000_000;
  await utilisateur(db, 'usr_1');
  await db.execute({
    sql: `INSERT INTO sessions(token_hash,user_id,created_at_ms,expires_at_ms) VALUES ('jeton','usr_1',?,?)`,
    args: [maintenant - 10 * JOUR, maintenant - 9 * JOUR],
  });
  await db.execute({
    sql: `INSERT INTO email_tokens(token_hash,user_id,purpose,created_at_ms,expires_at_ms,used_at_ms)
          VALUES ('code','usr_1','verify_email',?,?,NULL)`,
    args: [maintenant - 10 * JOUR, maintenant - 9 * JOUR],
  });
  await db.execute({
    sql: `INSERT INTO notifications(id,user_id,kind,title,created_at_ms,read_at_ms,expires_at_ms)
          VALUES ('notif','usr_1','system','Bienvenue',?,?,?)`,
    args: [maintenant - 10 * JOUR, maintenant - 9 * JOUR, maintenant + JOUR],
  });

  const etat = await etatCycleDeVie(db, maintenant);
  assert.equal(etat.sessionsExpirees, 1);
  assert.equal(etat.jetonsExpires, 1);
  assert.equal(etat.notificationsLues, 1);
  assert.equal(etat.actif, false, 'le passage périodique est en pause par défaut');

  const resultat = await executerCycleDeVie(db, { maintenant });
  assert.equal(resultat.applique, false);
  assert.equal((await journalDePurge(db)).length, 0, 'aucune ligne de journal sans geste');

  const restant = await db.execute('SELECT COUNT(*) AS n FROM sessions');
  assert.equal(Number(restant.rows[0].n), 1, 'la session expirée est toujours là');
  await db.close();
});

test('un passage explicite purge les catégories sûres, et se journalise', async () => {
  const db = await baseVide();
  const maintenant = 2_000_000_000_000;
  await utilisateur(db, 'usr_1');
  await db.execute({
    sql: `INSERT INTO sessions(token_hash,user_id,created_at_ms,expires_at_ms) VALUES ('vieux','usr_1',?,?)`,
    args: [maintenant - 10 * JOUR, maintenant - 5 * JOUR],
  });
  await db.execute({
    sql: `INSERT INTO sessions(token_hash,user_id,created_at_ms,expires_at_ms) VALUES ('vivant','usr_1',?,?)`,
    args: [maintenant - JOUR, maintenant + 5 * JOUR],
  });
  await db.execute({
    sql: `INSERT INTO notifications(id,user_id,kind,title,created_at_ms,read_at_ms,expires_at_ms)
          VALUES ('lue','usr_1','system','Lue il y a longtemps',?,?,?)`,
    args: [maintenant - 3 * JOUR, maintenant - 3 * JOUR, maintenant + 10 * JOUR],
  });
  await db.execute({
    sql: `INSERT INTO notifications(id,user_id,kind,title,created_at_ms,read_at_ms,expires_at_ms)
          VALUES ('neuve','usr_1','system','Non lue',?,NULL,?)`,
    args: [maintenant - JOUR, maintenant + 10 * JOUR],
  });
  await db.execute({
    sql: `INSERT INTO conversations(id,user_id,mode,resolved,ai_validated,created_at_ms,updated_at_ms,purge_after_ms)
          VALUES ('conv_ia','usr_1','ai',0,0,?,?,?)`,
    args: [maintenant - 120 * JOUR, maintenant - 100 * JOUR, maintenant - 10 * JOUR],
  });
  await db.execute({
    sql: `INSERT INTO conversation_messages(id,conversation_id,author,text,at_ms)
          VALUES ('msg_1','conv_ia','student','Une question',?)`,
    args: [maintenant - 100 * JOUR],
  });
  await db.execute({
    sql: `INSERT INTO conversations(id,user_id,mode,resolved,ai_validated,created_at_ms,updated_at_ms,purge_after_ms)
          VALUES ('conv_coach','usr_1','coach',0,0,?,?,?)`,
    args: [maintenant - 500 * JOUR, maintenant - 400 * JOUR, maintenant + JOUR],
  });
  await db.execute({
    sql: `INSERT INTO conversation_messages(id,conversation_id,author,text,at_ms)
          VALUES ('msg_2','conv_coach','coach','Un conseil',?)`,
    args: [maintenant - 400 * JOUR],
  });

  const resultat = await executerCycleDeVie(db, { appliquer: true, acteur: 'usr_proprietaire', maintenant });
  assert.equal(resultat.applique, true);

  const sessions = await db.execute('SELECT token_hash FROM sessions');
  assert.deepEqual(sessions.rows.map((row) => String(row.token_hash)), ['vivant'], 'seule la session expirée disparaît');

  const notifications = await db.execute('SELECT id FROM notifications');
  assert.deepEqual(notifications.rows.map((row) => String(row.id)), ['neuve'], 'lue depuis plus de 48 h : disparue');

  const conversations = await db.execute('SELECT id FROM conversations');
  assert.deepEqual(conversations.rows.map((row) => String(row.id)), [], 'IA 90 jours et coach 12 mois : purgées');
  const messages = await db.execute('SELECT COUNT(*) AS n FROM conversation_messages');
  assert.equal(Number(messages.rows[0].n), 0);

  const journal = await journalDePurge(db);
  assert.ok(journal.some((ligne) => ligne.kind === 'SESSIONS'));
  assert.ok(journal.some((ligne) => ligne.kind === 'CONVERSATIONS_IA'));
  assert.ok(journal.some((ligne) => ligne.kind === 'CONVERSATIONS_COACH'));
  assert.ok(
    journal.every((ligne) => !/Nom usr|davar\.test/.test(ligne.detail)),
    'le journal de purge ne contient JAMAIS un nom ou une adresse'
  );

  const stats = await db.execute("SELECT value FROM app_settings WHERE key = 'stats.anonymes.conversationsIa'");
  assert.equal(String(stats.rows[0].value), '1', 'les statistiques anonymisées survivent');
  await db.close();
});

test('une conversation coach résolue (litige) est conservée — c’est l’exception du prototype', async () => {
  const db = await baseVide();
  const maintenant = 2_000_000_000_000;
  await utilisateur(db, 'usr_1');
  for (const [id, resolved] of [['conv_litige', 1], ['conv_oubliee', 0]]) {
    await db.execute({
      sql: `INSERT INTO conversations(id,user_id,mode,resolved,ai_validated,created_at_ms,updated_at_ms,purge_after_ms)
            VALUES (?, 'usr_1','coach',?,0,?,?,?)`,
      args: [id, resolved, maintenant - 500 * JOUR, maintenant - 400 * JOUR, maintenant + JOUR],
    });
  }
  await executerCycleDeVie(db, { appliquer: true, maintenant });
  const restantes = await db.execute('SELECT id FROM conversations ORDER BY id');
  assert.deepEqual(restantes.rows.map((row) => String(row.id)), ['conv_litige']);
  await db.close();
});

test('un compte ne s’efface pas au premier passage : 12 mois, puis 7 jours de quarantaine', async () => {
  const db = await baseVide();
  const maintenant = 2_000_000_000_000;
  await utilisateur(db, 'usr_termine');
  await formation(db, 'trn_1');
  await incription(db, 'usr_termine', 'trn_1', maintenant - 13 * 30 * JOUR);

  const eligibles = await comptesEligibles(db, maintenant);
  assert.equal(eligibles.length, 1, 'terminé + 12 mois sans nouvelle acquisition');

  // Premier passage : quarantaine, jamais d'effacement.
  await executerCycleDeVie(db, { appliquer: true, maintenant });
  let utilisateurs = await db.execute('SELECT display_name FROM users WHERE id = ?', ['usr_termine']);
  assert.equal(String(utilisateurs.rows[0].display_name), 'Nom usr_termine', 'l’identité est intacte');
  const quarantaine = await db.execute('SELECT at_ms, executed_at_ms FROM purge_pending WHERE user_id = ?', ['usr_termine']);
  assert.equal(quarantaine.rows.length, 1);
  assert.equal(quarantaine.rows[0].executed_at_ms, null);

  // Deuxième passage, dans les 7 jours : toujours rien.
  await executerCycleDeVie(db, { appliquer: true, maintenant: maintenant + 2 * JOUR });
  utilisateurs = await db.execute('SELECT display_name FROM users WHERE id = ?', ['usr_termine']);
  assert.equal(String(utilisateurs.rows[0].display_name), 'Nom usr_termine');

  // Troisième passage, après les 7 jours : l'identité s'efface.
  await executerCycleDeVie(db, { appliquer: true, maintenant: maintenant + 8 * JOUR });
  utilisateurs = await db.execute('SELECT display_name, email_normalized FROM users WHERE id = ?', ['usr_termine']);
  assert.equal(String(utilisateurs.rows[0].display_name), 'Compte terminé');
  assert.match(String(utilisateurs.rows[0].email_normalized), /^compte-efface\+/);

  const journal = await journalDePurge(db);
  assert.ok(journal.some((ligne) => ligne.result === 'PURGE_PENDING'), 'la quarantaine est notée');
  assert.ok(journal.some((ligne) => ligne.result === 'PURGE_EXECUTED'), 'l’effacement est noté');

  // Une vente est une pièce comptable : elle survit.
  const ventes = await db.execute('SELECT COUNT(*) AS n FROM verified_purchases');
  assert.equal(Number(ventes.rows[0].n), 1, 'la vente survit à l’effacement du compte');
  await db.close();
});

test('une exception annule la purge — un devoir en attente protège l’étudiant', async () => {
  const db = await baseVide();
  const maintenant = 2_000_000_000_000;
  await utilisateur(db, 'usr_avec_devoir');
  await formation(db, 'trn_1');
  await incription(db, 'usr_avec_devoir', 'trn_1', maintenant - 13 * 30 * JOUR);

  await db.execute({
    sql: `INSERT INTO course_modules(id,training_id,position,title) VALUES ('mod_1','trn_1',1,'Module')`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO course_lessons(id,module_id,position,title,kind) VALUES ('lec_1','mod_1',1,'Leçon','video')`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO lesson_assessments(id,lesson_id,title,min_score,requires_review,created_at_ms)
          VALUES ('ass_1','lec_1','Évaluation',80,1,?)`,
    args: [maintenant - 400 * JOUR],
  });
  await db.execute({
    sql: `INSERT INTO submissions(id,user_id,assessment_id,training_id,note,status,at_ms)
          VALUES ('sub_1','usr_avec_devoir','ass_1','trn_1','Mon travail','pending',?)`,
    args: [maintenant - 10 * JOUR],
  });

  const eligibles = await comptesEligibles(db, maintenant);
  assert.equal(eligibles.length, 0, 'un devoir à corriger protège le compte');

  const resultat = await executerCycleDeVie(db, { appliquer: true, maintenant });
  assert.equal(resultat.rapport.devoirsEnAttente, 1);
  const devoirs = await db.execute('SELECT status FROM submissions');
  assert.equal(String(devoirs.rows[0].status), 'pending', 'le travail de l’étudiant reste');

  // Si le propriétaire a ouvert la quarantaine à la main, il peut la suspendre.
  await db.execute({
    sql: `INSERT INTO purge_pending(id,user_id,reason,hold,at_ms) VALUES ('pp_1','usr_avec_devoir','test',0,?)`,
    args: [maintenant - 30 * JOUR],
  });
  assert.equal(await deciderQuarantaine(db, 'usr_avec_devoir', 'suspendre', maintenant), true);
  await executerCycleDeVie(db, { appliquer: true, maintenant });
  const identite = await db.execute('SELECT display_name FROM users WHERE id = ?', ['usr_avec_devoir']);
  assert.equal(String(identite.rows[0].display_name), 'Nom usr_avec_devoir', 'suspendue à la main : rien ne s’efface');
  await db.close();
});

test('un compte de test n’est jamais concerné par la purge', async () => {
  const db = await baseVide();
  const maintenant = 2_000_000_000_000;
  await utilisateur(db, 'usr_vue_test', 'student', 1);
  await formation(db, 'trn_1');
  await incription(db, 'usr_vue_test', 'trn_1', maintenant - 13 * 30 * JOUR);

  assert.deepEqual(await comptesEligibles(db, maintenant), []);
  await db.close();
});

test('effacer une identité ne touche ni le certificat, ni la vente, ni les statistiques', async () => {
  const db = await baseVide();
  const maintenant = 2_000_000_000_000;
  await utilisateur(db, 'usr_1');
  await formation(db, 'trn_1');
  await incription(db, 'usr_1', 'trn_1', maintenant - 400 * JOUR);
  await db.execute({
    sql: `INSERT INTO certificates(id,code,user_id,training_id,holder_name,formation_title,issued_at_ms,status)
          VALUES ('cert_1','DAV-2025-0001','usr_1','trn_1','Nom usr_1','Devenir un excellent orateur',?,'active')`,
    args: [maintenant - 390 * JOUR],
  });

  assert.equal(await effacerIdentite(db, 'usr_1', maintenant), true);
  assert.equal(await effacerIdentite(db, 'usr_1', maintenant), false, 'on n’efface pas deux fois');

  const certificats = await db.execute('SELECT holder_name, status FROM certificates WHERE id = ' + "'cert_1'");
  assert.equal(String(certificats.rows[0].holder_name), 'Nom usr_1', 'le registre de certification survit, figé');
  assert.equal(String(certificats.rows[0].status), 'active');

  const ventes = await db.execute('SELECT COUNT(*) AS n FROM verified_purchases');
  assert.equal(Number(ventes.rows[0].n), 1);
  const comptes = await db.execute("SELECT value FROM app_settings WHERE key = 'stats.anonymes.comptesEffaces'");
  assert.equal(String(comptes.rows[0].value), '1', 'une statistique anonymisée, pas un nom');
  await db.close();
});
