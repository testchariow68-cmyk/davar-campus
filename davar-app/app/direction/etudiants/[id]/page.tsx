import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { sessionSection } from '@/lib/server/direction-access';
import { ficheEtudiant } from '@/lib/server/direction';
import { depuis } from '@/lib/server/campus-recents';

export const dynamic = 'force-dynamic';

const LIBELLES_SOUMISSION: Record<string, string> = {
  pending: 'En attente',
  approved: 'Validée',
  refused: 'Refusée',
};
const COULEUR_SOUMISSION: Record<string, string> = {
  pending: 'b-amber',
  approved: 'b-green',
  refused: 'b-red',
};

/** LA FICHE D'UN ÉTUDIANT — ses formations, ses soumissions, ses conversations, ses certificats. */
export default async function FicheEtudiantPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await sessionSection('etudiants');
  if (!session) redirect('/connexion');

  const { id } = await params;
  const fiche = await ficheEtudiant(session.db, id);
  if (!fiche) notFound();

  return (
    <div>
      <div className="breadcrumb">
        <Link href="/direction/etudiants">Étudiants</Link>
        <Icon nom="chevR" taille={12} />
        <span>{fiche.nom}</span>
      </div>

      <div className="card card-pad mb16">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span className="avatar lg">
            {fiche.nom
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((mot) => mot[0]?.toUpperCase() ?? '')
              .join('') || 'É'}
          </span>
          <div className="wrap">
            <h2 style={{ fontSize: 18 }}>{fiche.nom}</h2>
            <div className="xs muted">
              {fiche.courriel}
              {fiche.telephone ? ` · ${fiche.telephone}` : ''} · inscrit(e) le{' '}
              {new Date(fiche.inscritLeMs).toLocaleDateString('fr-FR')}
            </div>
          </div>
          <a className="btn btn-sm" href={`mailto:${fiche.courriel}`}>
            <Icon nom="mail" taille={14} /> Contacter
          </a>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <h3>Formations &amp; progression</h3>
          </div>
          {fiche.formations.length === 0 ? (
            <div className="empty small">Aucune formation.</div>
          ) : (
            fiche.formations.map((formation) => (
              <div className="res-item" key={formation.id}>
                <div className="wrap">
                  <b style={{ fontSize: 12.8 }}>{formation.titre}</b>
                  <div className="mt4">
                    <div className={`pbar${formation.terminee ? ' gold' : ''}`}>
                      <i style={{ width: `${formation.pct}%` }} />
                    </div>
                  </div>
                </div>
                {formation.terminee ? <span className="badge b-gold">Terminée</span> : null}
              </div>
            ))
          )}
        </div>

        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <h3>Soumissions</h3>
            </div>
            {fiche.soumissions.length === 0 ? (
              <div className="empty small">Aucune soumission.</div>
            ) : (
              fiche.soumissions.map((soumission) => (
                <div className="res-item" key={soumission.id}>
                  <span className="res-ico doc">
                    <Icon nom="file" taille={14} />
                  </span>
                  <div className="wrap">
                    <b style={{ fontSize: 12.5 }}>{soumission.fichier}</b>
                    <div className="xs faint">
                      {soumission.formation} · {depuis(soumission.atMs)}
                    </div>
                  </div>
                  <span className={`badge ${COULEUR_SOUMISSION[soumission.statut] ?? 'b-grey'}`}>
                    {LIBELLES_SOUMISSION[soumission.statut] ?? soumission.statut}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Conversations</h3>
            </div>
            {fiche.conversations.length === 0 ? (
              <div className="empty small">Aucune conversation.</div>
            ) : (
              fiche.conversations.map((conversation) => (
                <Link className="dd-item" href={`/direction/conversations/${conversation.id}`} key={conversation.id}>
                  <Icon nom="message" taille={14} /> {conversation.extrait || 'Conversation'}
                </Link>
              ))
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Certificats</h3>
            </div>
            {fiche.certificats.length === 0 ? (
              <div className="empty small">Aucun certificat.</div>
            ) : (
              fiche.certificats.map((certificat) => (
                <div className="res-item" key={certificat.id}>
                  <span className="step-ico s-gold">
                    <Icon nom="award" taille={13} />
                  </span>
                  <div className="wrap">
                    <b style={{ fontSize: 12.5 }}>{certificat.formation}</b>
                    <div className="xs faint">{certificat.code}</div>
                  </div>
                  {certificat.statut === 'revoked' ? <span className="badge b-red">révoqué</span> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
