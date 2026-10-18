-- 017 — Le téléphone et le pays du compte.
--
-- Pourquoi maintenant : le prototype demande le téléphone à trois endroits —
-- le profil (« Téléphone »), les paramètres (« Pays & téléphone ») et la
-- commande (« Téléphone pour le paiement ») — et il choisit la passerelle
-- d'encaissement d'après le pays du compte. Rien dans la base ne portait ces
-- deux valeurs.
--
-- Additif uniquement : deux colonnes, vides tant que l'étudiant ne les a pas
-- données. Aucune ligne existante n'est touchée.
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN country TEXT;
