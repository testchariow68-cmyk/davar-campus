import { notFound, redirect } from 'next/navigation';
import ConversationDetail from '@/components/direction/ConversationDetail';
import { sessionSection } from '@/lib/server/direction-access';
import { ficheConversation, messagesDeConversation } from '@/lib/server/echanges';
import { lireConfig, nomAssistant } from '@/lib/server/assistant';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conversation — Direction' };

/** CONVERSATION (détail) — le fil d'un étudiant, avec la supervision de la réponse de l'assistant. */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const proprietaire = await sessionSection('conversations');
  if (!proprietaire) redirect('/direction');

  const { id } = await params;
  const [fil, messages, config] = await Promise.all([
    ficheConversation(proprietaire.db, id),
    messagesDeConversation(proprietaire.db, id),
    lireConfig(proprietaire.db),
  ]);
  if (!fil) notFound();

  return (
    <ConversationDetail
      fil={{
        id: fil.id,
        etudiant: fil.etudiant,
        courriel: fil.courriel,
        formation: fil.formation,
        module: fil.module,
        mode: fil.mode,
        resolue: fil.resolue,
        iaValidee: fil.iaValidee,
      }}
      messages={messages.map((message) => ({
        id: message.id,
        auteur: message.auteur,
        texte: message.texte,
        atMs: message.atMs,
        valide: message.valide,
      }))}
      nomAssistant={nomAssistant(config)}
    />
  );
}
