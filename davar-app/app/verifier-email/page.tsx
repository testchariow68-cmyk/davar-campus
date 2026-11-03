import Link from 'next/link';
import { AuthError, claimPurchasesForVerifiedUser, consumeEmailToken } from '@/lib/server/auth-core';
import { appliquerInvitations } from '@/lib/server/invitations';
import { openDb } from '@/lib/server/turso';

export const metadata = { title: 'Confirmation d’adresse — Davar Académie Campus' };
export const dynamic = 'force-dynamic';

type Outcome =
  | { kind: 'ok'; granted: number; role: string | null }
  | { kind: 'invalid' }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

export default async function VerifierEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : null;

  let outcome: Outcome;
  if (!token) {
    outcome = { kind: 'missing' };
  } else {
    try {
      const db = await openDb();
      const consumed = await consumeEmailToken(db, token, 'verify_email');
      // Rattachement immédiat des achats Chariow déjà vérifiés pour cette adresse.
      const granted = await claimPurchasesForVerifiedUser(db, consumed.userId);
      // Une invitation produit son effet ICI, comme un achat : après la preuve
      // que l'adresse est bien celle de la personne invitée.
      const effet = await appliquerInvitations(db, consumed.userId);
      outcome = { kind: 'ok', granted: granted + effet.formations.length, role: effet.role };
    } catch (error) {
      outcome = error instanceof AuthError && error.code === 'invalid_token' ? { kind: 'invalid' } : { kind: 'unavailable' };
    }
  }

  return (
    <div className="login-glass">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lg-logo" src="/campus-icon.png" alt="DAVAR ACADÉMIE CAMPUS" />
      <div className="gcard">
        <h1>Confirmation d’adresse</h1>
        {outcome.kind === 'ok' && (
          <>
            <div className="banner ok" role="status">
              <span>
                Adresse confirmée. Votre compte est actif.
                {outcome.role === 'staff' ? ' Vous faites désormais partie de l’équipe de DAVAR ACADÉMIE.' : ''}
                {outcome.granted > 0
                  ? ` ${outcome.granted} formation${outcome.granted > 1 ? 's' : ''} activée${outcome.granted > 1 ? 's' : ''} pour votre compte.`
                  : outcome.role
                    ? ''
                    : ' Vos achats éventuels seront rattachés automatiquement à cette adresse.'}
              </span>
            </div>
            <Link href="/connexion" className="btn mt16">Se connecter à mon campus</Link>
          </>
        )}
        {outcome.kind === 'invalid' && (
          <>
            <div className="banner err" role="alert">
              <span>Ce lien est invalide, déjà utilisé ou expiré. Demandez un nouveau lien depuis la page de connexion.</span>
            </div>
            <Link href="/connexion" className="btn btn-ghost mt16">Retour à la connexion</Link>
          </>
        )}
        {outcome.kind === 'missing' && (
          <>
            <div className="banner warn" role="status"><span>Aucun lien de confirmation fourni.</span></div>
            <Link href="/connexion" className="btn btn-ghost mt16">Retour à la connexion</Link>
          </>
        )}
        {outcome.kind === 'unavailable' && (
          <>
            <div className="banner err" role="alert"><span>Confirmation impossible pour le moment. Réessayez plus tard.</span></div>
            <Link href="/connexion" className="btn btn-ghost mt16">Retour à la connexion</Link>
          </>
        )}
      </div>
      <div className="gl-foot">© 2026 Davar Académie — Abidjan, Côte d’Ivoire</div>
    </div>
  );
}
