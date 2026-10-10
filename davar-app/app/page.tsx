import { SessionNav } from '@/components/SessionNav';

export const metadata = { title: 'Davar Académie — Campus privé' };

/**
 * ENTRÉE DU CAMPUS — et rien d'autre.
 *
 * Décision du propriétaire (6 octobre 2026) : les pages de vente de
 * l'application sont supprimées, parce que ses prix n'étaient pas les vrais et
 * que la vente se fait sur SA page officielle. Cette page ne vend donc rien :
 * elle ouvre l'entrée du campus privé, et rappelle où l'on prend son accès.
 *
 * Conséquence technique recherchée : plus aucun prix n'est affiché dans
 * l'application, et la page reste STATIQUE (aucun accès base au rendu) — zéro
 * requête dynamique pour un visiteur qui n'est pas encore étudiant.
 */
export default function Home() {
  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 48 }}>
      <header className="row between" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-structure.png" alt="Davar Académie" className="brand-img" />
        </div>
        <SessionNav />
      </header>

      <section className="card card-pad mt16" style={{ maxWidth: 720 }}>
        <h1>Campus privé</h1>
        <p className="muted small">
          Le campus de <strong>DAVAR ACADÉMIE</strong> réunit vos formations, vos leçons et votre
          progression. Il n&apos;est pas public : on y entre avec l&apos;accès reçu après un achat,
          ou avec un accès ouvert par la direction.
        </p>

        <div className="banner info mt16">
          <span>
            Vous n&apos;avez pas encore d&apos;accès ? Les inscriptions et les paiements se font sur
            la page officielle de DAVAR ACADÉMIE, jamais ici.
          </span>
        </div>

        <p className="small muted mt16">
          Une fois l&apos;achat effectué, créez votre compte avec <strong>exactement la même adresse
          e-mail</strong> que celle utilisée pour l&apos;achat, puis confirmez cette adresse : votre
          formation est rattachée à votre compte.
        </p>
      </section>

      <section className="card card-pad mt16" style={{ maxWidth: 720 }}>
        <h2 style={{ fontSize: 17 }}>Vous avez déjà un accès</h2>
        <p className="muted small">
          Se connecter ouvre votre espace : vos formations, vos modules, vos leçons et votre
          progression, enregistrée au fil de votre travail.
        </p>
      </section>
    </main>
  );
}
