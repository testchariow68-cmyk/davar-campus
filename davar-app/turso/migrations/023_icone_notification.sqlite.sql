-- 023 — L'ICÔNE D'UNE NOTIFICATION.
--
-- Quand une récompense est décernée, la notification doit porter l'ICÔNE du
-- badge, telle qu'elle est dans la plateforme : c'est la décision du
-- propriétaire, et une notification sans icône propre ne la respecte pas.
-- Additif : aucune table n'est créée, aucune ligne n'est modifiée.
ALTER TABLE notifications ADD COLUMN icon TEXT;
