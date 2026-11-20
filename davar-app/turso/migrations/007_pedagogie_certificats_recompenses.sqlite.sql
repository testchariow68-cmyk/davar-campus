-- 007_pedagogie_certificats_recompenses.sqlite.sql — exercices, évaluations,
-- certificats, badges, avis et ressources entrent en base.
--
-- Décisions du propriétaire servies ici :
--   « tout brancher : assistants et absolument tout » (7 octobre 2026) ;
--   l'EXERCICE ne bloque jamais la progression ; l'ÉVALUATION la bloque
--   (score minimum, puis validation humaine) ;
--   le certificat ne se télécharge pas : il se DEMANDE, se valide à la main,
--   puis se vérifie par un code public ;
--   les avis sont obligatoires (~2 semaines / 1 mois), 1 000 mots maximum,
--   écrits ou audio transcrits — le propriétaire ne reçoit que l'écrit ;
--   les ressources (livres, audios, fichiers) s'attribuent à tous ou à un
--   étudiant précis.
--
-- Aucune suppression, aucune transformation : uniquement des ajouts.

-- ── Exercices (jamais bloquants) et évaluations (bloquantes) ──────────────
CREATE TABLE lesson_exercises (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES course_lessons(id),
  title TEXT NOT NULL,
  intro TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_exercises_lesson ON lesson_exercises(lesson_id);

CREATE TABLE lesson_assessments (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES course_lessons(id),
  title TEXT NOT NULL,
  intro TEXT,
  -- Score minimum en pourcentage. Les documents du propriétaire disent 80 %.
  min_score INTEGER NOT NULL DEFAULT 80 CHECK (min_score > 0 AND min_score <= 100),
  -- Validation humaine obligatoire après réussite, quand le propriétaire l'exige.
  requires_review INTEGER NOT NULL DEFAULT 1 CHECK (requires_review IN (0,1)),
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_assessments_lesson ON lesson_assessments(lesson_id);

CREATE TABLE quiz_questions (
  id TEXT PRIMARY KEY,
  parent_kind TEXT NOT NULL CHECK (parent_kind IN ('exercise','assessment')),
  parent_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  answer_index INTEGER NOT NULL,
  explain TEXT,
  UNIQUE (parent_kind, parent_id, position)
);

-- Les réponses de l'étudiant : l'exercice est un entraînement, pas un examen.
CREATE TABLE quiz_answers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  question_id TEXT NOT NULL REFERENCES quiz_questions(id),
  choice_index INTEGER NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0,1)),
  at_ms INTEGER NOT NULL
);
CREATE INDEX idx_answers_user ON quiz_answers(user_id, question_id);

CREATE TABLE assessment_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  assessment_id TEXT NOT NULL REFERENCES lesson_assessments(id),
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  pct INTEGER NOT NULL,
  passed INTEGER NOT NULL CHECK (passed IN (0,1)),
  at_ms INTEGER NOT NULL
);
CREATE INDEX idx_attempts_user ON assessment_attempts(user_id, assessment_id);

-- ── Devoirs rendus (évaluations ouvertes), validés par un humain ──────────
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  assessment_id TEXT NOT NULL REFERENCES lesson_assessments(id),
  training_id TEXT NOT NULL REFERENCES trainings(id),
  file_key TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','refused')),
  feedback TEXT,
  decided_at_ms INTEGER,
  decided_by TEXT,
  at_ms INTEGER NOT NULL
);
CREATE INDEX idx_submissions_status ON submissions(status, at_ms);
CREATE INDEX idx_submissions_user ON submissions(user_id);

-- ── Certificats : demandés, validés à la main, vérifiables par un code ────
CREATE TABLE certificate_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  training_id TEXT NOT NULL REFERENCES trainings(id),
  -- Le nom au moment de la demande : le certificat est FIGÉ, jamais réécrit.
  holder_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','refused')),
  motif TEXT,
  at_ms INTEGER NOT NULL,
  decided_at_ms INTEGER,
  decided_by TEXT
);
CREATE INDEX idx_cert_requests_status ON certificate_requests(status, at_ms);

CREATE TABLE certificates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  training_id TEXT NOT NULL REFERENCES trainings(id),
  holder_name TEXT NOT NULL,
  formation_title TEXT NOT NULL,
  request_id TEXT REFERENCES certificate_requests(id),
  issued_at_ms INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  revoked_reason TEXT
);
CREATE INDEX idx_certificates_user ON certificates(user_id, issued_at_ms);

-- ── Récompenses : le catalogue est préconfiguré, jamais inventé ───────────
CREATE TABLE badge_defs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cat TEXT NOT NULL,
  icon TEXT NOT NULL,
  description TEXT,
  short_text TEXT,
  emotion_text TEXT,
  training_id TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  auto_rule TEXT
);

CREATE TABLE badge_awards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  badge_id TEXT NOT NULL REFERENCES badge_defs(id),
  training_id TEXT,
  source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manuel')),
  awarded_by TEXT,
  at_ms INTEGER NOT NULL,
  UNIQUE (user_id, badge_id)
);
CREATE INDEX idx_badge_awards_user ON badge_awards(user_id, at_ms);

-- ── Avis obligatoires : ~2 semaines / 1 mois, 1 000 mots, écrit ou audio ──
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  training_id TEXT NOT NULL REFERENCES trainings(id),
  kind TEXT NOT NULL DEFAULT 'ecrit' CHECK (kind IN ('ecrit','audio')),
  body TEXT NOT NULL,
  words INTEGER NOT NULL DEFAULT 0,
  -- Transcription d'un avis audio : le propriétaire ne reçoit QUE l'écrit.
  transcribed_by TEXT,
  step INTEGER NOT NULL DEFAULT 1 CHECK (step IN (1,2)),
  due_at_ms INTEGER NOT NULL,
  at_ms INTEGER NOT NULL
);
CREATE INDEX idx_reviews_user ON reviews(user_id, training_id, step);

-- ── Ressources : livres, audios, fichiers — à tous ou à un étudiant ───────
CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  training_id TEXT REFERENCES trainings(id),
  kind TEXT NOT NULL CHECK (kind IN ('book','audio','file')),
  title TEXT NOT NULL,
  description TEXT,
  cover_key TEXT,
  file_key TEXT,
  duration_min INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0,1)),
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE resource_allocations (
  resource_id TEXT NOT NULL REFERENCES resources(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  allocated_by TEXT,
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (resource_id, user_id)
);
