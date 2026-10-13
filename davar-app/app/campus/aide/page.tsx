import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { lireReglages } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Besoin d'aide ? — Davar Académie Campus" };

/**
 * AIDE — mêmes moyens de contact que le prototype : WhatsApp, appel, e-mail.
 * Ni le mot « Support » seul, ni les mots réservés du projet ne sont employés :
 * le prototype parle de « Contacter le support » avec une icône de casque.
 *
 * NOMMER LES CHOSES PAR LEUR NOM : ce qui n'est pas encore disponible (la
 * discussion en direct) est annoncé comme tel, jamais simulé.
 */
export default async function AidePage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const reglages = await lireReglages(session.db);
  const whatsapp = reglages['support.whatsapp'];
  const telephone = reglages['support.phone'];
  const courriel = reglages['support.email'];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Besoin d&apos;aide ?</h1>
          <p>Une question sur une formation, un accès, un paiement : écrivez-nous, nous répondons.</p>
        </div>
      </div>

      <div className="card card-pad mb16">
        <div className="card-head" style={{ padding: 0, border: 'none', marginBottom: 12 }}>
          <h3>Nous joindre</h3>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <a
            className="btn sup-btn"
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
          >
            <Icon nom="whatsapp" taille={15} /> WhatsApp
          </a>
          <a className="btn sup-btn" href={`tel:${telephone.replace(/\s+/g, '')}`}>
            <Icon nom="phone" taille={15} /> Appeler
          </a>
          <a className="btn sup-btn" href={`mailto:${courriel}`}>
            <Icon nom="mail" taille={15} /> Écrire un e-mail
          </a>
        </div>
        <p className="small muted mt16">
          Adresse : <strong>{courriel}</strong> · Téléphone : <strong>{telephone}</strong>. Ouvrez votre lien
          WhatsApp ou votre application
          d&apos;e-mail depuis cette page : le message part directement.
        </p>
      </div>

      <div className="card card-pad mb16">
        <h3 className="mb8">Les questions les plus fréquentes</h3>

        <div className="dv-item mb8">
          <b>J&apos;ai acheté, mais aucune formation n&apos;apparaît.</b>
          <p className="small muted mt4">
            La formation se rattache automatiquement à <strong>l&apos;adresse e-mail de votre
            achat</strong>, et seulement si cette adresse est <strong>confirmée</strong>. Vérifiez
            qu&apos;elle correspond bien à celle utilisée au moment du paiement. Si tout est correct et
            que rien n&apos;apparaît, écrivez-nous : la direction ouvre l&apos;accès à la main.
          </p>
        </div>

        <div className="dv-item mb8">
          <b>Je n&apos;ai pas reçu l&apos;e-mail de confirmation.</b>
          <p className="small muted mt4">
            Regardez dans les indésirables. Si l&apos;adresse est erronée, écrivez-nous : nous ne
            pouvons la corriger que depuis la direction, et jamais sans votre demande.
          </p>
        </div>

        <div className="dv-item">
          <b>Combien de temps gardé-je mon accès ?</b>
          <p className="small muted mt4">
            Douze mois à partir de l&apos;achat. Votre progression est enregistrée au fil de votre
            travail : enrichir une formation ne la remet jamais à zéro.
          </p>
        </div>
      </div>

      <div className="banner info">
        <span>
          La messagerie en direct dans le campus n&apos;est pas encore ouverte. Tant qu&apos;elle ne
          l&apos;est pas, ces trois moyens de contact restent pleinement suivis par la direction.
        </span>
      </div>

      <Link href="/campus" className="btn btn-ghost mt16">
        <Icon nom="back" taille={15} /> Retour au tableau de bord
      </Link>
    </>
  );
}
