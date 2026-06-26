'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getQuizAttemptResult, getQuizToday } from '@/lib/api';
import type { QuizAttemptResult, QuizTodayStatus } from '@/lib/definitions';

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

function QuizResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId');

  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [quizStatus, setQuizStatus] = useState<QuizTodayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) {
      setError('Identifiant de tentative manquant.');
      setLoading(false);
      return;
    }

    Promise.all([getQuizAttemptResult(attemptId), getQuizToday()])
      .then(([attemptResult, status]) => {
        setResult(attemptResult);
        setQuizStatus(status);
      })
      .catch(() => setError('Impossible de charger les resultats.'))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto" />
          <p className="text-gray-500 text-sm">Chargement des resultats...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error ?? 'Resultats introuvables.'}</p>
          <button
            onClick={() => router.push('/whatsapp')}
            className="rounded bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
          >
            Acceder aux conversations
          </button>
        </div>
      </div>
    );
  }

  const percent =
    result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;

  const canRetry =
    quizStatus !== null &&
    !quizStatus.attemptCompleted &&
    quizStatus.sessionActive &&
    !quizStatus.isExempt;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto w-full max-w-2xl space-y-4">

        {/* En-tete */}
        <div className="rounded-xl bg-white shadow-md p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
            <div>
              <p className="text-sm text-gray-500 mb-1">
                Tentative {result.attemptNumber}
              </p>
              <h1 className="text-xl font-semibold text-gray-800">
                Score : {result.score} / {result.maxScore} pts{' '}
                <span className="text-gray-500 font-normal text-base">({percent}%)</span>
              </h1>
            </div>

            {result.isPassed === true && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Reussi
              </span>
            )}
            {result.isPassed === false && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Echoue
              </span>
            )}
          </div>

          {result.timedOut && (
            <p className="mt-2 text-sm text-orange-600">
              Le temps imparti etait ecoule lors de la soumission.
            </p>
          )}
        </div>

        {/* Detail par question */}
        <div className="space-y-3">
          {result.questions.map((q, index) => {
            let cardClass: string;
            let indicator: string;

            if (q.timedOut) {
              cardClass = 'border-orange-200 bg-orange-50';
              indicator = 'Temps ecoule';
            } else if (q.isCorrect) {
              cardClass = 'border-green-200 bg-green-50';
              indicator = 'Correct';
            } else {
              cardClass = 'border-red-200 bg-red-50';
              indicator = 'Incorrect';
            }

            return (
              <div
                key={index}
                className={`rounded-xl border-2 p-4 ${cardClass}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <StatusIcon timedOut={q.timedOut} isCorrect={q.isCorrect} />
                    <div className="min-w-0">
                      <span className="text-xs text-gray-500 mr-2">{q.categoryName}</span>
                      <p className="text-sm font-medium text-gray-800 mt-0.5 leading-snug">
                        {index + 1}. {q.questionText}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-gray-600">
                      {q.pointsEarned} / {q.questionMaxPoints} pt{q.questionMaxPoints !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-gray-400">{indicator}</p>
                  </div>
                </div>

                {q.selectedAnswer && (
                  <p className="text-sm text-gray-600 ml-6">
                    <span className="font-medium">Votre reponse :</span>{' '}
                    {q.selectedAnswer.text}
                  </p>
                )}

                {!q.isCorrect && !q.timedOut && (
                  <p className="text-sm text-red-700 ml-6 mt-1">
                    <span className="font-medium">Bonne reponse :</span>{' '}
                    {q.correctAnswer.text}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Boutons d'action */}
        <div className="flex flex-wrap gap-3 justify-end pt-2">
          {canRetry && (
            <button
              onClick={() => router.push('/quiz')}
              aria-label="Recommencer le quiz"
              className="rounded-lg border border-blue-500 px-5 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              Recommencer
            </button>
          )}
          <button
            onClick={() => router.push('/whatsapp')}
            aria-label="Acceder aux conversations"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Acceder aux conversations
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuizResultPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>}>
      <QuizResultContent />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Icone de statut inline (SVG, pas d'emoji)
// ---------------------------------------------------------------------------

interface StatusIconProps {
  timedOut: boolean;
  isCorrect: boolean;
}

function StatusIcon({ timedOut, isCorrect }: StatusIconProps) {
  if (timedOut) {
    return (
      <svg
        className="h-5 w-5 shrink-0 text-orange-500 mt-0.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-label="Temps ecoule"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (isCorrect) {
    return (
      <svg
        className="h-5 w-5 shrink-0 text-green-600 mt-0.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-label="Reponse correcte"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg
      className="h-5 w-5 shrink-0 text-red-500 mt-0.5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-label="Reponse incorrecte"
    >
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}
