-- La carte du catalogue, telle que la dessine le prototype :
--   un badge de NIVEAU posé sur la couverture ;
--   sous le titre, la RÉFÉRENCE et la NOTE (« OR-101 · ⭐ 4.9 ») ;
--   dans les métadonnées, la DURÉE en heures.
-- Ces quatre valeurs n'existaient nulle part : les cartes en ligne les
-- réclament donc pour être la copie conforme du prototype.
-- Le niveau et la durée reprennent les valeurs que le prototype attribue à
-- toute formation créée (« Débutant », 8 h) ; la référence et la note restent
-- vides tant qu'elles ne sont pas renseignées, et la carte les masque.
ALTER TABLE trainings ADD COLUMN code TEXT;
ALTER TABLE trainings ADD COLUMN level TEXT NOT NULL DEFAULT 'Débutant';
ALTER TABLE trainings ADD COLUMN hours INTEGER NOT NULL DEFAULT 8;
ALTER TABLE trainings ADD COLUMN rating REAL;
