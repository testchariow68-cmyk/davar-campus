import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { FormulaireAvis } from '@/components/campus/FormulaireAvis';
import { currentSession } from '@/lib/server/auth';
import { avisAttendus, DELAI_PREMIER_AVIS_MS, DELAI_SECOND_AVIS_MS, MOTS_MAXIMUM } from '@/lib/server/avis';
import { listUserTrainings } from '@/lib/server/campus';
import { lireConfig } from '@/lib/server/assistant';
import { moteurTranscription } from '@/lib/server/transcription';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes avis — Davar Académie Campus' };

function jours(ms: number): number {
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** MES AVIS — deux temps : ~2 semaines après l'achat, puis ~1 mois. */
export default async function AvisPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');

  const [formations, config] = await Promise.all([
    listUserTrainings(session.db, session.user.id),
    lireConfig(session.db),
  ]);
  const moteur = moteurTranscription(config.transcription);
  const parFormation = await Promise.all(
    formations.map(async (formation) => ({
      id: formation.id,
      titre: formation.title,
      etapes: await avisAttendus(session.db, session.user.id, formation.id),
    }))
  );

  const aVenir = parFormation
    .flatMap((formation) => formation.etapes.map((etape) => ({ ...etape, formation })))
    .sort((a, b) => a.duAtMs - b.duAtMs);
  const aFaire = aVenir.filter((ligne) => ligne.deposeLeMs === null && ligne.duAtMs <= Date.now());

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes avis</h1>
          <p>
            Votre avis construit la formation pour ceux qui viendront. Il est demandé à deux moments : environ{' '}
            {jours(DELAI_PREMIER_AVIS_MS)} jours après votre achat, puis environ {jours(DELAI_SECOND_AVIS_MS)} jours
            après. {MOTS_MAXIMUM} mots au maximum, écrit ou dicté.
          </p>
        </div>
      </div>

      {parFormation.length === 0 && (
        <div className="banner info">
          <Icon nom="quote" taille={14} />
          <span className="small">Vous n’avez pas encore de formation : les avis viennent après l’achat.</span>
        </div>
      )}

      {aFaire.length > 0 && (
        <div className="card card-pad mb16">
          <h3 className="mb8">À donner maintenant</h3>
          <p className="small muted mb8">
            Le moment est venu, et votre retour compte : dites ce qui vous a servi, ce qui vous a manqué, ce qui
            pourrait être plus clair.
          </p>
          {aFaire.map((ligne) => (
            <FormulaireAvis
              key={`${ligne.formation.id}-${ligne.step}`}
              formationId={ligne.formation.id}
              formationTitre={ligne.formation.titre}
              step={ligne.step}
              dejaDepose={false}
              moteurTranscription={moteur}
            />
          ))}
        </div>
      )}

      {parFormation.map((formation) => (
        <div className="card card-pad mb16" key={formation.id}>
          <h3 className="mb8">{formation.titre}</h3>
          {formation.etapes.map((etape) => (
            <div key={etape.step} className="row between" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <span className="small">
                Avis n°{etape.step} — attendu le{' '}
                {new Date(etape.duAtMs).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
              {etape.deposeLeMs !== null ? (
                <span className="badge b-green">
                  <Icon nom="checkCircle" taille={12} /> déposé
                </span>
              ) : etape.duAtMs <= Date.now() ? (
                <FormulaireAvis formationId={formation.id} formationTitre={formation.titre} step={etape.step} dejaDepose={false} />
              ) : (
                <span className="badge b-grey">à venir</span>
              )}
            </div>
          ))}
        </div>
      ))}

      <p className="xs faint">
        <Icon nom="lock" taille={12} /> Un avis dicté est transcrit sur votre appareil : seule la transcription est
        conservée, jamais l’enregistrement.
      </p>
    </>
  );
}
