import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { messagesDeConversation } from '@/lib/server/echanges';
import { lireConfig, nomAssistant } from '@/lib/server/assistant';

export const dynamic = 'force-dynamic';

function heure(atMs: number): string {
  return new Date(atMs).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Une conversation relue : le fil complet, dans l'ordre. */
export default async function FilPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { id } = await params;

  // Un étudiant ne relit que SES conversations : la condition est dans la requête.
  const appartient = await session.db.execute({
    sql: 'SELECT 1 AS ok FROM conversations WHERE id = ? AND user_id = ?',
    args: [id, session.user.id],
  });
  if (appartient.rows.length === 0 && session.reel.role === 'admin') {
    const direction = await session.db.execute({ sql: 'SELECT 1 AS ok FROM conversations WHERE id = ?', args: [id] });
    if (direction.rows.length === 0) notFound();
  } else if (appartient.rows.length === 0) {
    notFound();
  }

  const [messages, config] = await Promise.all([messagesDeConversation(session.db, id), lireConfig(session.db)]);
  const nom = nomAssistant(config);

  return (
    <>
      <Link href="/campus/questions" className="small">
        ← Mes questions
      </Link>
      <h1 style={{ fontSize: 21, marginTop: 6 }}>Conversation</h1>

      <div className="card card-pad mt16">
        <div className="col" style={{ gap: 14 }}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`msg ${message.auteur === 'student' ? 'me' : message.auteur === 'coach' ? 'coach' : message.auteur === 'ai' ? 'ai' : 'sys'}`}
              style={{ maxWidth: '100%' }}
            >
              {message.auteur !== 'sys' && (
                <span className="who">
                  {message.auteur === 'student' ? `Vous · ${heure(message.atMs)}` : message.auteur === 'ai' ? `${nom} · ${heure(message.atMs)}` : `Coach · ${heure(message.atMs)}`}
                </span>
              )}
              <span className="bubble" style={{ whiteSpace: 'pre-wrap' }}>
                {message.texte}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="xs faint mt16">
        <Icon nom="clock" taille={12} /> Les conversations avec {nom} sont conservées 90 jours, celles avec
        votre coach 12 mois.
      </p>
    </>
  );
}
