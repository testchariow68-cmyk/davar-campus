-- 005 — Comptes de TEST (vue test), séparés des comptes réels
--
-- Décision du propriétaire (6 octobre 2026) :
--   « les comptes de démonstration seront effacés », et les comptes qui restent,
--   pour voir les écrans, deviennent des COMPTES DE TEST, rangés du côté
--   « vue test » — et jamais mêlés aux personnes réelles.
--
-- Conséquences dans la base :
--   • un compte de test est un compte ordinaire, techniquement identique,
--   • il porte seulement la marque `is_test = 1`,
--   • les chiffres réels de la plateforme (vue d'ensemble de la direction)
--     l'excluent : un test ne doit jamais gonfler un compteur,
--   • il peut porter la marque ET rester utilisable : c'est ce qui permet de
--     voir le campus côté étudiant avec les VRAIES formations et les vraies
--     leçons, sans toucher aux données d'une personne réelle.
--
-- Migration strictement additive : une colonne et un index, aucun objet détruit.
ALTER TABLE users ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_users_is_test ON users(is_test);
