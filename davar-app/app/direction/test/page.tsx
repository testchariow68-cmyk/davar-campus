import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { listerEquipe, listerEtudiants, listerFormations, lireStructure } from '@/lib/server/direction';

export const dynamic = 'force-dynamic';

/**
 * VUE TEST — regarder le campus sans jamais toucher aux données d'une personne
 * réelle.
 *
 * Doctrine posée par le propriétaire le 6 octobre 2026 :
 *   • les comptes de démonstration sont supprimés (ils n'existent plus, ni en
 *     local, ni ailleurs) ;
 *   • ce qui reste pour regarder les écrans, ce sont des COMPTES DE TEST,
 *     marqués comme tels et exclus des chiffres réels ;
 *   • côté étudiant, la vue test doit se faire avec de VRAIES choses : les
 *     vraies formations, les vrais modules, les vraies leçons ;
 *   • côté staff, le propriétaire veut une vue test avec des données FICTIVES
 *     (pas les données d'étudiants réels).
 *
 * Cette page tient les deux premières. La troisième — un espace staff rempli de
 * données fictives — n'est pas encore construite, et elle est annoncée comme
 * telle plutôt que simulée.
 */
export default async function VueTestPage() {
  const session = await sessionProprietaire();
  if (!session) redirect('/connexion');
  const { db } = session;

  const [etudiants, equipe, formations] = await Promise.all([
    listerEtudiants(db),
    listerEquipe(db),
    listerFormations(db),
  ]);

  const etudiantsTest = etudiants.filter((etudiant) => etudiant.estTest);
  const equipeTest = equipe.filter((membre) => membre.estTest);
  const structures = await Promise.all(
    formations.map(async (formation) => ({ formation, modules: await lireStructure(db, formation.id) }))
  );

  return (
    <div>
      <h1 className="mb8">Vue test</h1>
      <p className="small muted mb16">
        Regarder le campus sans jamais emprunter le compte d&apos;une personne réelle. Un compte de
        test est un compte ordinaire, marqué comme test : il ne compte dans aucun chiffre de la
        plateforme.
      </p>

      <div className="banner info mb16">
        <span>
          <strong>Aucun compte de démonstration n&apos;existe</strong> : ils ont été supprimés du code
          comme de la base. Les anciens comptes de test se marquent, et se retirent, depuis les
          onglets <Link href="/direction/etudiants">Étudiants</Link> et{' '}
          <Link href="/direction/equipe">Équipe</Link>.
        </span>
      </div>

      <div className="card card-pad mb16">
        <h3 className="mb8">Les comptes de test aujourd&apos;hui</h3>
        {etudiantsTest.length === 0 && equipeTest.length === 0 ? (
          <p className="small muted">
            Aucun compte n&apos;est marqué comme test. Pour en préparer un : laissez la personne (ou
            vous-même) créer un compte sur le site avec une adresse de test, puis marquez-le
            « Marquer test » depuis l&apos;onglet concerné.
          </p>
        ) : (
          <table className="dv-tbl">
            <thead>
              <tr>
                <th>Compte</th>
                <th>Rôle</th>
                <th>Adresse</th>
                <th>Accès</th>
              </tr>
            </thead>
            <tbody>
              {etudiantsTest.map((etudiant) => (
                <tr key={etudiant.id}>
                  <td>{etudiant.nom}</td>
                  <td>Étudiant</td>
                  <td className="small muted">{etudiant.email}</td>
                  <td className="small muted">
                    {etudiant.acces.length ? etudiant.acces.map((acces) => acces.titre).join(', ') : 'aucun'}
                  </td>
                </tr>
              ))}
              {equipeTest.map((membre) => (
                <tr key={membre.id}>
                  <td>{membre.nom}</td>
                  <td>{membre.role === 'admin' ? 'Propriétaire' : 'Membre du staff'}</td>
                  <td className="small muted">{membre.email}</td>
                  <td className="small muted">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card card-pad mb16">
        <h3 className="mb8">Côté étudiant — avec votre vrai contenu</h3>
        <p className="small muted mb16">
          Voici exactement ce qu&apos;un étudiant ayant accès découvrira, lu dans la base à
          l&apos;instant. Un aperçu en lecture seule : rien n&apos;est modifié, aucune progression
          n&apos;est écrite.
        </p>
        {structures.map(({ formation, modules }) => {
          const lecons = modules.reduce((total, module) => total + module.lecons.length, 0);
          return (
            <div key={formation.id} className="dv-item mb16">
              <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                <strong>{formation.title}</strong>
                <span className={`dv-tag ${formation.published ? 'open' : 'closed'}`}>
                  {formation.published ? 'ouverte aux étudiants' : 'fermée — contenu en chantier'}
                </span>
              </div>
              <div className="small muted mt4">
                {modules.length} module{modules.length > 1 ? 's' : ''} · {lecons} leçon
                {lecons > 1 ? 's' : ''}
              </div>

              {lecons === 0 ? (
                <div className="banner warn mt8" role="status">
                  <span>
                    Aucune leçon : un étudiant verrait une page vide, c&apos;est pourquoi la
                    formation ne peut pas être ouverte.
                  </span>
                </div>
              ) : (
                <div className="mt8">
                  {modules.map((module) => (
                    <div key={module.id} style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>
                        Module {module.position} — {module.title}
                      </div>
                      {module.lecons.map((lecon) => (
                        <div key={lecon.id} className="small muted" style={{ paddingLeft: 14 }}>
                          {lecon.position}. {lecon.title}
                          {lecon.durationMin ? ` · ${lecon.durationMin} min` : ''}
                          {lecon.resourceUrl ? '' : ' · Ressource pas encore publiée'}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card card-pad" style={{ borderColor: 'var(--amber-soft)' }}>
        <h3 className="mb8">Côté staff — pas encore construit</h3>
        <p className="small muted">
          Vous avez demandé une vue test réservée au staff, remplie de <strong>données fictives</strong>.
          Elle n&apos;existe pas encore : le campus actuel n&apos;a pas d&apos;écran « staff » à
          prévisualiser. Je préfère vous le dire clairement plutôt que d&apos;inventer un écran qui
          n&apos;afficherait rien de vrai. Quand les écrans d&apos;équipe existeront (supervision des
          conversations, certifications, avis), leur vue test sera construite avec des données
          fictives, comme vous l&apos;avez demandé.
        </p>
      </div>
    </div>
  );
}
