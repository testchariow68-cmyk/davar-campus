-- 018 — Mettre un avis en avant.
--
-- Pourquoi maintenant : le prototype propose une étoile (✦) sur chaque avis
-- reçu (« Mettre en avant dans le catalogue »), et affiche les trois avis
-- retenus dans un bandeau « Ils témoignent » sur la page du catalogue. Rien
-- dans la base ne portait ce choix.
--
-- Additif uniquement : une colonne, à 0 partout. Aucun avis n'est modifié.
ALTER TABLE reviews ADD COLUMN spotlight INTEGER NOT NULL DEFAULT 0;
