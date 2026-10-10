-- DAVAR Campus / Turso seul — migration 004 : dérivation du mot de passe côté client.
-- ADDITIVE UNIQUEMENT : aucun DROP, DELETE, TRUNCATE, aucune donnée insérée.
--
-- Principe : le navigateur de l'étudiant effectue la dérivation coûteuse
-- (PBKDF2-SHA256, 600 000 itérations). Le serveur ne reçoit qu'une clé dérivée
-- de 256 bits et la revérifie à faible coût CPU — indispensable pour tenir dans
-- l'offre Cloudflare Workers gratuite (10 ms de CPU par requête), sans payer
-- d'hébergement supplémentaire et sans affaiblir la protection hors ligne.
--
-- Colonnes ajoutées aux comptes existants (NULL = compte hérité, haché côté
-- serveur) : aucune réécriture, aucune perte.
PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN kdf_scheme TEXT;
ALTER TABLE users ADD COLUMN client_salt TEXT;
ALTER TABLE users ADD COLUMN client_iterations INTEGER;

-- Sel public propre à chaque compte (jamais secret, mais unique), et nombre
-- d'itérations réellement employé par le client au moment de la création.
-- Le vérificateur stocké reste dans users.password_hash.
