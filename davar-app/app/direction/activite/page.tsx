import { redirect } from 'next/navigation';
import Link from 'next/link';
import { analyseActivite } from '@/lib/server/analytique';
import { sessionSection } from '@/lib/server/direction-access';
import { depuis } from '@/lib/server/campus-recents';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activité des étudiants — Direction' };

/**
 * ACTIVITÉ DES ÉTUDIANTS — qui vient, qui travaille, qui décroche.
 *
 * « Dernière activité » est la plus récente de TOUTES les traces de l'étudiant :
 * leçon terminée, moyenne lue, devoir rendu, certificat reçu, question posée à
 * l'assistant. Un étudiant qui travaille sans se reconnecter n'est donc jamais
 * compté comme endormi — et un étudiant qui ne fait rien se voit, lui.
 */
export default async function ActivitePage() {
  const session = await sessionSection('activite');
  if (!session) redirect('/connexion');

  const analyse = await analyseActivite(session.db);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Activité des étudiants</h1>
          <p>Fréquence de connexion (30 j) et dernière activité — staff exclu.</p>
        </div>
      </div>

      <div className="grid g3 mb16">
        <div className="card card-pad">
          <div className="eyebrow">Étudiants suivis</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{analyse.suivis}</div>
          <div className="xs muted">Les comptes de test ne sont comptés nulle part.</div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Actifs sur 30 jours</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{analyse.actifsTrenteJours}</div>
          <div className="xs muted">
            {analyse.suivis === 0
              ? 'Aucun étudiant pour l’instant.'
              : `${Math.round((analyse.actifsTrenteJours / analyse.suivis) * 100)} % des étudiants suivis se sont connectés.`}
          </div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Sans connexion</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{analyse.jamaisConnectes}</div>
          <div className="xs muted">
            n’ont jamais ouvert le campus · {analyse.endormis} endormi(s) depuis plus de 30 jours.
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ overflowX: 'auto' }}>
        {analyse.etudiants.length === 0 ? (
          <div className="empty small">Aucun étudiant pour l&apos;instant.</div>
        ) : (
          <table className="dv-tbl">
            <thead>
              <tr>
                <th>Étudiant</th>
                <th>Connexions (30 j)</th>
                <th>Dernière connexion</th>
                <th>Dernière activité</th>
                <th>Questions (30 j)</th>
              </tr>
            </thead>
            <tbody>
              {analyse.etudiants.map((etudiant) => (
                <tr key={etudiant.id}>
                  <td>
                    <b className="small">{etudiant.nom}</b>
                  </td>
                  <td>
                    <b className="small">{etudiant.connexionsTrenteJours}</b>
                  </td>
                  <td className="small muted">
                    {etudiant.derniereConnexionMs == null ? '—' : depuis(etudiant.derniereConnexionMs)}
                  </td>
                  <td className="small muted">
                    {etudiant.derniereActiviteMs == null ? 'jamais' : depuis(etudiant.derniereActiviteMs)}
                  </td>
                  <td className="small">{etudiant.questionsTrenteJours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="xs faint mt8">
          « Dernière activité » tient compte de tout ce que l&apos;étudiant fait : leçons terminées, livres et audios,
          devoirs rendus, certificats, questions à l&apos;assistant — pas seulement des connexions. Le détail des
          questions est dans <Link href="/direction/assistants">Analyse des assistants</Link>.
        </p>
      </div>
    </>
  );
}
