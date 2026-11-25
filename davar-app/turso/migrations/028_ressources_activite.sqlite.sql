-- 028_ressources_activite.sqlite.sql — dernière ouverture des ressources multimédias.
--
-- Les livres et audios ont déjà leur position dans media_progress. Les fichiers
-- complémentaires (PDF, document, image, vidéo déposée) n'ont pas de position,
-- mais leur ouverture reste une activité réelle qui peut devenir la prochaine
-- action du campus. On garde donc uniquement la dernière date, jamais l'URL ni
-- le contenu du fichier.

CREATE TABLE resource_activity (
  user_id TEXT NOT NULL REFERENCES users(id),
  resource_id TEXT NOT NULL REFERENCES resources(id),
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, resource_id)
);

CREATE INDEX idx_resource_activity_user ON resource_activity(user_id, at_ms);
