import { Icon, type NomIcone } from './Icon';

/**
 * UNE FAMILLE DE RESSOURCES — les livres d'un côté, les audios de l'autre.
 *
 * Le prototype donne deux lignes de menu séparées : « Mes livres » et
 * « Mes audios ». Ce sont donc deux écrans, pas un seul avec des onglets.
 */
export type Ressource = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  formationTitre: string | null;
  fileKey: string | null;
  durationMin: number | null;
  obtenueLeMs: number | null;
  attribueeA: number;
};

export type PropsListeRessources = {
  titre: string;
  sousTitre: string;
  famille: 'book' | 'audio';
  icone: NomIcone;
  ressources: Ressource[];
  contenance: Record<string, { pages?: number; pistes?: number }>;
  positions: Record<string, number>;
  /** Adresse de retour, pour les lecteurs. */
  retour: string;
};

export function ListeRessources({
  titre,
  sousTitre,
  famille,
  icone,
  ressources,
  contenance,
  positions,
}: PropsListeRessources) {
  const liste = ressources.filter((ressource) => ressource.kind === famille);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{titre}</h1>
          <p>{sousTitre}</p>
        </div>
      </div>

      {liste.length === 0 ? (
        <div className="banner info">
          <Icon nom={icone} taille={14} />
          <span className="small">
            Aucune ressource ne vous a encore été attribuée. Elles apparaîtront ici dès que la direction les publiera.
          </span>
        </div>
      ) : (
        <div className="grid g2">
          {liste.map((ressource) => (
            <div className="card card-pad" key={ressource.id}>
              <b>{ressource.title}</b>
              {ressource.formationTitre ? <div className="xs faint">{ressource.formationTitre}</div> : null}
              {ressource.description ? <p className="small muted mt8">{ressource.description}</p> : null}
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
              {famille === 'book' && (contenance[ressource.id]?.pages ?? 0) > 0 ? (
                <div className="xs muted mt4">
                  {positions[ressource.id] && positions[ressource.id] > 0
                    ? `Vous vous êtes arrêté à la page ${positions[ressource.id]}.`
                    : `${contenance[ressource.id].pages} pages`}
                </div>
              ) : null}
              {famille === 'audio' && (contenance[ressource.id]?.pistes ?? 0) > 0 ? (
                <div className="xs muted mt4">
                  {contenance[ressource.id].pistes} piste(s) — écoute avec reprise automatique
                </div>
              ) : null}

              {famille === 'book' &&
              ((contenance[ressource.id]?.pages ?? 0) > 0 || ressource.fileKey) ? (
                <a className="btn btn-primary btn-sm mt16" href={`/campus/ressources/livre/${ressource.id}`}>
                  <Icon nom="book" taille={14} />{' '}
                  {positions[ressource.id] ? 'Continuer la lecture' : 'Commencer la lecture'}
                </a>
              ) : null}
              {famille === 'audio' && (contenance[ressource.id]?.pistes ?? 0) > 0 ? (
                <a className="btn btn-primary btn-sm mt16" href={`/campus/ressources/audio/${ressource.id}`}>
                  <Icon nom="headset" taille={14} /> {positions[ressource.id] ? 'Reprendre l’écoute' : 'Écouter'}
                </a>
              ) : null}
              {!ressource.fileKey &&
              !((contenance[ressource.id]?.pages ?? 0) > 0) &&
              !((contenance[ressource.id]?.pistes ?? 0) > 0) ? (
                <p className="xs faint mt16">
                  Le fichier n’est pas encore déposé : cette ressource vous sera ouverte dès sa mise en ligne.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
