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
 * Deux étagères : ce que l'étudiant ne possède pas encore, puis ce qu'il
 * possède. Une formation non publiée n'existe pas ici.
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

      <h3 className="mt32 mb16" style={{ fontSize: 15 }}>
        Toutes les formations publiées
      </h3>
      {catalogue.possedees.length > 0 ? (
        <div className="grid g3">
          {catalogue.possedees.map((formation) => (
            <CarteFormation key={formation.id} formation={formation} possedee />
          ))}
        </div>
      ) : (
        <div className="empty small">Aucune formation acquise pour le moment.</div>
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
        <>
          <h3 className="mt32 mb16" style={{ fontSize: 15 }}>
            Aller plus loin
          </h3>
          <div
            className="card card-pad"
            style={{ borderColor: 'var(--gold-line)', background: 'linear-gradient(135deg,var(--gold-soft),var(--card))' }}
          >
            <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
              <span className="step-ico s-gold" style={{ width: 46, height: 46 }}>
                <Icon nom="target" taille={20} />
              </span>
              <div className="wrap">
                <b style={{ fontSize: 15 }}>Coaching personnel avec le coach principal</b>
                <div className="small muted mt4">
                  Une séance individuelle pour préparer un discours, un entretien ou un événement.
                  Réservation et paiement sécurisés.
                </div>
              </div>
              <a className="btn btn-gold" href={reservation} target="_blank" rel="noopener noreferrer">
                <Icon nom="external" taille={14} /> Réserver une séance
              </a>
            </div>
          </div>
        </>
      )}
    </>
  );
}
