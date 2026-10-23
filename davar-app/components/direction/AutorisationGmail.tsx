'use client';

import { useEffect, useState } from 'react';

/**
 * L'AUTORISATION UNE FOIS POUR TOUTE.
 *
 * Le propriétaire ouvre l'adresse de Google une seule fois, accepte, et colle
 * ici le code que Google lui donne. La plateforme garde ensuite un jeton de
 * rafraîchissement : il n'a plus jamais à recommencer.
 */
type Etat = { configure: boolean; autorise: boolean; compte: string | null };

export function AutorisationGmail({ actif }: { actif: boolean }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [code, setCode] = useState('');
  const [retour, setRetour] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let vivant = true;
    fetch('/api/direction/systeme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'etat' }),
    })
      .then((reponse) => reponse.json())
      .then((donnees: { gmail?: Etat }) => {
        if (vivant && donnees.gmail) setEtat(donnees.gmail);
      })
      .catch(() => {
        /* l'écran reste utilisable sans cet état */
      });
    return () => {
      vivant = false;
    };
  }, []);

  async function poster(corps: Record<string, unknown>): Promise<Record<string, unknown>> {
    setNote(null);
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await fetch('/api/direction/systeme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
      if (!donnees.ok) setErreur(typeof donnees.message === 'string' ? donnees.message : 'Refusé.');
      else if (typeof donnees.message === 'string') setNote(donnees.message);
      return donnees;
    } finally {
      setEnCours(false);
    }
  }

  async function demanderLeLien() {
    const donnees = await poster({ action: 'gmail_lien' });
    if (typeof donnees.url === 'string') {
      setRetour(typeof donnees.retour === 'string' ? donnees.retour : '');
      window.open(donnees.url, '_blank', 'noopener');
    }
  }

  async function autoriser() {
    const donnees = await poster({ action: 'gmail_autoriser', code, retour });
    if (donnees.ok) {
      setCode('');
      setEtat({ configure: true, autorise: true, compte: typeof donnees.compte === 'string' ? donnees.compte : null });
    }
  }

  async function revoquer() {
    await poster({ action: 'gmail_revoquer' });
    setEtat((precedent) => (precedent ? { ...precedent, autorise: false, compte: null } : precedent));
  }

  if (!etat?.configure && !actif) return null;

  return (
    <div className="card card-pad mb16">
      <div className="eyebrow mb8">Envoi par Gmail</div>
      {!etat?.configure ? (
        <p className="small muted">
          Les identifiants Google ne sont pas encore enregistrés sur le serveur. Rien n’est à faire ici : les e-mails
          continuent de partir par le relais Apps Script, qui est la voie en service aujourd’hui.
        </p>
      ) : etat.autorise ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge b-green">Autorisation enregistrée</span>
          <span className="small">{etat.compte ?? 'boîte Gmail autorisée'}</span>
          <button className="btn btn-sm" onClick={revoquer} disabled={enCours}>
            Retirer l’autorisation
          </button>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          <p className="small muted">
            Une seule fois : ouvrez l’adresse de Google, acceptez l’envoi au nom de l’académie, puis collez ci-dessous le
            code que Google vous donne. La plateforme envoie ensuite sans jamais vous redemander.
          </p>
          <button className="btn btn-sm" onClick={demanderLeLien} disabled={enCours}>
            1. Ouvrir l’autorisation Google
          </button>
          {retour ? (
            <p className="xs muted">
              À déclarer dans la console Google, à l’identique : <code>{retour}</code>
            </p>
          ) : null}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input
              className="inp"
              value={code}
              onChange={(evenement) => setCode(evenement.target.value)}
              placeholder="2. Collez le code fourni par Google"
              style={{ minWidth: 280 }}
            />
            <button className="btn btn-sm" onClick={autoriser} disabled={enCours || code.trim().length < 10}>
              Valider
            </button>
          </div>
        </div>
      )}
      {note ? <p className="small mt8">{note}</p> : null}
      {erreur ? <p className="small mt8" style={{ color: 'var(--danger, #b42318)' }}>{erreur}</p> : null}
    </div>
  );
}
