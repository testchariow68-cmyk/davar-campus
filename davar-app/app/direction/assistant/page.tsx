import { AssistantConfig } from '@/components/direction/AssistantConfig';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { formationsAssociees, lireConfig } from '@/lib/server/assistant';
import { cleDisponible } from '@/lib/server/ai-providers';
import { FOURNISSEURS, type Fournisseur } from '@/lib/server/assistant';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Assistant virtuel — Direction' };

/**
 * ASSISTANT VIRTUEL — l'écran de configuration du propriétaire.
 * Reconstruction de `aAI()` du prototype : connexion, chaîne de secours,
 * identité affichée, base de connaissances par formation, supervision humaine.
 */
export default async function AssistantDirectionPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');

  const [config, formations] = await Promise.all([
    lireConfig(proprietaire.db),
    formationsAssociees(proprietaire.db),
  ]);

  const ordre: Fournisseur[] = [config.primaryProvider, ...config.chaine.filter((f) => f !== config.primaryProvider)];
  const moteurs = ordre
    .filter((fournisseur) => fournisseur in FOURNISSEURS)
    .map((fournisseur) => ({
      provider: fournisseur,
      nom: FOURNISSEURS[fournisseur].nom,
      note: FOURNISSEURS[fournisseur].note,
      modele: config.modeles[fournisseur] ?? FOURNISSEURS[fournisseur].modele,
      cle: cleDisponible(fournisseur),
      principal: fournisseur === config.primaryProvider,
      dansChaine: config.chaine.includes(fournisseur),
    }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Assistant virtuel</h1>
          <p>
            Chaîne de moteurs interchangeables : changez de fournisseur sans toucher au Campus. Le nom
            affiché est configurable, et la base de connaissances reste séparée par formation.
          </p>
        </div>
      </div>

      <AssistantConfig
        initial={{
          displayName: config.displayName,
          defaultName: config.defaultName,
          lang: config.lang,
          temperature: config.temperature,
          studentDailyCap: config.studentDailyCap,
          transcription: config.transcription,
          primaryProvider: config.primaryProvider,
        }}
        moteurs={moteurs}
        formations={formations.map((formation) => ({ id: formation.id, titre: formation.titre, associee: formation.associee }))}
      />
    </>
  );
}
