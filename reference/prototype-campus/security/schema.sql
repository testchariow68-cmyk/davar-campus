-- DAVAR — Système de sécurité autonome (Turso, 100% serverless, aucun VPS)
-- Journal immuable des événements de sécurité (règle 4 : hash chain)
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  source_ip_hash TEXT,
  details TEXT,               -- JSON
  prev_hash TEXT,             -- chaînage immuable
  hash TEXT,                  -- SHA-256(event || prev_hash)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Profils comportementaux chiffrés (couche 4/7)
CREATE TABLE IF NOT EXISTS behavioral_profiles (
  user_id TEXT PRIMARY KEY,
  profile_vector TEXT,        -- chiffré
  last_updated TIMESTAMP,
  trust_score INTEGER
);

-- Fenêtres éphémères de confiance (5 min max, Durable Objects)
CREATE TABLE IF NOT EXISTS automation_windows (
  id TEXT PRIMARY KEY,
  window_token TEXT UNIQUE,
  opened_at TIMESTAMP,
  expires_at TIMESTAMP,
  status TEXT,                -- open | closed | expired
  nonce TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Journal des actions réalisées pendant une fenêtre
CREATE TABLE IF NOT EXISTS automation_logs (
  id TEXT PRIMARY KEY,
  window_id TEXT REFERENCES automation_windows(id),
  action TEXT,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
