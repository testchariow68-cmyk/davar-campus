import Link from 'next/link';
import { ReinitialiserForm } from '@/components/ReinitialiserForm';
import { derivationParams, lireJetonReset } from '@/lib/server/auth-core';
import { paramsSecret } from '@/lib/server/auth';
import { openDb } from '@/lib/server/turso';

export const metadata = { title: 'Nouveau mot de passe — Davar Académie Campus' };
export const dynamic = 'force-dynamic';

/**
 * NOUVEAU MOT DE PASSE — page ouverte par le lien reçu par e-mail.
 *
 * Elle n'est pas un écran du campus : on y arrive par le lien, comme la
 * confirmation d'adresse. Le jeton est lu sans être consommé, pour que la page
 * connaisse l'adresse et les paramètres de dérivation ; il n'est consommé
 * qu'au moment où le nouveau mot de passe est réellement enregistré.
 */
export default async function ReinitialiserPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // Le sel et les itérations sont ceux que l'inscription aurait utilisés pour
  // cette adresse : après la réinitialisation, la connexion se fait donc
  // exactement comme après une inscription.
  const secret = paramsSecret();
  let jeton = null;
  if (typeof token === 'string' && token.length > 0 && secret) {
    try {
      const db = await openDb();
      const lu = await lireJetonReset(db, token);
      if (lu) {
        const parametres = await derivationParams(db, lu.email, secret);
        jeton = {
          email: lu.email,
          sel: String(parametres.salt),
          iterations: Number(parametres.iterations),
        };
      }
    } catch {
      jeton = null;
    }
  }

  return (
    <div className="login-glass">
      {/* Le logo est remonté en haut, au centre : c'est l'anneau de
          l'animation d'ouverture, sans les écritures. Le slogan se tient
          juste en dessous, collé contre lui. */}
      <div className="lg-bloc">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lg-anneau" src="/campus-anneau.svg" alt="DAVAR ACADÉMIE CAMPUS" />
        <p className="lg-slogan">L’ÉCOLE DE L’EXCELLENCE ORATOIRE</p>
      </div>
      <div className="gcard">
        <h1>DAVAR ACADÉMIE CAMPUS</h1>
        {jeton ? (
          <ReinitialiserForm
            token={token as string}
            email={jeton.email}
            sel={jeton.sel}
            iterations={jeton.iterations}
          />
        ) : (
          <>
            <p>
              Ce lien n’est plus valable : il a déjà servi, ou il a dépassé sa durée d’une heure.
              Demandez-en un nouveau depuis la connexion.
            </p>
            <Link href="/connexion" className="btn btn-ghost mt16">
              Retour à la connexion
            </Link>
          </>
        )}
      </div>
      <div className="lg-pied">
        <div className="gl-foot">© 2026 Davar Académie — Abidjan, Côte d’Ivoire</div>
      </div>
    </div>
  );
}
