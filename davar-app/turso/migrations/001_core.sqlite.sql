-- DAVAR Campus / Turso seul — PROPOSITION STAGING, NON APPLIQUÉE.
-- Aucun DROP, DELETE, TRUNCATE, compte fictif ni attribution de formation.
-- Les migrations hébergées nécessitent un opérateur privé, inventaire et accord distinct.
PRAGMA foreign_keys = ON;
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  installed_at_ms INTEGER NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at_ms INTEGER,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','staff','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > created_at_ms)
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at_ms);
CREATE TABLE trainings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price_cfa INTEGER NOT NULL CHECK (price_cfa >= 0),
  chariow_product_id TEXT UNIQUE,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1))
);
CREATE TABLE verified_purchases (
  sale_id TEXT PRIMARY KEY,
  buyer_email_normalized TEXT NOT NULL,
  training_id TEXT NOT NULL REFERENCES trainings(id),
  amount_value_text TEXT NOT NULL,
  currency TEXT NOT NULL,
  verified_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_purchases_email ON verified_purchases(buyer_email_normalized);
CREATE TABLE pulse_deliveries (
  delivery_id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES verified_purchases(sale_id),
  received_at_ms INTEGER NOT NULL
);
CREATE TABLE enrollments (
  user_id TEXT NOT NULL REFERENCES users(id),
  training_id TEXT NOT NULL REFERENCES trainings(id),
  source TEXT NOT NULL CHECK (source IN ('verified_purchase','staff_grant')),
  sale_id TEXT REFERENCES verified_purchases(sale_id),
  acquired_at_ms INTEGER NOT NULL,
  CHECK ((source='verified_purchase' AND sale_id IS NOT NULL) OR
         (source='staff_grant' AND sale_id IS NULL)),
  PRIMARY KEY (user_id,training_id)
);
CREATE TABLE payment_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  training_id TEXT NOT NULL REFERENCES trainings(id),
  provider TEXT NOT NULL CHECK (provider IN ('flutterwave','moneyfusion','chariow_external')),
  provider_ref TEXT,
  amount_cfa INTEGER NOT NULL CHECK (amount_cfa > 0),
  currency TEXT NOT NULL CHECK (currency = 'XOF'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','failed','refunded')),
  created_at_ms INTEGER NOT NULL,
  UNIQUE (provider,provider_ref)
);
CREATE TABLE payment_events (
  provider TEXT NOT NULL CHECK (provider IN ('flutterwave','moneyfusion','chariow_external')),
  event_id TEXT NOT NULL,
  intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  received_at_ms INTEGER NOT NULL,
  PRIMARY KEY (provider,event_id)
);
-- Aucun paiement / webhook / accès aux cours n'est activé par la seule existence de ces tables.
