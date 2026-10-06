"""Contrats de schéma locaux de la migration 002 ; aucun accès Turso distant."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
MIGRATIONS = [
    ROOT / 'turso' / 'migrations' / '001_core.sqlite.sql',
    ROOT / 'turso' / 'migrations' / '002_auth_campus.sqlite.sql',
]


class AuthSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in MIGRATIONS:
            self.db.executescript(migration.read_text(encoding='utf-8'))

    def tearDown(self):
        self.db.close()

    def test_migration_002_is_additive_only(self):
        sql = MIGRATIONS[1].read_text(encoding='utf-8').lower()
        statements = '\n'.join(
            line for line in sql.splitlines() if not line.lstrip().startswith('--')
        )
        for forbidden in ('drop table', 'drop index', 'truncate', 'delete from',
                          'cinetpay', 'supabase', 'pragma writable_schema'):
            self.assertNotIn(forbidden, statements)

    def test_no_rows_seeded_by_migrations(self):
        for table in ('users', 'sessions', 'email_tokens', 'rate_limits', 'trainings',
                      'course_modules', 'course_lessons', 'lesson_completions',
                      'verified_purchases', 'pulse_deliveries', 'enrollments'):
            self.assertEqual(
                self.db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], 0,
                f'{table} ne doit contenir aucune donnée après migration',
            )

    def test_additive_columns_present(self):
        self.assertIn('description', [r[1] for r in self.db.execute('PRAGMA table_info(trainings)')])
        self.assertIn('buy_url', [r[1] for r in self.db.execute('PRAGMA table_info(trainings)')])
        self.assertIn('last_login_at_ms', [r[1] for r in self.db.execute('PRAGMA table_info(users)')])
        self.assertIn('last_seen_at_ms', [r[1] for r in self.db.execute('PRAGMA table_info(sessions)')])

    def test_email_token_is_hashed_and_single_use_constraints(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO email_tokens(token_hash,user_id,purpose,created_at_ms,expires_at_ms)"
                " VALUES ('h1','absent','verify_email',0,10)"
            )
        self.db.execute(
            "INSERT INTO users(id,email_normalized,display_name,password_hash,created_at_ms)"
            " VALUES ('u1','a@b.co','A','pbkdf2-sha256$1$x$y',0)"
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO email_tokens(token_hash,user_id,purpose,created_at_ms,expires_at_ms)"
                " VALUES ('h2','u1','autre_chose',0,10)"
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO email_tokens(token_hash,user_id,purpose,created_at_ms,expires_at_ms)"
                " VALUES ('h3','u1','verify_email',100,50)"
            )
        self.db.execute(
            "INSERT INTO email_tokens(token_hash,user_id,purpose,created_at_ms,expires_at_ms)"
            " VALUES ('h4','u1','verify_email',0,10)"
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO email_tokens(token_hash,user_id,purpose,created_at_ms,expires_at_ms)"
                " VALUES ('h4','u1','verify_email',0,10)"
            )

    def test_rate_limit_counters_are_non_negative(self):
        self.db.execute("INSERT INTO rate_limits(bucket,window_started_at_ms,attempts) VALUES ('b',0,1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE rate_limits SET attempts = -1 WHERE bucket = 'b'")

    def test_course_content_and_progress_relations(self):
        self.db.execute(
            "INSERT INTO trainings(id,title,price_cfa,published) VALUES ('t1','Orateur',45000,1)"
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO course_modules(id,training_id,position,title) VALUES ('m0','absent',1,'X')"
            )
        self.db.execute(
            "INSERT INTO course_modules(id,training_id,position,title) VALUES ('m1','t1',1,'Base')"
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO course_modules(id,training_id,position,title) VALUES ('m2','t1',1,'Doublon')"
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO course_lessons(id,module_id,position,title,kind) VALUES ('l0','m1',1,'X','podcast')"
            )
        self.db.execute(
            "INSERT INTO course_lessons(id,module_id,position,title,kind) VALUES ('l1','m1',1,'Intro','video')"
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO lesson_completions(user_id,lesson_id,completed_at_ms) VALUES ('absent','l1',0)"
            )

    def test_progress_requires_enrollment_before_real_content(self):
        """Un utilisateur sans inscription ne peut rien marquer : contrôle par jointure."""
        self.db.execute(
            "INSERT INTO trainings(id,title,price_cfa,published) VALUES ('t1','Orateur',45000,1)"
        )
        self.db.execute("INSERT INTO course_modules(id,training_id,position,title) VALUES ('m1','t1',1,'Base')")
        self.db.execute(
            "INSERT INTO course_lessons(id,module_id,position,title,kind) VALUES ('l1','m1',1,'Intro','video')"
        )
        self.db.execute(
            "INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,created_at_ms)"
            " VALUES ('u1','a@b.co','A','pbkdf2-sha256$1$x$y',5,0)"
        )
        allowed = self.db.execute(
            """SELECT 1 FROM course_lessons l
               JOIN course_modules m ON m.id = l.module_id
               JOIN enrollments e ON e.training_id = m.training_id AND e.user_id = 'u1'
               WHERE l.id = 'l1'"""
        ).fetchall()
        self.assertEqual(allowed, [])
        self.db.execute(
            "INSERT INTO enrollments(user_id,training_id,source,acquired_at_ms)"
            " VALUES ('u1','t1','staff_grant',1)"
        )
        allowed = self.db.execute(
            """SELECT 1 FROM course_lessons l
               JOIN course_modules m ON m.id = l.module_id
               JOIN enrollments e ON e.training_id = m.training_id AND e.user_id = 'u1'
               WHERE l.id = 'l1'"""
        ).fetchall()
        self.assertEqual(len(allowed), 1)


if __name__ == '__main__':
    unittest.main()
