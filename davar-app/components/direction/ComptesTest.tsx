'use client';

import { useState } from 'react';
import { Icon } from '@/components/campus/Icon';

/**
 * LES COMPTES DE TEST — le propriétaire les prépare ici, puis les ouvre par
 * « Tester une vue », depuis la barre du haut du campus comme de la Direction.
 *
 * Ce que ces comptes ne sont PAS : des personnes. Ils ne comptent dans aucun
 * chiffre, ne reçoivent rien, et ne peuvent pas se connecter — leur code secret
 * est calculé sur un secret aléatoire jetable, jamais conservé.
 */
export type CompteTestVue = {
  id: string;
  nom: string;
  courriel: string;
  libelle: string;
  role: string;
  roles: string[];
};

export function ComptesTest({
  comptesInitiaux,
  modeles,
}: {
  comptesInitiaux: CompteTestVue[];
  modeles: Array<{ id: string; nom: string; courriel: string; role: string; roles: string }>;
}) {
  const [comptes, setComptes] = useState(comptesInitiaux);
  const [bilan, setBilan] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const manquants = modeles.filter((modele) => !comptes.some((compte) => compte.id === modele.id));

  async function agir(action: 'creer' | 'retirer') {
    setEnCours(true);
    setBilan(null);
    try {
      const reponse = await fetch('/api/direction/comptes-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        comptes?: CompteTestVue[];
      };
      if (Array.isArray(donnees.comptes)) setComptes(donnees.comptes);
      setBilan(donnees.message ?? (donnees.ok ? 'Fait.' : 'Opération impossible pour le moment.'));
    } catch {
      setBilan('Le serveur n’a pas répondu : réessayez dans un instant.');
    }
    setEnCours(false);
  }

  return (
    <div className="card card-pad">
      <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
        <h3 className="mb0">Les comptes de test</h3>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary" disabled={enCours || manquants.length === 0} onClick={() => agir('creer')}>
            <Icon nom="plus" taille={14} />{' '}
            {manquants.length === 0 ? 'Tous en place' : `Préparer les ${manquants.length} compte(s) manquant(s)`}
          </button>
          <button className="btn" disabled={enCours || comptes.length === 0} onClick={() => agir('retirer')}>
            <Icon nom="trash" taille={14} /> Les retirer
          </button>
        </div>
      </div>

      <p className="small muted mt8">
        Un compte de test par vue : l’étudiant, puis chaque rôle de l’équipe. Ils ne comptent dans aucun chiffre, ne
        reçoivent aucune notification, et <b>ne peuvent pas se connecter</b> — leur code secret est calculé sur un secret
        aléatoire que personne ne garde. Ils ne s’ouvrent que par « Tester une vue », et par vous seul.
      </p>
      <p className="small muted">
        Pendant un essai, ce que vous faites <b>au nom d’un compte de test</b> apparaît normalement dans vos files
        (devoirs à corriger, avis, certificats) : c’est voulu, vous regardez le vrai campus. Ces comptes ne comptent
        jamais dans vos chiffres, et « Les retirer » efface tout ce qu’ils ont laissé.
      </p>

      {bilan && (
        <p className="small muted mb8" role="status">
          {bilan}
        </p>
      )}

      {comptes.length === 0 ? (
        <div className="banner info mt8">
          <span>
            Aucun compte de test pour l’instant : « Tester une vue » n’a donc rien à ouvrir. Préparez les huit comptes du
            prototype pour regarder le campus avec les yeux d’un étudiant, d’un coach, d’un correcteur, d’un support, d’un
            analyste ou d’un manager.
          </span>
        </div>
      ) : (
        <table className="dv-tbl mt8">
          <thead>
            <tr>
              <th>Vue</th>
              <th>Adresse</th>
              <th>Ce que cette vue ouvre</th>
            </tr>
          </thead>
          <tbody>
            {comptes.map((compte) => (
              <tr key={compte.id}>
                <td>
                  <b>{compte.libelle}</b>
                </td>
                <td className="small muted">{compte.courriel}</td>
                <td className="small muted">
                  {compte.role === 'student'
                    ? 'Le campus étudiant, avec vos vraies formations'
                    : compte.roles.join(', ') || 'vue d’ensemble seulement'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
