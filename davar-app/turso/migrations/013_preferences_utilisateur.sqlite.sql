-- 013 — Préférences de l'utilisateur : ce que CHAQUE personne choisit pour elle.
--
-- Pourquoi une table dédiée : les réglages de la plateforme (`app_settings`) sont
-- ceux du propriétaire — une seule valeur pour tout le monde. Les préférences
-- personnelles (veut-elle les notifications, taille d'affichage) doivent survivre
-- au changement d'appareil, donc ne pas vivre dans le navigateur.
--
-- Additif uniquement : aucune table existante n'est modifiée, aucune donnée
-- n'est supprimée.
CREATE TABLE user_prefs (
  user_id TEXT NOT NULL REFERENCES users(id),
  pref_key TEXT NOT NULL,
  pref_value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, pref_key)
);
