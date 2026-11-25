import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  ajouterCommentaireCours,
  basculerReactionCours,
  ErreurSocialCours,
  lireCoursSocial,
} from '../lib/server/social.ts';

async function baseSociale() {
  const fichier = join(mkdtempSync(join(tmpdir(), 'davar-cours-social-')), 'test.db');
  const db = createClient({ url: pathToFileURL(fichier).href });
  await applyAllMigrations(db);
  await db.batch(
    [
      {
        sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,role,status,created_at_ms)
              VALUES ('student_awa','awa@davar.test','Awa Koné','test','student','active',1)`,
      },
      {
        sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,role,status,created_at_ms)
              VALUES ('student_jean','jean@davar.test','Jean Kouassi','test','student','active',1)`,
      },
      {
        sql: `INSERT INTO users(id,email_normalized,display_name,password_hash,role,status,created_at_ms)
              VALUES ('student_other','other@davar.test','Autre étudiant','test','student','active',1)`,
      },
      { sql: `INSERT INTO trainings(id,title,price_cfa,published) VALUES ('training_social','Formation sociale',1,1)` },
      { sql: `INSERT INTO course_modules(id,training_id,position,title) VALUES ('module_social','training_social',1,'Module social')` },
      {
        sql: `INSERT INTO course_lessons(id,module_id,position,title,kind) VALUES ('lesson_social','module_social',1,'Cours social','video')`,
      },
      {
        sql: `INSERT INTO enrollments(user_id,training_id,source,acquired_at_ms)
              VALUES ('student_awa','training_social','staff_grant',1),
                     ('student_jean','training_social','staff_grant',1)`,
      },
    ],
    'write'
  );
  return db;
}

test('les réactions du cours sont partagées, comptées par emoji et basculables par étudiant', async () => {
  const db = await baseSociale();
  await basculerReactionCours(db, 'student_awa', 'lesson_social', '🔥', 10);
  await basculerReactionCours(db, 'student_jean', 'lesson_social', '🔥', 11);
  await basculerReactionCours(db, 'student_jean', 'lesson_social', '❤️', 12);

  const vuParAwa = await lireCoursSocial(db, 'student_awa', 'lesson_social');
  assert.equal(vuParAwa.totalReactions, 3);
  assert.deepEqual(
    vuParAwa.reactions.filter((reaction) => reaction.total > 0),
    [
      { emoji: '❤️', total: 1, parMoi: false },
      { emoji: '🔥', total: 2, parMoi: true },
    ]
  );

  await basculerReactionCours(db, 'student_awa', 'lesson_social', '🔥', 13);
  const apresRetrait = await lireCoursSocial(db, 'student_jean', 'lesson_social');
  assert.equal(apresRetrait.totalReactions, 2);
  assert.equal(apresRetrait.reactions.find((reaction) => reaction.emoji === '🔥')?.parMoi, true);
  await db.close();
});

test('les commentaires sont publics, les réponses sont imbriquées et un étudiant non inscrit est refusé', async () => {
  const db = await baseSociale();
  const apresPublication = await ajouterCommentaireCours(db, 'student_awa', 'lesson_social', 'Un cours très utile.', null, 20);
  const racine = apresPublication.commentaires.find((commentaire) => commentaire.parentId === null);
  assert.ok(racine);

  const apresReponse = await ajouterCommentaireCours(
    db,
    'student_jean',
    'lesson_social',
    'Merci pour ce retour !',
    racine.id,
    21
  );
  assert.equal(apresReponse.totalCommentaires, 2);
  assert.equal(apresReponse.commentaires.find((commentaire) => commentaire.parentId === racine.id)?.auteur, 'Jean Kouassi');

  await assert.rejects(
    () => ajouterCommentaireCours(db, 'student_awa', 'lesson_social', 'Réponse imbriquée', apresReponse.commentaires.find((c) => c.parentId)?.id, 22),
    (error) => error instanceof ErreurSocialCours && error.code === 'invalid_parent'
  );
  assert.equal(await lireCoursSocial(db, 'student_other', 'lesson_social'), null);
  assert.equal((await db.execute('SELECT COUNT(*) AS n FROM notifications')).rows[0].n, 1);
  await db.close();
});
