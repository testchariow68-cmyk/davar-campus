import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import type { NomIcone } from '@/components/campus/Icon';
import { ressourcesDeEtudiant } from '@/lib/server/ressources';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes ressources — Davar Académie Campus' };

const LIBELLES: Record<string, string> = { book: 'Mes livres', audio: 'Mes audios', file: 'Mes documents' };
const ICONES: Record<string, NomIcone> = { book: 'book', audio: 'headset', file: 'doc' };

/** MES RESSOURCES — livres, audios et documents, tous ou attribués nommément. */
export default async function RessourcesPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const ressources = await ressourcesDeEtudiant(session.db, session.user.id);
  const familles = ['book', 'audio', 'file'] as const;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes ressources</h1>
          <p>Vos livres, vos audios et vos documents — ceux offerts à tous, et ceux qui vous ont été attribués.</p>
        </div>
      </div>

      {ressources.length === 0 && (
        <div className="banner info">
          <Icon nom="book" taille={14} />
          <span className="small">
            Aucune ressource ne vous a encore été attribuée. Elles apparaîtront ici dès que la direction les publiera.
          </span>
        </div>
      )}

      {familles.map((famille) => {
        const liste = ressources.filter((ressource) => ressource.kind === famille);
        if (liste.length === 0) return null;
        return (
          <section key={famille} className="mb16">
            <h2 className="mb8" style={{ fontSize: 16 }}>
              <Icon nom={ICONES[famille]} taille={15} /> {LIBELLES[famille]}
            </h2>
            <div className="grid g2">
              {liste.map((ressource) => (
                <div className="card card-pad" key={ressource.id}>
                  <b>{ressource.title}</b>
                  {ressource.formationTitre && <div className="xs faint">{ressource.formationTitre}</div>}
                  {ressource.description && <p className="small muted mt8">{ressource.description}</p>}
                  <div className="row mt8" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {ressource.durationMin ? <span className="badge b-grey">{ressource.durationMin} min</span> : null}
                    {ressource.obtenueLeMs !== null ? (
                      <span className="badge b-violet">attribuée à vous</span>
                    ) : ressource.attribueeA > 0 ? (
                      <span className="badge b-grey">réservée</span>
                    ) : (
                      <span className="badge b-green">pour tous</span>
                    )}
                  </div>
                  {ressource.fileKey ? (
                    <a className="btn btn-ghost btn-sm mt16" href={`/api/campus/ressource/${ressource.id}`}>
                      <Icon nom="download" taille={14} /> Ouvrir
                    </a>
                  ) : (
                    <p className="xs faint mt16">
                      Le fichier n’est pas encore déposé : cette ressource vous sera ouverte dès sa mise en ligne.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
