-- LE CHAPITRE — le niveau qui manquait entre la formation et le module.
--
-- Le propriétaire a fixé la hiérarchie, et elle est celle du prototype :
--   une FORMATION contient des CHAPITRES,
--   un CHAPITRE contient des MODULES,
--   un MODULE contient les COURS (les leçons), les illustrations, les PDF.
--
-- Jusqu'ici le campus ne connaissait que formation -> module -> leçon : le
-- module servait de chapitre. Plutôt que de reconstruire `course_lessons`
-- (qui casserait vingt-trois fichiers), on place le chapitre AU-DESSUS :
--   - `course_chapters` est le niveau nouveau ;
--   - `course_modules` devient réellement le module, et reçoit son chapitre ;
--   - `course_lessons` ne bouge pas d'un pouce : un cours reste la leçon d'un
--     module, et toutes les lectures existantes restent justes.
--
-- REPRISE SANS PERTE : chaque formation qui possède déjà des modules reçoit
-- un « Chapitre 1 » qui les regroupe tous. Aucun module n'est orphelin, aucun
-- cours n'est déplacé, aucune progression n'est effacée.

CREATE TABLE course_chapters (
  id TEXT PRIMARY KEY,
  training_id TEXT NOT NULL REFERENCES trainings(id),
  position INTEGER NOT NULL CHECK (position > 0),
  title TEXT NOT NULL,
  summary TEXT,
  UNIQUE (training_id, position)
);

-- Colonne additive : NULL toléré le temps de la reprise ci-dessous.
ALTER TABLE course_modules ADD COLUMN chapter_id TEXT REFERENCES course_chapters(id);

-- Reprise : un chapitre par formation déjà pourvue, identifiant déterministe.
INSERT INTO course_chapters (id, training_id, position, title)
SELECT 'chap-1-' || t.id, t.id, 1, 'Chapitre 1'
FROM trainings t
WHERE EXISTS (SELECT 1 FROM course_modules m WHERE m.training_id = t.id);

UPDATE course_modules
SET chapter_id = 'chap-1-' || training_id
WHERE chapter_id IS NULL
  AND EXISTS (SELECT 1 FROM course_chapters c WHERE c.id = 'chap-1-' || course_modules.training_id);
