-- ARCHIVE / NE PAS EXÉCUTER : ancien schéma avec CinetPay et purge automatique.
-- Voir REAL-LAUNCH-STATUS.md et turso/migrations/001_core.sqlite.sql (proposition locale non appliquée).
-- ============================================================
-- DAVAR ACADÉMIE CAMPUS — SCHÉMA TURSO (SQLite / libSQL)
-- Reflète fidèlement le modèle de données du prototype validé,
-- y compris le DAVAR DATA LIFECYCLE & PURGE ENGINE.
-- Principe : Turso ne stocke JAMAIS les gros fichiers (R2).
-- ============================================================

PRAGMA foreign_keys = ON;

/* ---------- COMPTES & AUTHENTIFICATION (construite côté application) ---------- */
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,                       -- argon2id côté serveur
  role TEXT NOT NULL DEFAULT 'student',     -- student | coach | manager | admin (admin = Super Admin UNIQUE)
  title TEXT, roles TEXT,                   -- rôles cumulables (JSON)
  phone TEXT, photo_key TEXT,               -- photo = référence R2
  status TEXT NOT NULL DEFAULT 'actif',     -- actif | suspended
  joined_at INTEGER NOT NULL,
  webauthn_cred_id TEXT, webauthn_cred TEXT,-- empreinte digitale réelle (WebAuthn)
  hold INTEGER NOT NULL DEFAULT 0,          -- exception de conservation (litige/obligation)
  purged INTEGER NOT NULL DEFAULT 0         -- 1 lorsque les données personnelles ont été purgées
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL               -- §16 : purge après expiration
);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  type TEXT NOT NULL,                       -- staff | student_grace
  roles TEXT, expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0           -- §16 : purge après utilisation/expiration
);

/* ---------- CATALOGUE PÉDAGOGIQUE ---------- */
CREATE TABLE IF NOT EXISTS trainings (
  id TEXT PRIMARY KEY, code TEXT, abbr TEXT,
  title TEXT NOT NULL, description TEXT,
  level TEXT, price_cfa INTEGER,
  cover_key TEXT,                           -- référence R2
  chariow_product_id TEXT, chariow_url TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  assistant_name TEXT                       -- nom de l'assistant IA par formation
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  training_id TEXT NOT NULL REFERENCES trainings(id),
  position INTEGER NOT NULL, title TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  position INTEGER NOT NULL, title TEXT NOT NULL,
  video_key TEXT, duration TEXT, ratio TEXT, content_text TEXT
);
CREATE TABLE IF NOT EXISTS extra_videos (    -- enrichissement silencieux (§ jamais de reset)
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id),
  title TEXT NOT NULL, url TEXT, duration TEXT, ratio TEXT,
  added_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS module_resources (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id),
  name TEXT NOT NULL, type TEXT, size_label TEXT, file_key TEXT
);
CREATE TABLE IF NOT EXISTS exercises (       -- non bloquants
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  title TEXT NOT NULL, questions TEXT NOT NULL  -- JSON
);
CREATE TABLE IF NOT EXISTS assessments (     -- bloquants (quiz à score minimum ou soumission humaine)
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  type TEXT NOT NULL,                        -- quiz | submission
  title TEXT NOT NULL, min_score INTEGER, questions TEXT
);

/* ---------- INSCRIPTIONS & PROGRESSION ---------- */
CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  training_id TEXT NOT NULL REFERENCES trainings(id),
  acquired_at INTEGER NOT NULL,             -- §20 : last_new_entitlement_at (ne change qu'à l'acquisition)
  source TEXT NOT NULL,                      -- chariow | cinetpay | grace
  completed_at INTEGER                       -- verrou : terminé = 100 % pour toujours
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_enr ON enrollments(user_id, training_id);
CREATE INDEX IF NOT EXISTS idx_enr_acq ON enrollments(acquired_at);

CREATE TABLE IF NOT EXISTS progress (        -- clé par module : enrichir ne réinitialise jamais
  user_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, module_id)
);
CREATE TABLE IF NOT EXISTS exercise_attempts (
  id TEXT PRIMARY KEY, user_id TEXT, exercise_id TEXT,
  score INTEGER, total INTEGER, at INTEGER
);
CREATE TABLE IF NOT EXISTS activity (        -- §20 : last_meaningful_pedagogical_activity
  user_id TEXT PRIMARY KEY,
  last_ped_at INTEGER NOT NULL,
  ped_days TEXT                              -- JSON série pour streaks
);

/* ---------- ÉVALUATIONS & FICHIERS TEMPORAIRES (§3-11) ---------- */
CREATE TABLE IF NOT EXISTS evaluation_attempts (   -- §8 : données pédagogiques légères
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL, training_id TEXT, assessment_id TEXT,
  attempt_number INTEGER NOT NULL,
  submitted_at INTEGER, reviewed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | approved | rejected | retry | changes
  score INTEGER, feedback TEXT, reviewer_id TEXT
);
CREATE TABLE IF NOT EXISTS submission_objects (    -- §8 : fichier temporaire (métadonnées seulement)
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES evaluation_attempts(id),
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  storage_key TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- audio | video | doc
  mime_type TEXT, size_bytes INTEGER,
  name TEXT, reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,               -- §10 : expiration de sécurité
  status TEXT NOT NULL DEFAULT 'active'      -- draft | active | replaced | processed | orphan
);
CREATE INDEX IF NOT EXISTS idx_subobj_exp ON submission_objects(expires_at);
CREATE INDEX IF NOT EXISTS idx_subobj_status ON submission_objects(status);

/* ---------- CONVERSATIONS (§13/§14) ---------- */
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, training_id TEXT, module_id TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  hold INTEGER NOT NULL DEFAULT 0,           -- §13 : exception (litige/obligation/certification)
  ai_validated INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  sender TEXT NOT NULL,                      -- student | ai | coach | sys
  text TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_at ON messages(at);

/* ---------- NOTIFICATIONS (§15 + règle 48 h après lecture) ---------- */
CREATE TABLE IF NOT EXISTS notifs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, type TEXT, title TEXT NOT NULL, body TEXT,
  at INTEGER NOT NULL,
  read_at INTEGER,                           -- NULL = non lue ; lue + 48 h → disparaît
  meta TEXT                                  -- JSON (badge, lien…)
);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifs(user_id, read_at);

/* ---------- RÉCOMPENSES (§37) ---------- */
CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, badge_id TEXT NOT NULL,
  at INTEGER NOT NULL, source TEXT, mode TEXT, -- AUTOMATIQUE | MANUEL
  training_id TEXT
);

/* ---------- CERTIFICATION (§24-36) ---------- */
CREATE TABLE IF NOT EXISTS cert_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, training_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | generated | refused
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS certs (           -- §29 figé à l'émission ; §35 registre séparé
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                 -- vérification publique + QR
  user_id TEXT NOT NULL,
  training_id TEXT NOT NULL,
  holder_name TEXT NOT NULL,                 -- FIGÉ : document historique
  formation_title TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'actif',      -- actif | expiré | révoqué
  pdf_key TEXT, preview_key TEXT,            -- §34 : même cycle de vie
  slide_deleted INTEGER NOT NULL DEFAULT 0   -- §27 : slide de travail supprimé
);
CREATE INDEX IF NOT EXISTS idx_certs_code ON certs(code);

/* ---------- AVIS & SPOTLIGHT (§B) ---------- */
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL,                 -- platform | training
  training_id TEXT, text TEXT NOT NULL, words INTEGER,
  audio INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | published
  spotlight INTEGER NOT NULL DEFAULT 0
);

/* ---------- VENTES ---------- */
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  user_id TEXT, email TEXT, training_id TEXT,
  amount_cfa INTEGER, fee_cfa INTEGER,
  method TEXT NOT NULL DEFAULT 'chariow',    -- chariow | cinetpay (secours)
  status TEXT NOT NULL, at INTEGER NOT NULL,
  chariow_delivery_id TEXT UNIQUE            -- dédoublonnage Pulse
);

/* ---------- ADMIN : EXPORTS, ÉQUIPE, CLÉS API ---------- */
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, key_hash TEXT NOT NULL,
  label TEXT, created_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ticker_announcements (
  id TEXT PRIMARY KEY, text TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'tous', active INTEGER NOT NULL DEFAULT 1, at INTEGER
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT           -- JSON : support, socials, sheets, appscript, IA, palettes…
);

/* ---------- DAVAR DATA LIFECYCLE & PURGE ENGINE (§41) ---------- */
CREATE TABLE IF NOT EXISTS audit_log (       -- §17 : 90 j techniques / 12 mois sécurité
  id TEXT PRIMARY KEY, actor TEXT, action TEXT NOT NULL,
  payload TEXT, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
CREATE TABLE IF NOT EXISTS purge_log (       -- trace minimale, JAMAIS de contenu
  id TEXT PRIMARY KEY, at INTEGER NOT NULL,
  data_type TEXT NOT NULL, count INTEGER NOT NULL,
  result TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS purge_pending (   -- §22 quarantaine
  user_id TEXT PRIMARY KEY, at INTEGER NOT NULL, reason TEXT
);
CREATE TABLE IF NOT EXISTS anonym_stats (    -- §23 : conservation longue, non nominative
  key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0, detail TEXT
);
