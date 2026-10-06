import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTrainingById } from '@/lib/server/turso';

export const dynamic = 'force-dynamic';

/**
 * Page d'information d'achat d'une formation. Aucun encaissement n'a lieu ici :
 * l'achat se fait sur la boutique Chariow, l'accès est ouvert par le Pulse signé.
 */
export default async function FormationInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let training: Awaited<ReturnType<typeof getTrainingById>> = null;
  try {
    training = await getTrainingById(id);
  } catch {
    notFound();
  }
  if (!training) notFound();

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 48 }}>
      <Link href="/" className="small">← Catalogue</Link>
      <section className="card card-pad mt16" style={{ maxWidth: 720 }}>
        <h1>{training.title}</h1>
        {training.description && <p className="muted">{training.description}</p>}
        <p style={{ fontWeight: 700, fontSize: 18 }}>{training.priceCfa.toLocaleString('fr-FR')} FCFA</p>

        {training.buyUrl ? (
          <>
            <a className="btn btn-primary btn-lg" href={training.buyUrl} target="_blank" rel="noreferrer">
              Acheter sur Chariow
            </a>
            <div className="banner info mt16">
              <span>
                Après l’achat, créez votre accès avec <strong>la même adresse e-mail</strong> :
                la formation est rattachée automatiquement à votre compte dès que l’adresse est confirmée.
              </span>
            </div>
          </>
        ) : (
          <div className="banner warn" role="alert">
            <span>
              Le lien d’achat de cette formation n’est pas encore publié. Aucun paiement ne peut
              être effectué depuis cette page.
            </span>
          </div>
        )}

        <div className="row mt16" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link href="/inscription" className="btn">Créer mon accès</Link>
          <Link href="/connexion" className="btn btn-ghost">J’ai déjà un compte</Link>
        </div>
      </section>
    </main>
  );
}
