-- 006_assistant_echanges_notifications — l'assistant virtuel, les conversations
-- et la cloche de notifications entrent en base.
--
-- Décisions du propriétaire servies par cette migration :
--   « tout brancher : assistants et absolument tout » (7 octobre 2026) ;
--   assistant configurable (nom, photo, langue, température) et base de
--   connaissances PAR FORMATION — aucun mélange entre formations ;
--   chaîne de secours entre fournisseurs gratuits quand un quota est atteint ;
--   supervision humaine : le coach peut valider, corriger ou répondre ;
--   notifications qui disparaissent 48 heures après leur lecture ;
--   conversations : 90 jours pour l'assistant, 12 mois pour le coach.
--
-- Aucune suppression, aucune transformation : uniquement des ajouts.

CREATE TABLE assistant_config (
  id TEXT PRIMARY KEY,
  default_name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  hue INTEGER NOT NULL DEFAULT 265,
  photo_key TEXT,
  lang TEXT NOT NULL DEFAULT 'fr',
  temperature REAL NOT NULL DEFAULT 0.4,
  primary_provider TEXT NOT NULL DEFAULT 'groq',
  fallback_chain TEXT NOT NULL DEFAULT '["groq","gemini","openrouter","hf"]',
  models TEXT NOT NULL DEFAULT '{}',
  provider_limits TEXT NOT NULL DEFAULT '{}',
  student_daily_cap INTEGER NOT NULL DEFAULT 30,
  transcription TEXT NOT NULL DEFAULT 'browser-whisper',
  status TEXT NOT NULL DEFAULT 'disconnected',
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE assistant_kb (
  training_id TEXT PRIMARY KEY REFERENCES trainings(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE assistant_provider_days (
  provider TEXT NOT NULL,
  day TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  exhausted INTEGER NOT NULL DEFAULT 0 CHECK (exhausted IN (0,1)),
  PRIMARY KEY (provider, day)
);

CREATE TABLE assistant_user_days (
  user_id TEXT NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  -- Peut être NULL : une demande d'aide n'est pas rattachée à une formation.
  training_id TEXT REFERENCES trainings(id),
  module_id TEXT,
  mode TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai','coach','support')),
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0,1)),
  ai_validated INTEGER NOT NULL DEFAULT 0 CHECK (ai_validated IN (0,1)),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  purge_after_ms INTEGER NOT NULL
);
CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at_ms);
CREATE INDEX idx_conversations_purge ON conversations(purge_after_ms);

CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  author TEXT NOT NULL CHECK (author IN ('student','ai','coach','sys')),
  text TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  provider TEXT,
  model TEXT,
  validated INTEGER NOT NULL DEFAULT 0 CHECK (validated IN (0,1))
);
CREATE INDEX idx_messages_conversation ON conversation_messages(conversation_id, at_ms);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT,
  route TEXT,
  created_at_ms INTEGER NOT NULL,
  read_at_ms INTEGER,
  expires_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at_ms);

-- Réglages du campus (contacts d'aide, réseaux, annonce) — modifiables par le
-- propriétaire depuis son espace, jamais en dur dans le code.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

ALTER TABLE course_lessons ADD COLUMN content_text TEXT;
