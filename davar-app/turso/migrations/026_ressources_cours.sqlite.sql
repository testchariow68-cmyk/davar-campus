-- LES RESSOURCES D'UN COURS — ce que chaque cours porte, comme au prototype.
--
-- Le propriétaire l'a redit : « il y a la vidéo principale, et puis il y a les
-- vidéos d'illustrations, et il y a d'autres ressources comme l'audio, comme
-- le document que je peux ajouter ». Le prototype le fait déjà, avec des
-- exemples : un module porte `videoUrl`, `resources[]` et `extraVideos[]`.
--
-- On suit exactement cette lecture, en l'attachant au COURS (la leçon), puisque
-- c'est le cours qui porte le contenu :
--
--   - la VIDÉO PRINCIPALE reste `course_lessons.resource_url`, avec sa durée
--     et, désormais, son format d'image (`ratio` : 16:9, 9:16, 4:3, 1:1) ;
--   - les VIDÉOS D'ILLUSTRATION sont des `lesson_assets` de genre
--     'illustration' — elles se jouent DANS le lecteur, à la place de la
--     vidéo principale, et ne comptent jamais dans la progression ;
--   - les AUTRES RESSOURCES — PDF, document, audio, image — sont des
--     `lesson_assets` de genre 'ressource'.
--
-- Une seule table pour les deux, parce qu'une illustration et une ressource
-- partagent les mêmes champs ; le genre les sépare, et chacun garde sa propre
-- numérotation (la première illustration est 1, la première ressource est 1).
--
-- Aucune donnée existante n'est touchée : un cours sans ressource reste
-- exactement ce qu'il était.

CREATE TABLE lesson_assets (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES course_lessons(id),
  -- 'illustration' : une vidéo d'illustration, jouée dans le lecteur.
  -- 'ressource'    : un document, un audio, une image — à télécharger ou à lire.
  kind TEXT NOT NULL CHECK (kind IN ('illustration', 'ressource')),
  position INTEGER NOT NULL CHECK (position > 0),
  title TEXT NOT NULL,
  -- 'video' pour une illustration ; 'pdf', 'doc', 'audio', 'image' ou 'autre'
  -- pour une ressource — les mêmes libellés que le prototype.
  type TEXT NOT NULL CHECK (type IN ('video', 'pdf', 'doc', 'audio', 'image', 'autre')),
  url TEXT,
  duration TEXT, -- « 6:00 » pour une vidéo
  ratio TEXT,    -- 16:9, 9:16, 4:3 ou 1:1
  size TEXT,     -- « 1,1 Mo » pour un document
  UNIQUE (lesson_id, kind, position)
);

-- Colonne additive : le format d'image de la vidéo principale (16:9 par défaut).
ALTER TABLE course_lessons ADD COLUMN ratio TEXT;
