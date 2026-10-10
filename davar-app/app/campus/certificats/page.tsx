import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { DemandeCertificat } from '@/components/campus/DemandeCertificat';
import { currentSession } from '@/lib/server/auth';
import { certificatsDeEtudiant, demandesDeEtudiant } from '@/lib/server/certificats';
import { listUserTrainings } from '@/lib/server/campus';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes certificats — Davar Académie Campus' };

function dateLisible(atMs: number): string {
  return new Date(atMs).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** MES CERTIFICATS — il se demande, la direction valide, le code se vérifie publiquement. */
export default async function CertificatsPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');

  const [certificats, demandes, formations] = await Promise.all([
    certificatsDeEtudiant(session.db, session.user.id),
    demandesDeEtudiant(session.db, session.user.id),
    listUserTrainings(session.db, session.user.id),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes certificats</h1>
          <p>
            Le certificat se demande après la formation. La direction le valide, puis il reçoit un{' '}
            <strong>code de vérification</strong> que n’importe qui peut contrôler.
          </p>
        </div>
      </div>

      {certificats.length > 0 && (
        <div className="grid g2 mb16">
          {certificats.map((certificat) => (
            <div className="card card-pad" key={certificat.id}>
              <div className="row between" style={{ gap: 8 }}>
                <span className="badge b-gold">
                  <Icon nom="award" taille={12} /> {certificat.status === 'active' ? 'valide' : 'révoqué'}
                </span>
                <span className="xs faint">{dateLisible(certificat.issuedAtMs)}</span>
              </div>
              <h3 className="mt8" style={{ fontSize: 16 }}>
                {certificat.formationTitle}
              </h3>
              <p className="small muted mt4">Délivré à {certificat.holderName}</p>
              <div className="mt16" style={{ padding: '10px 12px', background: 'var(--violet-soft)', borderRadius: 10 }}>
                <div className="xs faint">Code de vérification</div>
                <b style={{ letterSpacing: '0.06em' }}>{certificat.code}</b>
              </div>
              <a
                className="btn btn-ghost btn-sm mt16"
                href={`/verification?code=${encodeURIComponent(certificat.code)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon nom="external" taille={14} /> Vérifier publiquement
              </a>
            </div>
          ))}
        </div>
      )}

      {certificats.length === 0 && demandes.length === 0 && (
        <div className="banner info mb16">
          <Icon nom="award" taille={14} />
          <span className="small">
            Aucun certificat pour l’instant. Terminez votre formation, puis demandez-le ici : il vous sera délivré
            après validation.
          </span>
        </div>
      )}

      {demandes.length > 0 && (
        <div className="card card-pad mb16">
          <h3 className="mb8">Mes demandes</h3>
          {demandes.map((demande) => (
            <div key={demande.id} className="row between" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="small">
                <b>{demande.formation}</b> — {dateLisible(demande.atMs)}
              </span>
              <span
                className={`badge ${demande.statut === 'approved' ? 'b-green' : demande.statut === 'refused' ? 'b-red' : 'b-gold'}`}
              >
                {demande.statut === 'approved' ? 'validée' : demande.statut === 'refused' ? 'refusée' : 'en attente'}
              </span>
            </div>
          ))}
        </div>
      )}

      <DemandeCertificat
        formations={formations.map((formation) => ({
          id: formation.id,
          titre: formation.title,
          dejaCertifiee: certificats.some((certificat) => certificat.formationTitle === formation.title),
          dejaDemande: demandes.some((demande) => demande.formation === formation.title && demande.statut === 'pending'),
          progression: formation.lessonCount === 0 ? 0 : Math.round((formation.completedCount / formation.lessonCount) * 100),
        }))}
      />
    </>
  );
}
