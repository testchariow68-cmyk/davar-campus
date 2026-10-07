'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { messageDe, poster } from './api';

type MembreVue = {
  id: string;
  email: string;
  nom: string;
  role: string;
  statut: string;
  confirme: boolean;
  estTest: boolean;
  derniereConnexionMs: number | null;
};

const LIBELLES: Record<string, string> = { admin: 'Propriétaire', staff: 'Membre du staff', student: 'Étudiant' };

/**
 * Nommer son équipe. Règle du projet : le propriétaire est unique.
 * Élever un second administrateur est refusé ; rétrograder le dernier est refusé aussi.
 */
export function EquipeOutils({ equipe, suggestions }: { equipe: MembreVue[]; suggestions: { email: string; nom: string }[] }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [bilan, setBilan] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function agir(corps: Record<string, unknown>) {
    setEnCours(true);
    const reponse = await poster('/api/direction/people', corps);
    setBilan({ ok: reponse.ok, texte: messageDe(reponse) });
    setEnCours(false);
    if (reponse.ok) router.refresh();
  }

  return (
    <div>
      {bilan && (
        <div className={`banner ${bilan.ok ? 'ok' : 'err'} mb16`} role="status">
          <span>{bilan.texte}</span>
        </div>
      )}

      {equipe.length === 0 ? (
        <div className="banner info mb16">
          <span>Vous êtes seul pour l&apos;instant. Nommez un membre de confiance ci-dessous : il pourra vous aider à diriger.</span>
        </div>
      ) : (
        <div className="card card-pad mb16" style={{ overflowX: 'auto' }}>
          <table className="dv-tbl">
            <thead>
              <tr>
                <th>Personne</th>
                <th>Rôle</th>
                <th>État</th>
                <th>Dernière connexion</th>
                <th>Rôle</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {equipe.map((membre) => (
                <tr key={membre.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{membre.nom}</div>
                    <div className="small muted">{membre.email}</div>
                  </td>
                  <td>
                    <select
                      className="inp"
                      style={{ maxWidth: 190 }}
                      value={membre.role}
                      disabled={enCours}
                      onChange={(e) => agir({ action: 'set-role', email: membre.email, role: e.target.value })}
                    >
                      <option value="admin">Propriétaire</option>
                      <option value="staff">Membre du staff</option>
                      <option value="student">Étudiant</option>
                    </select>
                  </td>
                  <td>
                    {membre.confirme ? (
                      <span className="dv-tag open">e-mail confirmé</span>
                    ) : (
                      <span className="dv-tag closed">e-mail non confirmé</span>
                    )}
                  </td>
                  <td className="small muted">
                    {membre.derniereConnexionMs ? new Date(membre.derniereConnexionMs).toLocaleDateString('fr-FR') : 'jamais'}
                  </td>
                  <td>
                    <div className="small muted">{LIBELLES[membre.role] ?? membre.role}</div>
                    {membre.estTest ? <span className="dv-tag">compte de test</span> : null}
                  </td>
                  <td className="small muted">
                    <button
                      className="dv-mini"
                      disabled={enCours}
                      onClick={() => agir({ action: 'toggle-test', email: membre.email, estTest: !membre.estTest })}
                    >
                      {membre.estTest ? 'Compte réel' : 'Marquer test'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card card-pad">
        <h4 className="mb8">Nommer quelqu&apos;un</h4>
        <p className="small muted mb16">
          La personne doit d&apos;abord avoir créé son compte sur le campus. Un membre du staff peut tout consulter ; seul le
          propriétaire peut modifier.
        </p>
        <div className="grid g3" style={{ gap: 12 }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="eq-email">Adresse e-mail</label>
            <input id="eq-email" className="inp" value={email} onChange={(e) => setEmail(e.target.value)} list="eq-suggestions" placeholder="adresse@exemple.com" />
            <datalist id="eq-suggestions">
              {suggestions.map((suggestion) => (
                <option key={suggestion.email} value={suggestion.email}>
                  {suggestion.nom}
                </option>
              ))}
            </datalist>
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="eq-role">Rôle</label>
            <select id="eq-role" className="inp" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="staff">Membre du staff</option>
              <option value="admin">Propriétaire (transféré)</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary" disabled={enCours || !email.includes('@')} onClick={() => agir({ action: 'set-role', email, role })}>
          Attribuer ce rôle
        </button>
      </div>
    </div>
  );
}
