-- DAVAR Campus / Turso seul — migration 002 : authentification serveur + campus.
-- ADDITIVE UNIQUEMENT : aucun DROP, DELETE, TRUNCATE, aucune donnée insérée,
-- aucun compte ni paiement fictif. À appliquer après 001 (jamais à la place).
-- Encore NON appliquée à une base hébergée : voir MISE-EN-SERVICE.md.
PRAGMA foreign_keys = ON;

-- Jetons à usage unique (vérification d'e-mail, réinitialisation future).
-- Seul le SHA-256 du jeton est stocké : une fuite de table ne donne pas d'accès.
CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > created_at_ms),
  used_at_ms INTEGER
);
CREATE INDEX idx_email_tokens_user ON email_tokens(user_id, purpose);

-- Limitation de débit fenêtrée (connexion, inscription, renvoi de lien).
-- La clé est hachée côté application : aucun e-mail ni IP en clair ici.
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  window_started_at_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0)
);

-- Contenu réel des formations (rempli par l'administration, pas par les pulses).
CREATE TABLE course_modules (
  id TEXT PRIMARY KEY,
  training_id TEXT NOT NULL REFERENCES trainings(id),
  position INTEGER NOT NULL CHECK (position > 0),
  title TEXT NOT NULL,
  summary TEXT,
  UNIQUE (training_id, position)
);
CREATE TABLE course_lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES course_modules(id),
  position INTEGER NOT NULL CHECK (position > 0),
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'video' CHECK (kind IN ('video','text','exercise','live')),
  -- NULL = ressource pas encore publiée : l'interface doit le dire honnêtement.
  resource_url TEXT,
  duration_min INTEGER CHECK (duration_min IS NULL OR duration_min > 0),
  UNIQUE (module_id, position)
);
CREATE TABLE lesson_completions (
  user_id TEXT NOT NULL REFERENCES users(id),
  lesson_id TEXT NOT NULL REFERENCES course_lessons(id),
  completed_at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

-- Colonnes additives utiles au parcours public (aucune réécriture de données).
ALTER TABLE trainings ADD COLUMN description TEXT;
ALTER TABLE trainings ADD COLUMN buy_url TEXT;
ALTER TABLE users ADD COLUMN last_login_at_ms INTEGER;
ALTER TABLE sessions ADD COLUMN last_seen_at_ms INTEGER;

-- Aucune fonctionnalité n'est activée par la seule existence de ce schéma :
-- l'authentification, l'envoi d'e-mail et le Pulse Chariow sont gouvernés par
-- des variables d'environnement explicites et échouent en mode fermé.
