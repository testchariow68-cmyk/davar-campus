-- 008_livres_audios_lecture.sqlite.sql — livres paginés, audios et reprise de lecture.
--
-- Décisions du propriétaire servies ici :
--   « Livres (lecteur paginé) · livres audio · ressources attribuées par étudiant » ;
--   « Lisez directement dans la plateforme, votre page est mémorisée » ;
--   « Écoute avec reprise automatique » (prototype, vue Mes audios).
--
-- Les fichiers eux-mêmes vivent dans un stockage objet (R2, 10 Go gratuits) :
-- ici ne sont rangées que les références. Aucun fichier n'est copié en base.
--
-- Aucune suppression, aucune transformation : uniquement des ajouts.

CREATE TABLE book_pages (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id),
  position INTEGER NOT NULL CHECK (position > 0),
  title TEXT,
  body TEXT NOT NULL,
  UNIQUE (resource_id, position)
);

CREATE TABLE audio_tracks (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id),
  position INTEGER NOT NULL CHECK (position > 0),
  title TEXT NOT NULL,
  duration_sec INTEGER,
  file_key TEXT,
  UNIQUE (resource_id, position)
);

-- Reprise de lecture : la page d'un livre, la seconde d'un audio. Une seule
-- position par étudiant et par ressource — « votre position est enregistrée
-- automatiquement ».
CREATE TABLE media_progress (
  user_id TEXT NOT NULL REFERENCES users(id),
  resource_id TEXT NOT NULL REFERENCES resources(id),
  kind TEXT NOT NULL CHECK (kind IN ('book','audio')),
  position INTEGER NOT NULL DEFAULT 0,
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, resource_id)
);

CREATE INDEX idx_media_progress_user ON media_progress(user_id, at_ms);
