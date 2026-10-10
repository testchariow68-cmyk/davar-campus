/**
 * L'ÉQUIPE ET SES RÔLES — « Chaque membre du staff voit uniquement ce dont il a
 * besoin » (règle du prototype, `staffAccess()`).
 * Exécution : npm test — base libSQL temporaire, aucun réseau.
 *
 * Protégé ici :
 *   - chaque rôle ouvre EXACTEMENT son périmètre, et rien d'autre ;
 *   - un membre sans rôle ne voit que sa vue d'ensemble ;
 *   - le propriétaire ouvre tout ;
 *   - l'écriture suit le rôle : le coach répond, le correcteur décide, le
 *     responsable de contenu et le support ne décident pas les devoirs ;
 *   - un rôle inventé est refusé, et les rôles se retirent sans résidu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { definirRolesEquipe, listerEquipe } from '../lib/server/direction.ts';
import { appliquerInvitations, creerInvitation, marquerInvitationUtilisee } from '../lib/server/invitations.ts';
import { lireRoles, normaliserRoles, peutEcrire, sectionsPour } from '../lib/server/equipe.ts';

process.env.APP_ENV = 'development';
const MAINTENANT = 1_760_000_000_000;

async function baseAvecEquipe() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-equipe-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  for (const [id, email, role] of [
    ['usr_proprio', 'direction@davar.test', 'admin'],
    ['usr_staff', 'membre@davar.test', 'staff'],
    ['usr_etudiant', 'etudiant@davar.test', 'student'],
  ]) {
    await db.execute({
      sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms)
            VALUES (?,?,?,'peu-importe',?,?,'active',?)`,
      args: [id, email, `Nom ${id}`, MAINTENANT, role, MAINTENANT],
    });
  }
  return db;
}

test('chaque rôle ouvre son périmètre, et rien de plus', () => {
  const coach = sectionsPour(['coach']);
  assert.deepEqual(coach, ['accueil', 'devoirs', 'etudiants', 'conversations'], 'l’ordre est celui de la navigation');
  assert.ok(!coach.includes('reglages'), 'le coach ne touche pas aux réglages');
  assert.ok(!coach.includes('exports'), 'le coach n’exporte pas les données');

  assert.deepEqual(sectionsPour(['support']), ['accueil', 'conversations']);
  assert.deepEqual(sectionsPour(['correcteur']), ['accueil', 'devoirs', 'conversations']);
  assert.deepEqual(
    sectionsPour(['analyste']),
    ['accueil', 'analytics', 'sante', 'assistants', 'badges', 'activite'],
    'l’analyste reçoit les écrans d’analyse du prototype — et rien d’autre'
  );
  assert.deepEqual(sectionsPour(['contenu']), ['accueil', 'formations', 'ressources', 'devoirs']);

  const manager = sectionsPour(['manager']);
  assert.ok(manager.includes('equipe') && manager.includes('cycle'));
  assert.ok(manager.includes('analytics') && manager.includes('ventes'), 'le manager tient les chiffres et les ventes');
  assert.ok(!manager.includes('sante') && !manager.includes('assistants'), 'les écrans d’analyse restent à l’analyste');
  assert.ok(!manager.includes('reglages') && !manager.includes('emails'), 'les gestes du propriétaire restent au propriétaire');
  assert.ok(!manager.includes('assistant'), 'la personnalité de l’assistant reste au propriétaire');

  // Deux rôles cumulés : les périmètres s'additionnent, sans doublon.
  const mixte = sectionsPour(['support', 'contenu']);
  assert.deepEqual(mixte, ['accueil', 'formations', 'ressources', 'devoirs', 'conversations']);
  assert.deepEqual(sectionsPour([]), ['accueil'], 'sans rôle : la vue d’ensemble seulement');
});

test('l’écriture suit le rôle : on ne décide pas ce qu’on n’a pas à décider', () => {
  assert.equal(peutEcrire(['coach'], 'repondre-conversation'), true);
  assert.equal(peutEcrire(['coach'], 'decider-devoir'), false, 'le coach répond, il ne note pas');
  assert.equal(peutEcrire(['correcteur'], 'decider-devoir'), true);
  assert.equal(peutEcrire(['correcteur'], 'repondre-conversation'), false);
  assert.equal(peutEcrire(['assistant'], 'decider-devoir'), true);
  assert.equal(peutEcrire(['contenu'], 'decider-devoir'), false);
  assert.equal(peutEcrire(['support'], 'decider-devoir'), false);
  assert.equal(peutEcrire(['manager'], 'valider-conversation'), true);
  assert.equal(peutEcrire(['coach'], 'valider-conversation'), false, 'valider la réponse de l’assistant est une supervision');
});

test('normaliserRoles refuse l’inventé et range dans l’ordre du prototype', () => {
  assert.deepEqual(normaliserRoles('manager,coach'), ['coach', 'manager']);
  assert.deepEqual(normaliserRoles('COACH ;  coach ,inconnu, correcteur'), ['coach', 'correcteur']);
  assert.deepEqual(normaliserRoles(''), []);
  assert.deepEqual(normaliserRoles(null), []);
});

test('l’invitation porte les rôles : ils s’ouvrent à la confirmation de l’adresse', async () => {
  const db = await baseAvecEquipe();
  const creation = await creerInvitation(
    db,
    { email: 'nouvelle@davar.test', kind: 'staff', roles: 'coach,support', createur: 'usr_proprio' },
    MAINTENANT
  );
  assert.equal(creation.ok, true);

  // La personne crée son compte puis confirme son adresse : c'est le geste d'acceptation.
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms)
          VALUES ('usr_nouvelle','nouvelle@davar.test','Nouvelle','peu-importe',?,'student','active',?)`,
    args: [MAINTENANT, MAINTENANT],
  });
  await marquerInvitationUtilisee(db, creation.invitation.id, 'usr_nouvelle', MAINTENANT);
  const effet = await appliquerInvitations(db, 'usr_nouvelle', MAINTENANT);

  assert.equal(effet.role, 'staff', 'la personne devient membre de l’équipe');
  assert.deepEqual(await lireRoles(db, 'usr_nouvelle'), ['coach', 'support']);
  const ligne = await db.execute("SELECT role FROM users WHERE id = 'usr_nouvelle'");
  assert.equal(String(ligne.rows[0].role), 'staff');
  await db.close();
});

test('les rôles se posent en base, se lisent, et se retirent sans résidu', async () => {
  const db = await baseAvecEquipe();
  const pose = await definirRolesEquipe(db, 'membre@davar.test', 'coach,support');
  assert.equal(pose.ok, true);
  assert.deepEqual(pose.roles, ['coach', 'support']);
  assert.deepEqual(await lireRoles(db, 'usr_staff'), ['coach', 'support']);

  const equipe = await listerEquipe(db);
  const membre = equipe.find((ligne) => ligne.email === 'membre@davar.test');
  assert.equal(membre.roles, 'coach,support');

  const inconnu = await definirRolesEquipe(db, 'membre@davar.test', 'coach,chef-de-guerre');
  assert.equal(inconnu.ok, false);
  assert.equal(inconnu.erreur, 'role_inconnu');
  assert.deepEqual(await lireRoles(db, 'usr_staff'), ['coach', 'support'], 'un refus ne change rien');

  const retrait = await definirRolesEquipe(db, 'membre@davar.test', '');
  assert.equal(retrait.ok, true);
  assert.deepEqual(await lireRoles(db, 'usr_staff'), [], 'retirer le dernier rôle laisse la vue d’ensemble');

  const pasStaff = await definirRolesEquipe(db, 'etudiant@davar.test', 'coach');
  assert.equal(pasStaff.ok, false);
  assert.equal(pasStaff.erreur, 'role_inchange', 'on ne donne pas de rôle à qui n’est pas membre du staff');

  const inconnuAdresse = await definirRolesEquipe(db, 'personne@davar.test', 'coach');
  assert.equal(inconnuAdresse.ok, false);
  assert.equal(inconnuAdresse.erreur, 'compte_introuvable');
  await db.close();
});
