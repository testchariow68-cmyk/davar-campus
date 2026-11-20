-- La connexion par empreinte digitale (ou visage), telle que la dessine le
-- prototype dans « Paramètres › Sécurité ».
--
-- Ce que la plateforme garde : une clé PUBLIQUE par appareil, et un compteur
-- d'usage. Rien d'autre. L'empreinte et le visage ne quittent jamais
-- l'appareil — ils n'arrivent même pas jusqu'ici.
--
-- Les défis, eux, sont à usage unique et périment vite : un défi rejoué ne
-- vaut plus rien, ce qui interdit de réutiliser une ancienne réponse.
CREATE TABLE passkeys (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key    TEXT NOT NULL,
  algorithm     INTEGER NOT NULL,
  sign_count    INTEGER NOT NULL DEFAULT 0,
  cree_le_ms    INTEGER NOT NULL
);
CREATE INDEX idx_passkeys_user ON passkeys(user_id);
CREATE TABLE passkey_challenges (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  challenge    TEXT NOT NULL,
  genre        TEXT NOT NULL,
  expire_le_ms INTEGER NOT NULL
);
