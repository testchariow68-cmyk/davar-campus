-- 010_cycle_de_vie — le journal de purge et la quarantaine des comptes.
--
-- Porté du prototype (`js/lifecycle.js`, §41) : « journal de purge minimal,
-- jamais de contenu ». On n'y écrit QUE des compteurs et des motifs — aucune
-- donnée personnelle, aucun texte d'étudiant : un journal de purge qui
-- contiendrait les données qu'il prétend effacer serait une faute.
--
-- Aucune suppression, aucune transformation : uniquement des ajouts.

CREATE TABLE purge_log (
  id TEXT PRIMARY KEY,
  -- Nature de ce qui a été purgé : sessions, jetons, notifications, conversations, compte…
  kind TEXT NOT NULL,
  count INTEGER NOT NULL,
  -- Résultat lisible : « purgé et vérifié », « exception conservée »…
  result TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  at_ms INTEGER NOT NULL
);
CREATE INDEX idx_purge_log_at ON purge_log(at_ms);

CREATE TABLE purge_pending (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  -- §22 : une exception documentée (litige, obligation, correction en cours)
  -- suspend la purge sans jamais l'oublier.
  hold INTEGER NOT NULL DEFAULT 0 CHECK (hold IN (0,1)),
  at_ms INTEGER NOT NULL,
  cancelled_at_ms INTEGER,
  executed_at_ms INTEGER,
  UNIQUE (user_id)
);
CREATE INDEX idx_purge_pending_user ON purge_pending(user_id);
