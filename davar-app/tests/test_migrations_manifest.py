"""Le manifeste de migration staging doit rester exactement celui qui a été revu.

Toute modification d'un fichier de migration sans mise à jour du manifeste
(scripts/staging-schema.mjs) doit casser ici — avant toute écriture hébergée.
"""
import hashlib
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
MANIFEST = (ROOT / 'scripts' / 'staging-schema.mjs').read_text(encoding='utf-8')
DDL_PATTERNS = {
    'CREATE TABLE': r'^CREATE\s+TABLE\s+([a-z_]+)',
    'CREATE INDEX': r'^CREATE\s+INDEX\s+([a-z_]+)',
    'ALTER TABLE': r'^ALTER\s+TABLE\s+([a-z_]+)\s+ADD\s+COLUMN\s+([a-z_]+)',
}
FORBIDDEN = ('drop table', 'drop index', 'truncate', 'delete from')


def manifest_entries():
    """Extrait les entrées {version, file, sha256, ddl, creates} du manifeste."""
    entries = []
    for block in re.findall(r'\{\s*version:\s*\d+.*?creates:\s*\[(.*?)\]\s*,\s*\}', MANIFEST, re.S):
        start = MANIFEST.index(block)
        header = MANIFEST[:start]
        version = int(re.findall(r'version:\s*(\d+)', header)[-1])
        file = re.findall(r"file:\s*'([^']+)'", header)[-1]
        sha256 = re.findall(r"sha256:\s*'([0-9a-f]{64})'", header)[-1]
        ddl = int(re.findall(r'ddl:\s*(\d+)', header)[-1])
        creates = re.findall(r"'([a-z_]+)'", block)
        entries.append({'version': version, 'file': file, 'sha256': sha256, 'ddl': ddl, 'creates': creates})
    return entries


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

    def test_second_migration_removes_nothing_and_keeps_legacy_tables(self):
        first, second = manifest_entries()
        self.assertTrue(set(first['creates']).isdisjoint(set(second['creates'])))
        self.assertEqual(len(set(first['creates']) | set(second['creates'])), 14)


if __name__ == '__main__':
    unittest.main()
