import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { conversationsDeEtudiant } from '@/lib/server/echanges';
import { nomAssistant, lireConfig } from '@/lib/server/assistant';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes questions — Davar Académie Campus' };

function quand(atMs: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - atMs) / 60000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}

/** MES QUESTIONS — copie de `vMyQuestions()` du prototype. */
export default async function MesQuestionsPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const [conversations, config] = await Promise.all([
    conversationsDeEtudiant(session.db, session.user.id),
    lireConfig(session.db),
  ]);
  const nom = nomAssistant(config);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes questions</h1>
          <p>Vos conversations avec {nom} et votre coach — relisez-les à tout moment.</p>
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="card card-pad">
          <div className="empty">
            <Icon nom="message" taille={24} />
            <h3 className="mt16">Aucune question pour l&apos;instant</h3>
            <p className="muted small mt8">
              Depuis un module, posez votre question : {nom} répond immédiatement, et votre coach sous
              48 heures si besoin.
            </p>
            <Link href="/campus/formations" className="btn btn-primary mt16">
              <Icon nom="cap" taille={15} /> Aller à mes formations
            </Link>
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/campus/questions/${conversation.id}`}
              className="card card-pad"
              style={{ display: 'block' }}
            >
              <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="row" style={{ gap: 8 }}>
                  <Icon nom={conversation.mode === 'coach' ? 'message' : 'sparkles'} taille={15} />
                  <b className="small">{conversation.mode === 'coach' ? 'Coach' : `${nom} (IA)`}</b>
                  <span className="xs faint">
                    {conversation.formation}
                    {conversation.module ? ` · ${conversation.module}` : ''}
                  </span>
                </span>
                <span className="xs muted">
                  {quand(conversation.updatedAtMs)} ·{' '}
                  {conversation.resolue ? (
                    <span className="badge b-green">répondue</span>
                  ) : (
                    <span className="badge b-gold">en attente</span>
                  )}
                </span>
              </div>
              {conversation.dernierMessage && <p className="small muted mt8">{conversation.dernierMessage.slice(0, 160)}…</p>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
