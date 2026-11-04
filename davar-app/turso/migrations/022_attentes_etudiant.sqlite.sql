-- 022 — LES ATTENTES DE L'ÉTUDIANT, DEMANDÉES DÈS SON ARRIVÉE.
--
-- Le propriétaire a fixé trois temps, et le premier n'est pas un avis : quand
-- l'étudiant arrive, on lui demande ce qu'il ATTEND de la formation. L'avis,
-- lui, ne vient qu'ensuite — à quinze jours, quand il a déjà une expérience à
-- raconter, puis à trente jours, quand il touche à la fin.
--
-- Les attentes ne sont donc pas des avis : elles vivent dans leur propre table
-- (une seule fois par étudiant et par formation), sans note, sans modération,
-- et sans rien qui puisse être publié. Comme l'avis, l'audio n'est conservé
-- QUE transcrit : le propriétaire ne reçoit jamais que de l'écrit.
CREATE TABLE attentes_etudiants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  training_id TEXT NOT NULL REFERENCES trainings(id),
  kind TEXT NOT NULL DEFAULT 'ecrit' CHECK (kind IN ('ecrit', 'audio')),
  body TEXT NOT NULL,
  words INTEGER NOT NULL DEFAULT 0,
  transcribed_by TEXT,
  at_ms INTEGER NOT NULL,
  UNIQUE (user_id, training_id)
);
CREATE INDEX idx_attentes_user ON attentes_etudiants(user_id, training_id);
