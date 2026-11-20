-- 012_reseaux_sociaux — la confirmation d'abonnement aux réseaux, horodatée.
--
-- Décision du propriétaire (spécifications V4) : les plateformes qu'un étudiant
-- ne suit pas encore défilent en bas de son campus ; quand il confirme son
-- abonnement, la plateforme disparaît de SON bandeau.
--
-- Aucune API publique ne permet de vérifier un abonnement : la confirmation
-- horodatée sert de contrôle, et le propriétaire la voit. Le lien confirmé est
-- conservé tel quel — c'est la preuve de ce qui a été proposé.
--
-- Aucune suppression, aucune transformation : uniquement des ajouts.

CREATE TABLE social_subscriptions (
  user_id TEXT NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL,
  link TEXT NOT NULL,
  confirmed_at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, platform)
);
CREATE INDEX idx_social_subs_platform ON social_subscriptions(platform);
