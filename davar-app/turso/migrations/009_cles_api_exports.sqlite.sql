-- 009_clES_api_exports — clés d'accès pour les outils externes, et journal des exports.
--
-- Décisions du propriétaire servies ici :
--   « Intégrations / Développeur avec clés API » (prototype, centre de contrôle) ;
--   « Exports + factures derrière le mot de passe » — un export est une sortie de
--   données personnelles : il se demande, et il se journalise.
--
-- Aucune suppression, aucune transformation : uniquement des ajouts.

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  -- Seule l'EMPREINTE est rangée : la clé en clair n'est montrée qu'une fois,
  -- au moment de sa création. Impossible de la relire ensuite, même pour nous.
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  last_used_at_ms INTEGER,
  revoked_at_ms INTEGER
);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE exports_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  rows INTEGER NOT NULL,
  actor TEXT NOT NULL,
  at_ms INTEGER NOT NULL
);
CREATE INDEX idx_exports_log_at ON exports_log(at_ms);
