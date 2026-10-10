import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RecompensesOutils } from '@/components/direction/RecompensesOutils';
import { sessionSection } from '@/lib/server/direction-access';
import { lireReglagesAssiduite } from '@/lib/server/assiduite';
import { catalogueBadges } from '@/lib/server/recompenses';
import { listerEtudiants } from '@/lib/server/direction';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Récompenses — Direction' };

const CATEGORIES: Array<{ cle: string; titre: string }> = [
  { cle: 'parcours', titre: 'Badges de parcours' },
  { cle: 'accomplissement', titre: 'Badges d’accomplissement' },
  { cle: 'formation', titre: 'Badges de formation' },
];

/**
 * RÉCOMPENSES — « reconnaissance pédagogique et humaine — jamais un jeu ».
 *
 * Le catalogue est entièrement préconfiguré : l'application n'invente ni nom,
 * ni icône, ni phrase. L'attribution manuelle reste possible pour une situation
 * exceptionnelle, et son motif est consigné.
 */
export default async function RecompensesPage() {
  const session = await sessionSection('recompenses');
  if (!session) redirect('/connexion');

  const db = session.db;
  const [reglages, catalogue, etudiants, attributions] = await Promise.all([
    lireReglagesAssiduite(db),
    catalogueBadges(db),
    listerEtudiants(db, '', 300),
    db.execute(
      `SELECT b.id AS badge_id, COUNT(*) AS n
         FROM badge_awards a
         JOIN users u ON u.id = a.user_id AND u.is_test = 0
         JOIN badge_defs b ON b.id = a.badge_id
        GROUP BY b.id`
    ),
  ]);

  const comptes = new Map(attributions.rows.map((ligne) => [String(ligne.badge_id), Number(ligne.n)]));
  // Ce qui est AFFICHÉ suit le compte affiché : en vue test « Manager », le
  // propriétaire voit ce que voit son manager. Ses droits, eux, ne bougent pas.
  const proprietaire = session.user.role === 'admin';

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Récompenses</h1>
          <p>
            Reconnaissance pédagogique et humaine — jamais un jeu. Le catalogue est <b>entièrement préconfiguré</b> :
            l&apos;application n&apos;invente ni nom, ni icône, ni couleur. L&apos;attribution manuelle reste possible pour
            une situation exceptionnelle.
          </p>
        </div>
      </div>

      <RecompensesOutils
        reglages={reglages}
        etudiants={etudiants.map((etudiant) => ({ id: etudiant.id, nom: etudiant.nom }))}
        badges={catalogue.map((badge) => ({ id: badge.id, name: badge.name, cat: badge.cat }))}
        proprietaire={proprietaire}
      />

      {CATEGORIES.map((categorie) => {
        const badges = catalogue.filter((badge) => badge.cat === categorie.cle);
        if (!badges.length) return null;
        return (
          <div key={categorie.cle} className="mb16">
            <h2 style={{ fontSize: 16 }} className="mb8">
              {categorie.titre}
            </h2>
            <div className="grid g3" style={{ alignItems: 'start' }}>
              {badges.map((badge) => {
                const recus = comptes.get(badge.id) ?? 0;
                return (
                  <div key={badge.id} className="card card-pad">
                    <b>{badge.name}</b>
                    <div className="xs muted mt4">{badge.description ?? '—'}</div>
                    {badge.shortText && <div className="xs faint mt4">« {badge.shortText} »</div>}
                    <div className="xs mt8">
                      {recus === 0 ? (
                        <span className="dv-tag closed">personne ne l’a encore reçu</span>
                      ) : (
                        <span className="dv-tag open">
                          {recus} attribution{recus > 1 ? 's' : ''}
                        </span>
                      )}{' '}
                      <span className="faint">
                        {badge.autoRule ? `règle : ${badge.autoRule}` : 'règle : à la main'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="xs faint">
        Le catalogue se met à jour tout seul : chaque formation reçoit son badge de formation. Les distinctions du temps
        (Régularité, Persévérance, Retour en Force) se calculent sur l&apos;historique réel des jours travaillés — voir{' '}
        <Link href="/direction/badges">Badges &amp; distinctions</Link> pour savoir qui les a reçues.
      </p>
    </>
  );
}
