-- 024 — UNE PIÈCE JOINTE SUR UN MESSAGE.
--
-- « Il faut que la personne ait la possibilité de charger un fichier pour
-- pouvoir prendre une capture et l'envoyer au support » : le propriétaire l'a
-- demandé, le prototype ne le portait pas. Une capture d'écran joint à un
-- signalement vaut mieux qu'un long texte.
--
-- Additif : aucune table n'est créée, aucune ligne n'est modifiée. Seul le nom
-- du fichier et sa clé dans le stockage sont retenus — jamais le fichier en
-- base, qui resterait à charge de la base de données.
ALTER TABLE conversation_messages ADD COLUMN file_key TEXT;
ALTER TABLE conversation_messages ADD COLUMN file_name TEXT;
