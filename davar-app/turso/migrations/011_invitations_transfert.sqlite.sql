-- 011_invitations_transfert — inviter sans créer de compte, et transférer la propriété.
--
-- Deux décisions du propriétaire servies ici :
--   « Inviter un membre du staff » par e-mail (valable 7 jours) et « accès
--   gracieux » étudiant (valable 3 jours) — le prototype dit : « s'il expire,
--   rien n'est conservé en base : il n'existe qu'une fois son compte configuré » ;
--   « Super Admin unique + transfert de propriété (mot de passe + confirmation
--   par e-mail) », avec la sortie de secours « ce n'était pas moi ».
--
-- Seule l'EMPREINTE du lien d'invitation est rangée : un vol de base ne permet
-- pas d'entrer dans un compte.
--
-- Aucune suppression, aucune transformation : uniquement des ajouts.

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('staff','student_grace')),
  -- Rôles cumulables du prototype, rangés tels quels pour l'affichage.
  roles TEXT NOT NULL DEFAULT '',
  -- Accès gracieux : la formation offerte, s'il y en a une.
  training_id TEXT REFERENCES trainings(id),
  token_hash TEXT NOT NULL UNIQUE,
  message TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  used_at_ms INTEGER,
  used_by TEXT REFERENCES users(id)
);
CREATE INDEX idx_invites_email ON invites(email_normalized);

CREATE TABLE ownership_transfers (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL REFERENCES users(id),
  to_email TEXT NOT NULL,
  to_user TEXT REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  confirmed_at_ms INTEGER,
  cancelled_at_ms INTEGER,
  -- « ce n'était pas moi » : la raison est conservée, jamais effacée.
  cancelled_reason TEXT
);
CREATE INDEX idx_transferts_etat ON ownership_transfers(confirmed_at_ms, cancelled_at_ms);
