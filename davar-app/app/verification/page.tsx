import { Icon } from '@/components/campus/Icon';
import { verifierCertificat } from '@/lib/server/certificats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vérifier un certificat — Davar Académie' };

/**
 * VÉRIFICATION PUBLIQUE D'UN CERTIFICAT — page ouverte à tous, sans compte.
 * Elle ne dit QUE ce qu'il faut pour vérifier : un nom, une formation, une date,
 * et si le certificat est toujours valide. Rien d'autre ne fuit.
 */
export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const saisi = typeof code === 'string' ? code.trim() : '';
  const resultat = saisi.length > 0 ? await verifierCertificat(await (await import('@/lib/server/turso')).openDb(), saisi) : null;

  function dateLisible(atMs: number): string {
    return new Date(atMs).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  return (
    <main className="container" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 640 }}>
      <div className="page-head">
        <div>
          <h1>Vérifier un certificat</h1>
          <p>
            Saisissez le code figurant sur le certificat. Vous saurez immédiatement s’il a bien été délivré par
            DAVAR ACADÉMIE, à qui, et pour quelle formation.
          </p>
        </div>
      </div>

      <form className="card card-pad" method="get" action="/verification">
        <div className="field">
          <label htmlFor="code">Code du certificat</label>
          <input
            id="code"
            name="code"
            className="inp"
            defaultValue={saisi}
            placeholder="CERT-2026-0001"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="hint">Le code figure en évidence sur le certificat, sous la forme CERT-année-numéro.</div>
        </div>
        <button className="btn btn-primary" type="submit">
          <Icon nom="search" taille={15} /> Vérifier
        </button>
      </form>

      {saisi.length > 0 && resultat && (
        <div className={`banner ${resultat.trouve && resultat.valide ? 'info' : 'err'} mt16`} role="status">
          <Icon nom={resultat.trouve && resultat.valide ? 'checkCircle' : 'alert'} taille={15} />
          <span>
            {resultat.trouve && resultat.valide ? (
              <>
                <b>Certificat authentique.</b> Délivré à <b>{resultat.holderName}</b> pour la formation «{' '}
                {resultat.formationTitle} », le {dateLisible(resultat.issuedAtMs ?? 0)}.
              </>
            ) : resultat.trouve ? (
              <>
                <b>Certificat révoqué.</b> Ce code correspond à un certificat qui n’est plus valide. Écrivez à la
                direction pour en connaître la raison.
              </>
            ) : (
              <>
                <b>Aucun certificat ne porte ce code.</b> Vérifiez la saisie ; si le doute persiste, écrivez à la
                direction.
              </>
            )}
          </span>
        </div>
      )}
    </main>
  );
}
