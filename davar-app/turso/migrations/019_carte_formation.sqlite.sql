-- La carte du catalogue, telle que la dessine le prototype :
--   sous le titre, la RÉFÉRENCE et la NOTE (« OR-101 · ⭐ 4.9 ») ;
--   dans les métadonnées, la DURÉE en heures.
-- Ces trois valeurs n'existaient nulle part : les cartes en ligne les
-- réclament donc pour être la copie conforme du prototype.
-- Aucune valeur par défaut : tant que le propriétaire n'a rien renseigné, la
-- carte n'affiche rien plutôt que d'afficher un chiffre qui serait faux. La
-- durée reste à 0 et la note vide ; la référence, elle, est composée à la
-- création de la formation.
ALTER TABLE trainings ADD COLUMN code TEXT;
ALTER TABLE trainings ADD COLUMN hours INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trainings ADD COLUMN rating REAL;
