import { redirect } from 'next/navigation';
import { ConversationsSupervision } from '@/components/direction/ConversationsSupervision';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { compterEnAttente, toutesConversations } from '@/lib/server/echanges';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conversations — Direction' };

/** CONVERSATIONS — supervision : voir, valider, corriger, répondre à la place de l'assistant. */
export default async function ConversationsPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');

  const [fils, attente] = await Promise.all([
    toutesConversations(proprietaire.db, { limite: 80 }),
    compterEnAttente(proprietaire.db),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Conversations</h1>
          <p>
            L’assistant répond en premier niveau. Vous pouvez valider, corriger ou répondre à sa place —
            et l’étudiant est notifié immédiatement.
          </p>
        </div>
      </div>

      <div className="grid g2 mb16">
        <div className="card card-pad">
          <div className="eyebrow">Questions au coach en attente</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{attente.coach}</div>
          <div className="xs muted">Réponse attendue sous 48 heures.</div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Réponses de l’assistant à superviser</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{attente.iaNonValidee}</div>
          <div className="xs muted">Valider, corriger, ou compléter.</div>
        </div>
      </div>

      <ConversationsSupervision
        fils={fils.map((fil) => ({
          id: fil.id,
          etudiant: fil.etudiant,
          courriel: fil.courriel,
          formation: fil.formation,
          module: fil.module,
          mode: fil.mode,
          resolue: fil.resolue,
          iaValidee: fil.iaValidee,
          dernierMessage: fil.dernierMessage,
          nbMessages: fil.nbMessages,
          atMs: fil.updatedAtMs,
        }))}
      />
    </>
  );
}
