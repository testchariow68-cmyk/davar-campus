-- 016 — Le journal de l'équipe : chaque action de chaque membre.
--
-- Pourquoi maintenant : le prototype a un écran « Activités de l'équipe » qui
-- liste les actions du staff, marque les plus lourdes comme IMPORTANTES, et les
-- cache au manager quand elles viennent du Super Administrateur. Rien dans la
-- base ne portait ce récit — les compteurs de quota (`ops_events`) ne parlent que
-- des dérivations et des e-mails, pas des décisions humaines.
--
-- `actor_id` est nullable à dessein : une action déclenchée par le système (une
-- purge automatique, un cycle d'assiduité) a le droit d'exister sans personne.
-- Additif uniquement : aucune table existante n'est modifiée.
CREATE TABLE staff_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0,1)),
  at_ms INTEGER NOT NULL
);
CREATE INDEX idx_staff_events_at ON staff_events(at_ms);
CREATE INDEX idx_staff_events_actor ON staff_events(actor_id, at_ms);
