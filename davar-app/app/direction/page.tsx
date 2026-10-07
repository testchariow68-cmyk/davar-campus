import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PurgeContenu } from '@/components/direction/PurgeContenu';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { listerFormations, vueEnsemble } from '@/lib/server/direction';

export const dynamic = 'force-dynamic';

/** Vue d'ensemble : uniquement des chiffres réels, lus en base à l'instant. */
export default async function DirectionPage() {
  const session = await sessionProprietaire();
  if (!session) redirect('/connexion');
  const { db } = session;

  const [vue, formations] = await Promise.all([vueEnsemble(db), listerFormations(db)]);
  const lienChariow = formations.some((formation) => formation.chariowProductId);

  const etapes = [
    { fait: vue.formations > 0, texte: 'Créer votre première formation', lien: '/direction/formations', action: 'Créer' },
    {
      fait: vue.lecons > 0,
      texte: 'Construire ses modules et ses leçons',
      lien: formations[0] ? `/direction/formations/${formations[0].id}` : '/direction/formations',
      action: 'Construire',
    },
    { fait: lienChariow, texte: 'Rattacher son identifiant de produit Chariow', lien: '/direction/formations', action: 'Rattacher' },
    {
      fait: vue.formationsPubliees > 0,
      texte: 'Ouvrir la formation à la vente',
      lien: formations[0] ? `/direction/formations/${formations[0].id}` : '/direction/formations',
      action: 'Ouvrir',
    },
    { fait: vue.membres > 0, texte: 'Nommer un membre de votre équipe', lien: '/direction/equipe', action: 'Nommer' },
  ];

  return (
    <div>
      <h1 className="mb8">Votre plateforme</h1>
      <p className="small muted mb16">
        Chiffres lus à l&apos;instant dans la base. Aucun chiffre d&apos;apparat : si la plateforme est vide, elle l&apos;annonce.
      </p>

      <div className="dv-stats mb24">
        <div className="dv-stat">
          <b>{vue.etudiants}</b>
          <span className="small muted">étudiants inscrits</span>
        </div>
        <div className="dv-stat">
          <b>{vue.etudiantsConfirmes}</b>
          <span className="small muted">adresses confirmées</span>
        </div>
        <div className="dv-stat">
          <b>{vue.acces}</b>
          <span className="small muted">accès ouverts</span>
        </div>
        <div className="dv-stat">
          <b>{vue.achats}</b>
          <span className="small muted">achats vérifiés</span>
        </div>
        <div className="dv-stat">
          <b>{vue.formationsPubliees}</b>
          <span className="small muted">formations ouvertes</span>
        </div>
        <div className="dv-stat">
          <b>{vue.lecons}</b>
          <span className="small muted">leçons écrites</span>
        </div>
        <div className="dv-stat">
          <b>{vue.leconsTerminees}</b>
          <span className="small muted">leçons terminées</span>
        </div>
        <div className="dv-stat">
          <b>{vue.membres}</b>
          <span className="small muted">membres de l&apos;équipe</span>
        </div>
        <div className="dv-stat">
          <b>{vue.comptesTest}</b>
          <span className="small muted">comptes de test (hors chiffres)</span>
        </div>
      </div>

      {vue.proprietaires !== 1 && (
        <div className="banner err mb16" role="alert">
          <span>
            Attention : la base contient {vue.proprietaires} comptes propriétaires. Le projet en prévoit un seul. Ouvrez
            l&apos;onglet Équipe pour corriger.
          </span>
        </div>
      )}

      <div className="card card-pad mb16">
        <h3 className="mb8">Vos premiers pas</h3>
        <p className="small muted mb16">
          Sans ces étapes, un étudiant pourrait payer sans rien trouver. Chacune est vérifiée dans la base, pas déclarée.
        </p>
        <div className="dv-list">
          {etapes.map((etape) => (
            <div key={etape.texte} className="dv-item row between" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="row" style={{ gap: 10 }}>
                <span className="dv-num" style={{ background: etape.fait ? 'var(--green-soft)' : 'var(--violet-soft)', color: etape.fait ? 'var(--green)' : 'var(--violet-deep)' }}>
                  {etape.fait ? '✓' : '·'}
                </span>
                <span style={{ fontWeight: 600 }}>{etape.texte}</span>
              </span>
              {etape.fait ? (
                <span className="dv-tag open">fait</span>
              ) : (
                <Link href={etape.lien} className="btn">
                  {etape.action}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad mb16">
        <h3 className="mb8">Ce que la plateforme ne fait pas encore</h3>
        <ul className="small muted" style={{ paddingLeft: 18, lineHeight: 1.9 }}>
          <li>Les livres et livres audio du prototype ne sont pas reportés : aucun lecteur paginé n&apos;existe côté serveur.</li>
          <li>Les certifications, les récompenses et les avis ne sont pas encore reportés.</li>
          <li>Les paiements encaissés dans l&apos;application sont reportés ; l&apos;accès est ouvert à la main après un achat Chariow.</li>
        </ul>
      </div>

      <PurgeContenu
        contenu={{
          formations: vue.formations,
          modules: vue.modules,
          lecons: vue.lecons,
          acces: vue.acces,
        }}
      />
    </div>
  );
}
