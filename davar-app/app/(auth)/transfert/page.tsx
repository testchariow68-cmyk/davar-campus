import Link from 'next/link';
import { ConfirmerTransfert } from '@/components/ConfirmerTransfert';
import { lireTransfertParToken, type TransfertConsomme } from '@/lib/server/transfert';
import { openDb } from '@/lib/server/turso';

export const metadata = { title: 'Transfert de propriété — Davar Académie Campus' };
export const dynamic = 'force-dynamic';

/**
 * « Le Super Administrateur est unique. Le transfert exige votre mot de passe,
 * puis une confirmation par e-mail du nouveau propriétaire avant d'être effectif. »
 *
 * Ici, le nouveau propriétaire confirme — ou répond « ce n'était pas moi ».
 */
export default async function TransfertPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  let transfert: TransfertConsomme | null | 'indisponible' = null;
  try {
    transfert = token ? await lireTransfertParToken(await openDb(), token) : null;
  } catch {
    transfert = 'indisponible';
  }

  return (
    <div className="login-glass">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lg-logo" src="/campus-icon.png" alt="DAVAR ACADÉMIE CAMPUS" />
      <div className="gcard">
        {transfert && transfert !== 'indisponible' ? (
          <>
            <h1>Devenir propriétaire du campus</h1>
            <p>
              <b>{transfert.de}</b> vous propose de devenir l’unique propriétaire de DAVAR ACADÉMIE. Toutes les données,
              intégrations et réglages seront transmis. Il restera membre de l’équipe.
            </p>
            <div className="banner warn" role="status">
              <span>
                Ce lien est valable jusqu’au {new Date(transfert.expiresAtMs).toLocaleString('fr-FR')}. Si vous n’avez
                rien demandé, choisissez « Ce n’était pas moi » : le transfert sera annulé et le propriétaire prévenu.
              </span>
            </div>
            <ConfirmerTransfert token={token} />
          </>
        ) : (
          <>
            <h1>Transfert de propriété</h1>
            <div className="banner err" role="alert">
              <span>
                {transfert === 'indisponible'
                  ? 'La plateforme est momentanément indisponible. Réessayez dans quelques instants.'
                  : 'Ce lien n’est plus valable : il a expiré, il a déjà été utilisé, ou il a été annulé.'}
              </span>
            </div>
            <Link href="/" className="btn btn-ghost mt16">Revenir à l’accueil</Link>
          </>
        )}
      </div>
      <div className="gl-foot">© 2026 Davar Académie — Abidjan, Côte d’Ivoire</div>
    </div>
  );
}
