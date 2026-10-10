-- DAVAR Campus / Turso seul — migration 003 : compteurs de quota et d'opérations.
-- ADDITIVE UNIQUEMENT : aucun DROP, DELETE, TRUNCATE, aucune donnée insérée.
-- Objectif : « protéger les quotas, ne pas les dépenser ». Ces compteurs
-- permettent de mesurer la consommation réelle face aux budgets gratuits
-- (requêtes dynamiques, écritures, lectures, envois d'e-mail) AVANT de les
-- atteindre, et de refuser proprement plutôt que de tomber en panne sèche.
PRAGMA foreign_keys = ON;

CREATE TABLE ops_counters (
  bucket TEXT PRIMARY KEY,
  window_tag TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_ops_counters_window ON ops_counters(window_tag);

-- Journal des opérations coûteuses (hachage délégué, e-mails) : sert au
-- diagnostic de quota et à la détection d'abus. Aucun mot de passe, aucun
-- contenu d'e-mail, aucune adresse en clair ne doit jamais y être écrit.
CREATE TABLE ops_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('kdf_hash','kdf_verify','email_sent','email_refused')),
  window_tag TEXT NOT NULL,
  occurred_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_ops_events_kind ON ops_events(kind, window_tag);
