import Link from 'next/link';
import { Icon, type NomIcone } from './Icon';
import type { Ressource } from '@/lib/server/ressources';

type Categorie = 'all' | 'book' | 'audio';

/**
 * Projection destinée à la liste affichée : les clés internes R2 et les clés
 * de couverture restent côté serveur. Le navigateur n'a besoin que de savoir
 * si l'ouverture est possible ; l'URL signée est produite par la route dédiée.
 */
export type RessourceCampus = Omit<Ressource, 'kind' | 'coverKey' | 'fileKey'> & {
  kind: 'book' | 'audio';
};

type PropsRessourcesCampus = {
  ressources: RessourceCampus[];
  contenance: Record<string, { pages: number; pistes: number }>;
  categorie: Categorie;
  couvertures: Record<string, string | null>;
};

const CATEGORIES: Array<{ id: Categorie; libelle: string; description: string; icone: NomIcone }> = [
  { id: 'all', libelle: 'Tout', description: 'Livres et audios disponibles', icone: 'layers' },
  { id: 'book', libelle: 'Livres', description: 'Lecture paginée dans la plateforme', icone: 'book' },
  { id: 'audio', libelle: 'Audios', description: 'Écoute avec reprise automatique', icone: 'headset' },
];

function minutes(secondes: number): string {
  const total = Math.max(0, Math.floor(secondes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function libelleCategorie(kind: RessourceCampus['kind']): string {
  return kind === 'book' ? 'Livre' : 'Audio';
}

function CarteRessource({
  ressource,
  contenance,
  couverture,
}: {
  ressource: RessourceCampus;
  contenance: { pages: number; pistes: number };
  couverture: string | null;
}) {
  const estLivre = ressource.kind === 'book';
  const estAudio = ressource.kind === 'audio';
  const href = estLivre
    ? `/campus/ressources/livre/${ressource.id}`
    : `/campus/ressources/audio/${ressource.id}`;
  const position = ressource.positionLecture ?? 0;

  return (
    <article className="card resource-card">
      {estLivre ? (
        <div className="resource-cover bk-cover">
          {couverture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="resource-cover-image" src={couverture} alt="" />
          ) : (
            <span className="bk-gen">{ressource.title}</span>
          )}
        </div>
      ) : (
        <div className="resource-audio-cover au-cover" aria-hidden="true">
          {couverture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="resource-cover-image" src={couverture} alt="" />
          ) : null}
          <span className="resource-audio-icon"><Icon nom="headset" taille={24} /></span>
        </div>
      )}

      <div className="resource-card-body">
        <div className="eyebrow">{libelleCategorie(ressource.kind)}</div>
        <h3>{ressource.title}</h3>
        {ressource.formationTitre ? <div className="xs faint">{ressource.formationTitre}</div> : null}
        {ressource.description ? <p className="small muted mt8">{ressource.description}</p> : null}

        <div className="resource-meta mt8">
          {ressource.durationMin ? <span>{ressource.durationMin} min</span> : null}
          {estLivre && contenance.pages > 0 ? <span>{contenance.pages} pages</span> : null}
          {estAudio && contenance.pistes > 0 ? <span>{contenance.pistes} piste(s)</span> : null}
        </div>

        {position > 0 && (
          <div className="xs muted mt8">
            {estLivre ? `Vous vous êtes arrêté à la page ${position}.` : estAudio ? `Reprise à ${minutes(position)}.` : null}
          </div>
        )}

        <div className="resource-card-actions mt16">
          {href && (estLivre || contenance.pistes > 0) ? (
            <a className="btn btn-primary btn-sm" href={href}>
              <Icon nom={estLivre ? 'book' : 'headset'} taille={14} />{' '}
              {estLivre ? (position > 0 ? 'Continuer la lecture' : 'Commencer la lecture') : position > 0 ? 'Reprendre l’écoute' : 'Écouter'}
            </a>
          ) : (
            <span className="xs faint">Ce contenu sera ouvert dès sa mise en ligne.</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function RessourcesCampus({ ressources, contenance, categorie, couvertures }: PropsRessourcesCampus) {
  const choisies = categorie === 'all' ? ressources : ressources.filter((ressource) => ressource.kind === categorie);
  const groupes: Array<{ kind: Extract<Ressource['kind'], 'book' | 'audio'>; titre: string; sousTitre: string }> = [
    { kind: 'book', titre: 'Livres', sousTitre: 'Lisez directement dans la plateforme, votre page est mémorisée.' },
    { kind: 'audio', titre: 'Audios', sousTitre: 'Écoutez vos pistes avec reprise automatique.' },
  ];

  return (
    <>
      <div className="page-head resource-page-head">
        <div>
          <h1>Bibliothèque</h1>
          <p>Retrouvez ici vos livres et vos audios, avec une reprise de lecture automatique.</p>
        </div>
      </div>

      <nav className="resource-categories" aria-label="Catégories de la bibliothèque">
        {CATEGORIES.map((item) => {
          const total = item.id === 'all' ? ressources.length : ressources.filter((ressource) => ressource.kind === item.id).length;
          return (
            <Link
              key={item.id}
              href={item.id === 'all' ? '/campus/ressources' : `/campus/ressources?categorie=${item.id}`}
              className={`resource-category${categorie === item.id ? ' selected' : ''}`}
              aria-current={categorie === item.id ? 'page' : undefined}
            >
              <span className="resource-category-icon"><Icon nom={item.icone} taille={17} /></span>
              <span className="wrap">
                <b>{item.libelle}</b>
                <small>{item.description}</small>
              </span>
              <strong>{total}</strong>
            </Link>
          );
        })}
      </nav>

      {ressources.length === 0 ? (
        <div className="card card-pad resource-empty">
          <span className="resource-empty-icon"><Icon nom="layers" taille={25} /></span>
          <h2>Aucun contenu pour l’instant</h2>
          <p className="small muted mt8">
            Vos livres et vos audios apparaîtront ici dès que votre équipe pédagogique les aura publiés.
          </p>
        </div>
      ) : choisies.length === 0 ? (
        <div className="card card-pad resource-empty">
          <span className="resource-empty-icon"><Icon nom="layers" taille={25} /></span>
          <h2>Aucun contenu pour l’instant dans cette catégorie</h2>
          <p className="small muted mt8">Choisissez une autre catégorie pour consulter les éléments disponibles.</p>
        </div>
      ) : categorie === 'all' ? (
        <div className="resource-groups">
          {groupes.map((groupe) => {
            const liste = choisies.filter((ressource) => ressource.kind === groupe.kind);
            if (liste.length === 0) return null;
            return (
              <section className="resource-group" key={groupe.kind}>
                <div className="cp-sec-h">
                  <div>
                    <h2>{groupe.titre}</h2>
                    <p className="small muted mt4">{groupe.sousTitre}</p>
                  </div>
                  <Link className="xs link" href={`/campus/ressources?categorie=${groupe.kind}`}>
                    Voir tout →
                  </Link>
                </div>
                <div className="grid resource-grid">
                  {liste.map((ressource) => (
                    <CarteRessource
                      key={ressource.id}
                      ressource={ressource}
                      contenance={contenance[ressource.id] ?? { pages: 0, pistes: 0 }}
                      couverture={couvertures[ressource.id] ?? null}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="resource-group">
          <div className="cp-sec-h">
            <div>
              <h2>{CATEGORIES.find((item) => item.id === categorie)?.libelle}</h2>
              <p className="small muted mt4">{CATEGORIES.find((item) => item.id === categorie)?.description}</p>
            </div>
          </div>
          <div className="grid resource-grid">
            {choisies.map((ressource) => (
              <CarteRessource
                key={ressource.id}
                ressource={ressource}
                contenance={contenance[ressource.id] ?? { pages: 0, pistes: 0 }}
                couverture={couvertures[ressource.id] ?? null}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
