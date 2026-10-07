/**
 * INVITATIONS ET TRANSFERT DE PROPRIÉTÉ — les décisions du propriétaire, verrouillées.
 * Exécution : npm test — base libSQL temporaire, aucun envoi d'e-mail réel.
 *
 * Ce qui est protégé ici :
 *   - une invitation se fait par e-mail, dure 7 jours (équipe) ou 3 jours (grâce) ;
 *   - aucun compte n'est créé par avance ;
 *   - le lien n'existe qu'en empreinte : on ne peut pas le relire depuis la base ;
 *   - un lien détourné vers une autre adresse ne vaut rien ;
 *   - une invitation ne s'applique qu'après confirmation de l'adresse ;
 *   - le transfert exige le mot de passe, la confirmation du nouveau propriétaire,
 *     et « ce n'était pas moi » annule et prévient le propriétaire.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAllMigrations } from './helpers/migrations.mjs';
import { hashPassword } from '../lib/server/auth-core.ts';
import {
  DUREE_JOURS,
  appliquerInvitations,
  creerInvitation,
  invitationDuToken,
  listerInvitations,
  marquerInvitationUtilisee,
  revoquerInvitation,
} from '../lib/server/invitations.ts';
import {
  DUREE_TRANSFERT_JOURS,
  annulerTransfert,
  confirmerTransfert,
  initierTransfert,
  lireTransfertParToken,
  refuserTransfert,
  transfertEnAttente,
} from '../lib/server/transfert.ts';

process.env.APP_ENV = 'development';

const JOUR = 86_400_000;
const MAINTENANT = 1_760_000_000_000;

async function baseVide() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-invitations-')), 'test.db');
  const db = createClient({ url: `file:${fichier}` });
  await applyAllMigrations(db);
  return db;
}

async function utilisateur(db, id, email, role = 'student', motDePasse = null) {
  const empreinte = motDePasse ? await hashPassword(motDePasse, 1000) : 'peu-importe';
  await db.execute({
    sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,role,status,created_at_ms)
          VALUES (?,?,?,?,?,?, 'active', ?)`,
    args: [id, email, `Nom ${id}`, empreinte, MAINTENANT, role, MAINTENANT],
  });
}

test('une invitation existe 7 jours pour l’équipe, 3 jours pour la grâce — jamais de compte par avance', async () => {
  const db = await baseVide();
  assert.equal(DUREE_JOURS.staff, 7);
  assert.equal(DUREE_JOURS.student_grace, 3);

  const equipe = await creerInvitation(
    db,
    { email: 'Coach@Davar.Test', kind: 'staff', roles: 'staff', createur: 'usr_proprietaire' },
    MAINTENANT
  );
  assert.equal(equipe.ok, true);
  assert.equal(equipe.invitation.email, 'coach@davar.test', 'l’adresse est normalisée');
  assert.equal(equipe.invitation.expiresAtMs, MAINTENANT + 7 * JOUR);
  assert.match(equipe.token, /^[A-Za-z0-9_-]{20,}$/);

  const grace = await creerInvitation(
    db,
    { email: 'etudiant@davar.test', kind: 'student_grace', createur: 'usr_proprietaire' },
    MAINTENANT
  );
  assert.equal(grace.ok, true);
  assert.equal(grace.invitation.expiresAtMs, MAINTENANT + 3 * JOUR);

  const comptes = await db.execute('SELECT COUNT(*) AS n FROM users');
  assert.equal(Number(comptes.rows[0].n), 0, 'aucun compte n’est créé par avance');

  // Le lien n'est jamais rangé en clair.
  const brut = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM invites WHERE instr(token_hash, ?) > 0',
    args: [equipe.token],
  });
  assert.equal(Number(brut.rows[0].n), 0);

  const enAttente = await listerInvitations(db, MAINTENANT);
  assert.equal(enAttente.length, 2);
  await db.close();
});

test('une adresse déjà inscrite ne s’invite pas — et une invitation expirée ne vaut plus rien', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_existant', 'deja@davar.test');
  const refus = await creerInvitation(db, { email: 'deja@davar.test', kind: 'staff', createur: 'usr_p' }, MAINTENANT);
  assert.equal(refus.ok, false);
  assert.equal(refus.erreur, 'compte_existant');

  const creation = await creerInvitation(db, { email: 'nouveau@davar.test', kind: 'staff', createur: 'usr_p' }, MAINTENANT);
  assert.equal(creation.ok, true);
  assert.equal(await invitationDuToken(db, creation.token, MAINTENANT + JOUR) !== null, true);
  assert.equal(await invitationDuToken(db, creation.token, MAINTENANT + 8 * JOUR), null, 'au-delà de 7 jours, plus rien');
  assert.equal(await invitationDuToken(db, 'jeton-invente-de-trente-caracteres', MAINTENANT), null);
  assert.equal((await listerInvitations(db, MAINTENANT + 8 * JOUR)).length, 0, 'une expirée n’est plus proposée');
  await db.close();
});

test('une invitation révoquée ou déjà utilisée ne fonctionne plus', async () => {
  const db = await baseVide();
  const a = await creerInvitation(db, { email: 'a@davar.test', kind: 'staff', createur: 'usr_p' }, MAINTENANT);
  assert.equal(await revoquerInvitation(db, a.invitation.id), true);
  assert.equal(await invitationDuToken(db, a.token, MAINTENANT), null);

  const b = await creerInvitation(db, { email: 'b@davar.test', kind: 'staff', createur: 'usr_p' }, MAINTENANT);
  await utilisateur(db, 'usr_b', 'b@davar.test');
  assert.equal(await marquerInvitationUtilisee(db, b.invitation.id, 'usr_b', MAINTENANT + 1000), true);
  assert.equal(await marquerInvitationUtilisee(db, b.invitation.id, 'usr_b', MAINTENANT + 2000), false, 'un lien ne sert qu’une fois');
  assert.equal(await invitationDuToken(db, b.token, MAINTENANT + 3000), null);
  await db.close();
});

test('l’invitation produit son effet APRÈS confirmation de l’adresse seulement', async () => {
  const db = await baseVide();
  await db.execute({
    sql: `INSERT INTO trainings(id,title,price_cfa,published) VALUES ('trn_1','Devenir un excellent orateur',39900,1)`,
    args: [],
  });

  const grace = await creerInvitation(
    db,
    { email: 'invite@davar.test', kind: 'student_grace', trainingId: 'trn_1', createur: 'usr_p' },
    MAINTENANT
  );
  const equipe = await creerInvitation(db, { email: 'coach@davar.test', kind: 'staff', createur: 'usr_p' }, MAINTENANT);

  await utilisateur(db, 'usr_invite', 'invite@davar.test');
  await utilisateur(db, 'usr_coach', 'coach@davar.test');
  await marquerInvitationUtilisee(db, grace.invitation.id, 'usr_invite', MAINTENANT + JOUR);
  await marquerInvitationUtilisee(db, equipe.invitation.id, 'usr_coach', MAINTENANT + JOUR);

  const effet = await appliquerInvitations(db, 'usr_invite', MAINTENANT + JOUR);
  assert.deepEqual(effet.formations, ['trn_1'], 'la formation offerte est ouverte');
  const acces = await db.execute("SELECT source FROM enrollments WHERE user_id = 'usr_invite'");
  assert.equal(String(acces.rows[0].source), 'staff_grant', 'un accès gracieux n’est pas une vente');

  const role = await appliquerInvitations(db, 'usr_coach', MAINTENANT + JOUR);
  assert.equal(role.role, 'staff');
  const coach = await db.execute("SELECT role FROM users WHERE id = 'usr_coach'");
  assert.equal(String(coach.rows[0].role), 'staff');

  // Repasser ne double rien.
  const encore = await appliquerInvitations(db, 'usr_invite', MAINTENANT + 2 * JOUR);
  assert.deepEqual(encore.formations, [], 'l’acces ne s’ouvre pas deux fois');
  const total = await db.execute('SELECT COUNT(*) AS n FROM enrollments');
  assert.equal(Number(total.rows[0].n), 1);
  await db.close();
});

test('le transfert exige le bon mot de passe, et n’est effectif qu’après confirmation', async () => {
  const db = await baseVide();
  assert.equal(DUREE_TRANSFERT_JOURS, 7);
  await utilisateur(db, 'usr_proprietaire', 'proprietaire@davar.test', 'admin', 'MotDePasse!2026');
  await utilisateur(db, 'usr_repreneur', 'repreneur@davar.test');

  const mauvais = await initierTransfert(
    db,
    { acteurId: 'usr_proprietaire', acteurEmail: 'proprietaire@davar.test', emailCible: 'repreneur@davar.test', motDePasse: 'faux' },
    MAINTENANT
  );
  assert.equal(mauvais.ok, false);
  assert.equal(mauvais.erreur, 'mot_de_passe_incorrect');
  assert.equal(await transfertEnAttente(db, MAINTENANT), null);

  const soi = await initierTransfert(
    db,
    { acteurId: 'usr_proprietaire', acteurEmail: 'proprietaire@davar.test', emailCible: 'proprietaire@davar.test', motDePasse: 'MotDePasse!2026' },
    MAINTENANT
  );
  assert.equal(soi.ok, false);
  assert.equal(soi.erreur, 'deja_proprietaire');

  const initiation = await initierTransfert(
    db,
    { acteurId: 'usr_proprietaire', acteurEmail: 'proprietaire@davar.test', emailCible: 'repreneur@davar.test', motDePasse: 'MotDePasse!2026' },
    MAINTENANT
  );
  assert.equal(initiation.ok, true);
  const enAttente = await transfertEnAttente(db, MAINTENANT);
  assert.equal(enAttente.versEmail, 'repreneur@davar.test');
  assert.equal((await db.execute("SELECT role FROM users WHERE id='usr_proprietaire'")).rows[0].role, 'admin', 'pas encore transféré');
  assert.equal((await db.execute("SELECT role FROM users WHERE id='usr_repreneur'")).rows[0].role, 'student');

  const lien = await lireTransfertParToken(db, initiation.token, MAINTENANT + JOUR);
  assert.equal(lien.de, 'proprietaire@davar.test');
  assert.equal(await lireTransfertParToken(db, initiation.token, MAINTENANT + 8 * JOUR), null, 'au-delà de 7 jours, plus rien');

  const confirmation = await confirmerTransfert(db, initiation.token, MAINTENANT + 2 * JOUR);
  assert.equal(confirmation.ok, true);
  assert.equal((await db.execute("SELECT role FROM users WHERE id='usr_repreneur'")).rows[0].role, 'admin');
  assert.equal((await db.execute("SELECT role FROM users WHERE id='usr_proprietaire'")).rows[0].role, 'staff', 'reste membre de l’équipe');
  assert.equal(await transfertEnAttente(db, MAINTENANT + 3 * JOUR), null);

  const secondeFois = await confirmerTransfert(db, initiation.token, MAINTENANT + 3 * JOUR);
  assert.equal(secondeFois.ok, false, 'un lien de transfert ne sert qu’une fois');
  await db.close();
});

test('« ce n’était pas moi » annule le transfert ET prévient le propriétaire', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_proprietaire', 'proprietaire@davar.test', 'admin', 'MotDePasse!2026');
  await utilisateur(db, 'usr_voisin', 'voisin@davar.test');

  const initiation = await initierTransfert(
    db,
    { acteurId: 'usr_proprietaire', acteurEmail: 'proprietaire@davar.test', emailCible: 'voisin@davar.test', motDePasse: 'MotDePasse!2026' },
    MAINTENANT
  );
  assert.equal(initiation.ok, true);

  const refus = await refuserTransfert(db, initiation.token, MAINTENANT + JOUR);
  assert.equal(refus.ok, true);
  assert.equal(refus.proprietairePrevenu, true);

  const alertes = await db.execute("SELECT title FROM notifications WHERE user_id = 'usr_proprietaire'");
  assert.equal(alertes.rows.length, 1, 'le propriétaire est averti tout de suite');
  assert.match(String(alertes.rows[0].title), /transfert/i);
  assert.equal(await transfertEnAttente(db, MAINTENANT + 2 * JOUR), null);
  assert.equal((await confirmerTransfert(db, initiation.token, MAINTENANT + 2 * JOUR)).ok, false);
  assert.equal((await db.execute("SELECT role FROM users WHERE id='usr_proprietaire'")).rows[0].role, 'admin', 'personne n’a bougé');
  await db.close();
});

test('le propriétaire peut annuler un transfert qu’il regrette', async () => {
  const db = await baseVide();
  await utilisateur(db, 'usr_proprietaire', 'proprietaire@davar.test', 'admin', 'MotDePasse!2026');
  await utilisateur(db, 'usr_voisin', 'voisin@davar.test');
  const initiation = await initierTransfert(
    db,
    { acteurId: 'usr_proprietaire', acteurEmail: 'proprietaire@davar.test', emailCible: 'voisin@davar.test', motDePasse: 'MotDePasse!2026' },
    MAINTENANT
  );
  assert.equal(await annulerTransfert(db, initiation.transfert.id), true);
  assert.equal(await annulerTransfert(db, initiation.transfert.id), false);
  assert.equal(await transfertEnAttente(db, MAINTENANT + 1000), null);
  await db.close();
});
