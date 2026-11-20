-- INTERACTIONS PUBLIQUES D'UN COURS — réactions emoji et commentaires.
--
-- Les réactions et les commentaires appartiennent à la leçon (la vidéo
-- principale affichée par le campus), pas au navigateur : tous les étudiants
-- inscrits à la formation lisent donc exactement le même état partagé.
--
-- Une personne peut choisir plusieurs emojis, mais un même emoji ne peut être
-- ajouté qu'une fois par personne et par le cours. Un commentaire peut répondre
-- à un commentaire racine ; la règle qui n'autorise qu'un niveau de réponse est
-- appliquée par le serveur pour rester identique au prototype.

CREATE TABLE lesson_reactions (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES course_lessons(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  emoji TEXT NOT NULL CHECK (emoji IN ('👍', '❤️', '🔥', '👏', '😂', '🤩')),
  created_at_ms INTEGER NOT NULL,
  UNIQUE (lesson_id, user_id, emoji)
);
CREATE INDEX idx_lesson_reactions_lesson ON lesson_reactions(lesson_id, created_at_ms);

CREATE TABLE lesson_comments (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES course_lessons(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT REFERENCES lesson_comments(id),
  text TEXT NOT NULL CHECK (length(text) > 0),
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_lesson_comments_lesson ON lesson_comments(lesson_id, created_at_ms);
