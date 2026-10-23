-- NOTIFICATIONS POUSSÉES — l'abonnement de chaque appareil, et la trace d'envoi.
--
-- Le prototype se contentait d'afficher « Notifications activées ✓ » : personne
-- ne recevait rien. Ici, l'appareil est réellement abonné (une adresse de
-- service et la clé publique de l'appareil, jamais de quoi se faire passer pour
-- lui) et la notification part réellement. `pushed_at_ms` dit si elle est déjà
-- partie : sans cette trace, un envoi groupé la répéterait.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  derniere_panne_ms INTEGER,
  UNIQUE (user_id, endpoint)
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
ALTER TABLE notifications ADD COLUMN pushed_at_ms INTEGER;
