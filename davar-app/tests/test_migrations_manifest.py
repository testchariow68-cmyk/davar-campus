"""Le manifeste de migration staging doit rester exactement celui qui a été revu.

Toute modification d'un fichier de migration sans mise à jour du manifeste
(scripts/staging-schema.mjs) doit casser ici — avant toute écriture hébergée.
"""
import hashlib
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
MANIFEST_SCRIPT = ROOT / 'scripts' / 'staging-schema.mjs' 
DDL_PATTERNS = {
    'CREATE TABLE': r'^CREATE\s+TABLE\s+([a-z_]+)',
    'CREATE INDEX': r'^CREATE\s+INDEX\s+([a-z_]+)',
    'ALTER TABLE': r'^ALTER\s+TABLE\s+([a-z_]+)\s+ADD\s+COLUMN\s+([a-z_]+)',
}
FORBIDDEN = ('drop table', 'drop index', 'truncate', 'delete from')


def manifest_json():
    """Le manifeste revu, lu depuis le script lui-même (lecture seule, hors ligne)."""
    completed = subprocess.run(
        ['node', str(MANIFEST_SCRIPT), '--manifest'],
        capture_output=True, text=True, check=True, cwd=ROOT,
    )
    return json.loads(completed.stdout)


def manifest_entries():
    """Entrées {version, file, sha256, ddl, creates} du manifeste revu."""
    return manifest_json()['migrations']


def statements_of(path):
    raw = path.read_text(encoding='utf-8')
    without_comments = re.sub(r'^\s*--.*$', '', raw, flags=re.M)
    return [statement.strip() for statement in without_comments.split(';') if statement.strip()]


class MigrationsManifestTest(unittest.TestCase):
    def test_manifest_covers_every_migration_file(self):
        files = sorted(p.name for p in (ROOT / 'turso' / 'migrations').glob('*.sqlite.sql'))
        self.assertEqual([entry['file'] for entry in manifest_entries()], files)

    def test_manifest_hashes_and_ddl_counts_match_files(self):
        for entry in manifest_entries():
            path = ROOT / 'turso' / 'migrations' / entry['file']
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), entry['sha256'],
                             f"{entry['file']} : empreinte différente du manifeste revu")
            ddl = [s for s in statements_of(path) if not s.upper().startswith('PRAGMA')]
            self.assertEqual(len(ddl), entry['ddl'],
                             f"{entry['file']} : nombre de DDL différent du manifeste revu")

    def test_later_migrations_never_remove_anything(self):
        for entry in manifest_entries():
            path = ROOT / 'turso' / 'migrations' / entry['file']
            for statement in statements_of(path):
                lowered = statement.lower()
                for forbidden in FORBIDDEN:
                    self.assertNotIn(forbidden, lowered,
                                     f"{entry['file']} : instruction destructive « {forbidden} »")

    def test_migrations_are_additive_and_create_expected_tables(self):
        for entry in manifest_entries():
            path = ROOT / 'turso' / 'migrations' / entry['file']
            ddl = [s for s in statements_of(path) if not s.upper().startswith('PRAGMA')]
            created = []
            for statement in ddl:
                lowered = statement.lower()
                for forbidden in FORBIDDEN:
                    self.assertNotIn(forbidden, lowered, f"{entry['file']} : instruction destructive")
                matched = False
                for pattern in DDL_PATTERNS.values():
                    found = re.match(pattern, statement, re.I)
                    if found:
                        created.append(found.group(1))
                        matched = True
                        break
                self.assertTrue(matched, f"{entry['file']} : DDL inattendu « {statement[:60]}… »")
            for table in entry['creates']:
                self.assertIn(table, created, f"{entry['file']} ne crée pas {table}")

    def test_migrations_are_disjoint_and_keep_every_legacy_table(self):
        entries = manifest_entries()
        self.assertGreaterEqual(len(entries), 4)
        created = [table for entry in entries for table in entry['creates']]
        self.assertEqual(len(created), len(set(created)), 'deux migrations créent la même table')
        self.assertEqual(len(set(created)), manifest_json()['expectedTableCount'])


if __name__ == '__main__':
    unittest.main()
