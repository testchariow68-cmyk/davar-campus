/**
 * Découpe un fichier SQLite en instructions sans confondre les points-virgules
 * des commentaires ou des chaînes avec la fin d'une instruction.
 *
 * Les migrations sont contrôlées avant toute écriture distante. Un découpage
 * naïf sur `;` avait laissé passer les commentaires placés après une indentation
 * et faisait croire que la migration 026 contenait trois DDL au lieu de deux.
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let courant = '';
  let quote = null;
  let commentaireLigne = false;
  let commentaireBloc = false;

  for (let index = 0; index < sql.length; index += 1) {
    const caractere = sql[index];
    const suivant = sql[index + 1];

    if (commentaireLigne) {
      if (caractere === '\n') {
        commentaireLigne = false;
        courant += '\n';
      }
      continue;
    }
    if (commentaireBloc) {
      if (caractere === '*' && suivant === '/') {
        commentaireBloc = false;
        index += 1;
      } else if (caractere === '\n') {
        courant += '\n';
      }
      continue;
    }

    if (!quote && caractere === '-' && suivant === '-') {
      commentaireLigne = true;
      index += 1;
      continue;
    }
    if (!quote && caractere === '/' && suivant === '*') {
      commentaireBloc = true;
      index += 1;
      continue;
    }

    if (quote) {
      courant += caractere;
      if (caractere === quote) {
        // SQL échappe une apostrophe/guillemet par sa répétition.
        if (suivant === quote) {
          courant += suivant;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (caractere === "'" || caractere === '"' || caractere === '`') {
      quote = caractere;
      courant += caractere;
      continue;
    }

    if (caractere === ';') {
      const instruction = courant.trim();
      if (instruction) statements.push(instruction);
      courant = '';
      continue;
    }
    courant += caractere;
  }

  const derniere = courant.trim();
  if (derniere) statements.push(derniere);
  return statements;
}
