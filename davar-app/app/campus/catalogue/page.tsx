import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { CarteFormation } from '@/components/campus/CarteFormation';
import { currentSession } from '@/lib/server/auth';
import { lireAvisEnAvant } from '@/lib/server/avis';
import { lireCatalogue } from '@/lib/server/campus';
import { lireReglages } from '@/lib/server/settings';
import { REGLAGES_DEFAUT } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Découvrir plus de formations — Davar Académie Campus' };

const RESERVATION_COACHING = REGLAGES_DEFAUT['paiement.coaching'];

/**
 * DÉCOUVRIR PLUS DE FORMATIONS — `vDiscover()` du prototype.
 *
 * Une seule étagère : ce que l'étudiant ne possède pas encore. Une formation
 * déjà acquise reste dans « Mes formations » et ne revient pas dans ce catalogue.
 */
export default async function CataloguePage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');

  // Vue test : le propriétaire voit le catalogue comme un étudiant qui n'a rien.
  const catalogue = await lireCatalogue(session.db, session.vueTest ? null : session.user.id);
  const [reglages, temoignages] = await Promise.all([
    lireReglages(session.db),
    lireAvisEnAvant(session.db),
  ]);
  const reservation = reglages['paiement.coaching'] ?? RESERVATION_COACHING;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Découvrir plus de formations</h1>
          <p>Des formations que vous ne possédez pas encore, prêtes à rejoindre votre campus.</p>
        </div>
      </div>

      {catalogue.aDecouvrir.length > 0 ? (
        <div className="grid g3">
          {catalogue.aDecouvrir.map((formation) => (
            <CarteFormation key={formation.id} formation={formation} possedee={false} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon nom="checkCircle" taille={30} />
          <div className="mt8" style={{ fontWeight: 700, color: 'var(--muted)' }}>
            Vous possédez déjà toutes les formations publiées
          </div>
          <div className="xs mt4" />
        </div>
      )}

      {temoignages.length > 0 && (
        <>
          <div className="page-head" style={{ marginTop: 30 }}>
            <div>
              <h2 style={{ fontSize: 19 }}>Ils témoignent</h2>
            </div>
          </div>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}
          >
            {temoignages.map((temoignage) => (
              <div className="card card-pad sp-card" key={temoignage.id}>
                <Icon nom="quote" taille={18} />
                <p className="small" style={{ margin: '8px 0 10px' }}>
                  {temoignage.texte}
                </p>
                <div className="row">
                  <span className="step-ico s-gold" style={{ width: 30, height: 30 }}>
                    <Icon nom="check" taille={13} />
                  </span>
                  <div>
                    <b className="xs">{temoignage.etudiant}</b>
                    <div className="xs faint">{temoignage.formation}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {reservation && (
        <section className="coaching-offer" aria-labelledby="coaching-title">
          <h3 id="coaching-title">Besoin d’un accompagnement personnalisé&nbsp;?</h3>
          <div className="card card-pad coaching-card">
            <span className="step-ico s-gold coaching-icon" aria-hidden="true">
              <Icon nom="target" taille={20} />
            </span>
            <div className="coaching-copy">
              <b>Préparez votre prochaine prise de parole avec le coach principal</b>
              <p className="small muted">
                Un rendez-vous individuel pour clarifier votre message, travailler votre discours ou préparer un entretien.
                Choisissez votre créneau et repartez avec un plan concret.
              </p>
            </div>
            <a className="btn btn-gold coaching-cta" href={reservation} target="_blank" rel="noopener noreferrer">
              <Icon nom="external" taille={14} /> Réserver mon coaching
            </a>
          </div>
        </section>
      )}
    </>
  );
}
