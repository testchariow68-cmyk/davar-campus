import { redirect } from 'next/navigation';
import { DecisionsListe } from '@/components/direction/DecisionsListe';
import { sessionSection } from '@/lib/server/direction-access';
import { demandesEnAttente } from '@/lib/server/certificats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certificats — Direction' };

/** CERTIFICATS — chaque demande est une décision humaine. Valider délivre un code. */
export default async function CertificatsDirectionPage() {
  const proprietaire = await sessionSection('certificats');
  if (!proprietaire) redirect('/direction');
  const demandes = await demandesEnAttente(proprietaire.db);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Demandes de certificat</h1>
          <p>
            Le nom porté sur le certificat est celui du profil au moment de la demande : il sera <b>figé</b>.
            Valider délivre un code de vérification public.
          </p>
        </div>
      </div>

      <DecisionsListe
        elements={demandes.map((demande) => ({
          id: demande.id,
          titre: demande.etudiant,
          sousTitre: `${demande.formation} · ${demande.courriel}`,
          detail: `Nom qui figurera sur le certificat : « ${demande.holderName} ».`,
          meta: new Date(demande.atMs).toLocaleDateString('fr-FR'),
          statut: 'pending',
          genre: 'certificat' as const,
        }))}
      />
    </>
  );
}
