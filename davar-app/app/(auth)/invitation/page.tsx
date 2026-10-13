import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/SignupForm';
import { currentUser } from '@/lib/server/auth';
import { DUREE_JOURS, invitationDuToken, LIBELLE_INVITATION } from '@/lib/server/invitations';
import { openDb } from '@/lib/server/turso';

export const metadata = { title: 'Votre invitation — Davar Académie Campus' };
export const dynamic = 'force-dynamic';

/**
 * LE LIEN D'INVITATION — 7 jours pour l'équipe, 3 jours pour un accès gracieux.
 *
 * Rien n'est créé par avance : le compte n'existe qu'une fois la personne venue
 * configurer son accès, exactement comme le prototype l'annonce.
 */
export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  if (await currentUser()) redirect('/campus');
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  let invitation = null;
  let indisponible = false;
  try {
    const db = await openDb();
    invitation = token ? await invitationDuToken(db, token) : null;
  } catch {
    indisponible = true;
  }

  return (
    <div className="login-glass">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lg-logo" src="/campus-icon.png" alt="DAVAR ACADÉMIE CAMPUS" />
      <div className="gcard">
        {invitation ? (
          <>
            <h1>{LIBELLE_INVITATION[invitation.kind] ?? 'Votre invitation'}</h1>
            <p>
              Bonjour, cette invitation est réservée à <b>{invitation.email}</b>. Créez votre accès avec cette même
              adresse — elle seule ouvre cette invitation. Le lien reste valable {DUREE_JOURS[invitation.kind] ?? 7} jours.
            </p>
            {invitation.formationTitre && (
              <div className="banner gold" role="status">
                <span>La formation « {invitation.formationTitre} » vous sera ouverte après confirmation de votre adresse.</span>
              </div>
            )}
            <SignupForm invitation={token} />
            <p className="xs faint mt16">
              Une fois votre adresse confirmée, votre accès est prêt. Si ce message ne vous concerne pas, fermez cette
              page : aucun compte ne sera créé.
            </p>
          </>
        ) : (
          <>
            <h1>Invitation</h1>
            <div className={indisponible ? 'banner warn' : 'banner err'} role="alert">
              <span>
                {indisponible
                  ? 'La plateforme est momentanément indisponible. Réessayez dans quelques instants.'
                  : 'Cette invitation n’est plus valable : elle a expiré, elle a déjà servi, ou le lien est incomplet.'}
              </span>
            </div>
            <Link href="/connexion" className="btn btn-ghost mt16">J’ai déjà un compte</Link>
          </>
        )}
      </div>
      <div className="gl-foot">© 2026 Davar Académie — Abidjan, Côte d’Ivoire</div>
    </div>
  );
}
