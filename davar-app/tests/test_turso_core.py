"""Contrats de schéma locaux ; aucun accès Turso distant."""
import sqlite3
import re
import unittest
from pathlib import Path

SQL = Path(__file__).parents[1] / 'turso' / 'migrations' / '001_core.sqlite.sql'
LIB = Path(__file__).parents[1] / 'lib' / 'server'


def sql_blocks(path, needle=None):
    """Extrait les requêtes SQL réelles d'un module (aucune base distante)."""
    blocks = re.findall(r'sql:\s*`([^`]+)`', path.read_text(encoding='utf-8'))
    if needle is None:
        return blocks
    return [block for block in blocks if needle in block]


class TursoCoreTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript(SQL.read_text(encoding='utf-8'))
        self.db.execute('PRAGMA foreign_keys=ON')

    def tearDown(self):
        self.db.close()

    def test_no_rows_or_payments_seeded(self):
        for table in ('users', 'sessions', 'trainings', 'verified_purchases',
                      'pulse_deliveries', 'enrollments', 'payment_intents', 'payment_events'):
            self.assertEqual(self.db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], 0)

    def test_no_deletion_or_old_provider_in_new_sql(self):
        sql = SQL.read_text(encoding='utf-8').lower()
        statements = '\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
        for forbidden in ('drop table', 'truncate', 'delete from', 'cinetpay', 'supabase'):
            self.assertNotIn(forbidden, statements)

    def test_user_email_unique_and_enrollment_requires_existing_relations(self):
        self.db.execute("INSERT INTO users(id,email_normalized,display_name,password_hash,created_at_ms) VALUES ('u1','test@example.org','Test','argon2id-placeholder',0)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO users(id,email_normalized,display_name,password_hash,created_at_ms) VALUES ('u2','test@example.org','Other','argon2id-placeholder',0)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO enrollments(user_id,training_id,source,acquired_at_ms) VALUES ('u1','missing','verified_purchase',1)")

    def test_payment_provider_and_replayed_webhook_are_constrained(self):
        self.db.execute("INSERT INTO trainings(id,title,price_cfa,published) VALUES ('t1','Test',1000,0)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO payment_intents(id,training_id,provider,amount_cfa,currency,created_at_ms) VALUES ('bad','t1','unknown',1000,'XOF',0)")
        self.db.execute("INSERT INTO payment_intents(id,training_id,provider,amount_cfa,currency,created_at_ms) VALUES ('p1','t1','flutterwave',1000,'XOF',0)")
        self.db.execute("INSERT INTO payment_events VALUES ('flutterwave','evt-1','p1',1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO payment_events VALUES ('flutterwave','evt-1','p1',1)")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM enrollments').fetchone()[0],0)

    def test_chariow_sale_and_delivery_are_durable_unique_without_auto_grant(self):
        self.db.execute("INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('t1','Publiée',45000,'prd_test',1)")
        self.db.execute("INSERT INTO verified_purchases VALUES ('sal_abc','awa@example.org','t1','45000','XOF',1)")
        self.db.execute("INSERT INTO pulse_deliveries VALUES ('delivery-1','sal_abc',1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO verified_purchases VALUES ('sal_abc','other@example.org','t1','45000','XOF',1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO pulse_deliveries VALUES ('delivery-1','sal_abc',1)")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM enrollments').fetchone()[0],0)

    def test_exact_chariow_ledger_sql_replay_and_pre_account_purchase(self):
        # Exécute les requêtes SQL extraites des modules serveur, sans Turso distant.
        # Depuis la migration 002, le rattachement des achats vit dans auth-core.
        statements = sql_blocks(LIB / 'chariow-ledger.ts')
        claim = sql_blocks(LIB / 'auth-core.ts', needle='INSERT INTO enrollments')
        self.assertEqual(len(statements), 4)
        self.assertEqual(len(claim), 1)
        statements = statements + claim
        self.db.execute("INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('t1','Cours',45000,'prd_test',1)")
        self.db.execute("INSERT INTO users(id,email_normalized,display_name,password_hash,created_at_ms) VALUES ('u1','awa@example.org','Awa','not-real-test-hash',1)")
        # Achat avant vérification de l'adresse : la vente persiste, aucun cours accordé.
        for delivery in ('delivery_1234','delivery_1234','delivery_5678'):
            with self.db:
                self.db.execute(statements[0],('sal_abc','awa@example.org','45000','XOF',1,'prd_test'))
                self.db.execute(statements[1],(delivery,1,'sal_abc','awa@example.org','45000','XOF','prd_test'))
                self.db.execute(statements[2],(1,'sal_abc',delivery))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM verified_purchases').fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM pulse_deliveries').fetchone()[0],2)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM enrollments').fetchone()[0],0)
        # À appeler uniquement après confirmation serveur de possession d'email.
        self.db.execute("UPDATE users SET email_verified_at_ms=2 WHERE id='u1'")
        self.db.execute(statements[4],(3,'u1'))
        self.db.execute(statements[4],(3,'u1'))
        self.assertEqual(self.db.execute('SELECT source,sale_id FROM enrollments').fetchall(),
                         [('verified_purchase','sal_abc')])

    def test_exact_chariow_ledger_sql_refuses_unknown_product_and_grants_only_verified_account(self):
        purchase, delivery, grant = sql_blocks(LIB / 'chariow-ledger.ts')[:3]
        self.assertTrue(all('?' in block for block in (purchase, delivery, grant)))
        self.db.execute("INSERT INTO trainings(id,title,price_cfa,chariow_product_id,published) VALUES ('t1','Cours',45000,'prd_test',1)")
        self.db.execute("INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,created_at_ms) VALUES ('u1','awa@example.org','Awa','not-real-test-hash',1,1)")
        self.db.execute("INSERT INTO users(id,email_normalized,display_name,password_hash,email_verified_at_ms,created_at_ms) VALUES ('u2','other@example.org','Other','not-real-test-hash',1,1)")
        for product,delivery_id in (('prd_unknown','delivery_fake'),('prd_test','delivery_valid')):
            with self.db:
                self.db.execute(purchase,('sal_'+product,'awa@example.org','45000','XOF',1,product))
                self.db.execute(delivery,(delivery_id,1,'sal_'+product,'awa@example.org','45000','XOF',product))
                self.db.execute(grant,(1,'sal_'+product,delivery_id))
        self.assertEqual(self.db.execute('SELECT sale_id FROM verified_purchases').fetchall(), [('sal_prd_test',)])
        self.assertEqual(self.db.execute('SELECT user_id FROM enrollments').fetchall(), [('u1',)])

    def test_public_catalogue_filters_unpublished_courses(self):
        self.db.execute("INSERT INTO trainings(id,title,price_cfa,published) VALUES ('t1','Publiée',1000,1)")
        self.db.execute("INSERT INTO trainings(id,title,price_cfa,published) VALUES ('t2','Brouillon',2000,0)")
        rows = self.db.execute(
            'SELECT id, title, price_cfa FROM trainings WHERE published = 1 ORDER BY title LIMIT 30'
        ).fetchall()
        self.assertEqual(rows, [('t1', 'Publiée', 1000)])

    def test_same_training_cannot_be_granted_twice(self):
        self.db.execute("INSERT INTO users(id,email_normalized,display_name,password_hash,created_at_ms) VALUES ('u1','test@example.org','Test','argon2id-placeholder',0)")
        self.db.execute("INSERT INTO trainings(id,title,price_cfa,published) VALUES ('t1','Test',1000,0)")
        self.db.execute("INSERT INTO enrollments(user_id,training_id,source,acquired_at_ms) VALUES ('u1','t1','staff_grant',1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO enrollments(user_id,training_id,source,acquired_at_ms) VALUES ('u1','t1','staff_grant',1)")


if __name__ == '__main__':
    unittest.main()
