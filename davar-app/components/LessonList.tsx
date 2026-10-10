'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Lesson } from '@/lib/server/campus';

const KIND_LABEL: Record<Lesson['kind'], string> = {
  video: 'Vidéo',
  text: 'Lecture',
  exercise: 'Exercice',
  live: 'Session live',
};

/** Liste des leçons d'un module : coche la progression côté serveur uniquement. */
export function LessonList({ lessons }: { lessons: Lesson[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function toggle(lesson: Lesson) {
    setBusyId(lesson.id);
    setError(null);
    try {
      const response = await fetch('/api/campus/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, completed: !lesson.completed }),
      });
      if (!response.ok) {
        setError(response.status === 403 ? 'Leçon hors de vos formations autorisées.' : 'Mise à jour impossible.');
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError('Mise à jour impossible.');
    } finally {
      setBusyId(null);
    }
  }

  if (lessons.length === 0)
    return <p className="muted small">Ce module n’a pas encore de leçon publiée.</p>;

  return (
    <div>
      {error && <div className="banner err" role="alert"><span>{error}</span></div>}
      <ul style={{listStyle:'none',padding:0,margin:0}}>
        {lessons.map((lesson) => (
          <li
            key={lesson.id}
            className="row between"
            style={{gap:12,padding:'10px 0',borderBottom:'1px solid var(--line)'}}
          >
            <div style={{minWidth:0}}>
              <div className="row" style={{gap:8,flexWrap:'wrap'}}>
                <strong style={{fontSize:14}}>{lesson.title}</strong>
                <span className="badge" style={{background:'var(--violet-soft)',color:'var(--violet-deep)'}}>
                  {KIND_LABEL[lesson.kind]}
                </span>
                {lesson.completed && (
                  <span className="badge" style={{background:'var(--green-soft)',color:'#14602F'}}>Terminée</span>
                )}
              </div>
              <div className="small muted" style={{marginTop:2}}>
                {lesson.durationMin ? `${lesson.durationMin} min` : 'Durée non renseignée'}
                {' · '}
                {lesson.resourceUrl ? (
                  <a href={lesson.resourceUrl} target="_blank" rel="noreferrer">Ouvrir la ressource</a>
                ) : (
                  'Ressource pas encore publiée'
                )}
              </div>
            </div>
            <button
              type="button"
              className={lesson.completed ? 'btn' : 'btn btn-primary'}
              style={{flexShrink:0}}
              disabled={busyId === lesson.id}
              onClick={() => toggle(lesson)}
            >
              {busyId === lesson.id ? '…' : lesson.completed ? 'Annuler' : 'Marquer terminée'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
