'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getQuizToday, startQuizAttempt, submitQuizAttempt, getQuizPdfs } from '@/lib/api';
import type { QuizTodayStatus, QuizStartResult, QuizPdf } from '@/lib/definitions';

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

interface AnswerState {
  answerId: string | null;
  timedOut: boolean;
}

// ---------------------------------------------------------------------------
// Composants utilitaires
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto" />
        <p className="text-gray-500 text-sm">Chargement du quiz...</p>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  message: string;
  onBack: () => void;
}

function EmptyState({ message, onBack }: EmptyStateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow text-center">
        <p className="text-gray-600 mb-6">{message}</p>
        <button
          onClick={onBack}
          className="rounded bg-blue-500 px-6 py-2 text-white hover:bg-blue-600"
        >
          Acceder aux conversations
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer PDF
// ---------------------------------------------------------------------------

interface PdfDrawerProps {
  pdfs: QuizPdf[];
  onClose: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function PdfDrawer({ pdfs, onClose }: PdfDrawerProps) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-label="Fermer le panneau PDF"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClose()}
      />
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col h-full">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-800">Documents PDF</h2>
          <button
            onClick={onClose}
            aria-label="Fermer le panneau PDF"
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {pdfs.map((pdf) => (
            <div key={pdf.id} className="rounded-lg border bg-gray-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{pdf.originalName}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(pdf.fileSize)}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {pdf.allowInlineView && (
                    <button
                      onClick={() => setViewingId(viewingId === pdf.id ? null : pdf.id)}
                      aria-label={`Voir le document ${pdf.originalName}`}
                      className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200"
                    >
                      Voir
                    </button>
                  )}
                  <button
                    onClick={() => window.open(`${apiBase}/quiz/pdfs/${pdf.id}/download`, '_blank')}
                    aria-label={`Telecharger ${pdf.originalName}`}
                    className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300"
                  >
                    Telecharger
                  </button>
                </div>
              </div>
              {viewingId === pdf.id && (
                <div className="mt-3">
                  <iframe
                    src={`${apiBase}/quiz/pdfs/${pdf.id}/view`}
                    title={pdf.originalName}
                    className="h-80 w-full rounded border"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function QuizPage() {
  const router = useRouter();

  // --- Etat chargement initial ---
  const [quizData, setQuizData] = useState<QuizTodayStatus | null>(null);
  const [pdfs, setPdfs] = useState<QuizPdf[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [errorInitial, setErrorInitial] = useState<string | null>(null);

  // --- Etat tentative en cours ---
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number>(1);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [questionOrder, setQuestionOrder] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // --- Timers ---
  const [globalSecondsLeft, setGlobalSecondsLeft] = useState<number | null>(null);
  const [questionSecondsLeft, setQuestionSecondsLeft] = useState<number | null>(null);
  const globalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- UI ---
  const [pdfDrawerOpen, setPdfDrawerOpen] = useState(false);
  const [quizActive, setQuizActive] = useState(false);

  // --- Ref pour eviter les appels en double dans le timer global ---
  const submittingRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Chargement initial
  // ---------------------------------------------------------------------------

  useEffect(() => {
    Promise.all([
      getQuizToday(),
      getQuizPdfs().catch(() => [] as QuizPdf[]),
    ])
      .then(([quiz, pdfList]) => {
        setQuizData(quiz);
        setPdfs(pdfList);
        // Reprendre une tentative existante
        if (quiz.currentAttempt) {
          setAttemptId(quiz.currentAttempt.attemptId);
          setAttemptNumber(quiz.currentAttempt.attemptNumber);
          if (quiz.currentAttempt.expiresAt) {
            setExpiresAt(new Date(quiz.currentAttempt.expiresAt).getTime());
          }
          if (quiz.session) {
            setQuestionOrder(quiz.session.questions.map((q) => q.id));
          }
          setQuizActive(true);
        }
      })
      .catch(() => setErrorInitial('Impossible de charger le quiz'))
      .finally(() => setLoadingInitial(false));
  }, []);

  // ---------------------------------------------------------------------------
  // Timer global
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (timedOutGlobal: boolean) => {
      if (submittingRef.current || !attemptId) return;
      submittingRef.current = true;
      setSubmitting(true);

      if (globalTimerRef.current) clearInterval(globalTimerRef.current);
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);

      const answersArray = questionOrder.map((qId) => ({
        questionId: qId,
        answerId: answers[qId]?.answerId ?? null,
        timedOut: timedOutGlobal ? true : (answers[qId]?.timedOut ?? false),
      }));

      try {
        await submitQuizAttempt(attemptId, answersArray, timedOutGlobal);
        router.push(`/quiz/result?attemptId=${attemptId}`);
      } catch {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [attemptId, questionOrder, answers, router],
  );

  useEffect(() => {
    if (!quizActive || expiresAt === null) return;

    const tick = () => {
      const remaining = Math.floor((expiresAt - Date.now()) / 1000);
      if (remaining <= 0) {
        setGlobalSecondsLeft(0);
        if (globalTimerRef.current) clearInterval(globalTimerRef.current);
        handleSubmit(true);
      } else {
        setGlobalSecondsLeft(remaining);
      }
    };

    tick();
    globalTimerRef.current = setInterval(tick, 1000);
    return () => {
      if (globalTimerRef.current) clearInterval(globalTimerRef.current);
    };
  }, [quizActive, expiresAt, handleSubmit]);

  // ---------------------------------------------------------------------------
  // Timer question
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!quizActive || !quizData?.session) return;

    const orderedQuestions = questionOrder
      .map((id) => quizData.session!.questions.find((q) => q.id === id))
      .filter((q): q is NonNullable<typeof q> => q !== undefined);

    const currentQ = orderedQuestions[currentIndex];
    if (!currentQ?.timeLimitSeconds) {
      setQuestionSecondsLeft(null);
      return;
    }

    const limit = currentQ.timeLimitSeconds;
    setQuestionSecondsLeft(limit);

    questionTimerRef.current = setInterval(() => {
      setQuestionSecondsLeft((prev) => {
        if (prev === null || prev <= 1) {
          if (questionTimerRef.current) clearInterval(questionTimerRef.current);
          setAnswers((a) => ({
            ...a,
            [currentQ.id]: { answerId: null, timedOut: true },
          }));
          setCurrentIndex((i) => {
            const orderedLen = orderedQuestions.length;
            return i < orderedLen - 1 ? i + 1 : i;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [quizActive, quizData, questionOrder, currentIndex]);

  // ---------------------------------------------------------------------------
  // Demarrage du quiz
  // ---------------------------------------------------------------------------

  async function handleStart() {
    if (!quizData?.session) return;
    setStarting(true);
    try {
      const result: QuizStartResult = await startQuizAttempt(quizData.session.id);
      setAttemptId(result.attemptId);
      setAttemptNumber(result.attemptNumber);
      setQuestionOrder(result.questionOrder);
      if (result.expiresAt) {
        setExpiresAt(new Date(result.expiresAt).getTime());
      }
      setCurrentIndex(0);
      setAnswers({});
      setQuizActive(true);
    } catch (e) {
      setErrorInitial(e instanceof Error ? e.message : 'Erreur lors du demarrage');
    } finally {
      setStarting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation entre questions
  // ---------------------------------------------------------------------------

  function handleSelectAnswer(questionId: string, answerId: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { answerId, timedOut: false },
    }));
  }

  function handlePrev() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }

  function handleNext() {
    if (quizData?.session && currentIndex < questionOrder.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Formatage du timer
  // ---------------------------------------------------------------------------

  function formatTimer(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // Etats non-quiz
  // ---------------------------------------------------------------------------

  if (loadingInitial) return <Spinner />;

  if (errorInitial) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-500 mb-4">{errorInitial}</p>
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

  if (!quizData?.sessionActive) {
    return <EmptyState message="Aucun quiz aujourd'hui." onBack={() => router.push('/whatsapp')} />;
  }

  if (quizData.isExempt) {
    return <EmptyState message="Vous etes exempte du quiz." onBack={() => router.push('/whatsapp')} />;
  }

  if (quizData.attemptCompleted && !quizActive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow text-center">
          <p className="text-green-600 font-medium mb-2">Quiz complete</p>
          {quizData.bestScore !== null && (
            <p className="text-gray-500 text-sm mb-6">
              Meilleur score : {quizData.bestScore} point{quizData.bestScore > 1 ? 's' : ''}
            </p>
          )}
          <button
            onClick={() => router.push('/whatsapp')}
            className="rounded bg-green-500 px-6 py-2 text-white hover:bg-green-600"
          >
            Acceder aux conversations
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Ecran de demarrage
  // ---------------------------------------------------------------------------

  if (!quizActive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
          <h1 className="mb-2 text-xl font-semibold text-gray-800">Quiz du jour</h1>
          {quizData.session && (
            <p className="mb-6 text-gray-500">{quizData.session.title}</p>
          )}
          {quizData.session?.totalTimeMinutes && (
            <p className="mb-4 text-sm text-gray-400">
              Duree : {quizData.session.totalTimeMinutes} minute{quizData.session.totalTimeMinutes > 1 ? 's' : ''}
            </p>
          )}
          <p className="mb-6 text-sm text-gray-400">
            {quizData.attemptsCount} / {quizData.session?.maxAttempts} tentative{(quizData.session?.maxAttempts ?? 1) > 1 ? 's' : ''} utilisee{quizData.attemptsCount > 1 ? 's' : ''}
          </p>
          <button
            onClick={handleStart}
            disabled={starting}
            aria-label="Commencer le quiz du jour"
            className="w-full rounded bg-blue-500 px-6 py-3 text-white font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {starting ? 'Demarrage...' : 'Commencer le quiz'}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Quiz actif
  // ---------------------------------------------------------------------------

  const session = quizData.session!;
  const orderedQuestions = questionOrder
    .map((id) => session.questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => q !== undefined);

  const currentQuestion = orderedQuestions[currentIndex];
  const isLastQuestion = currentIndex === orderedQuestions.length - 1;
  const progressPercent = Math.round(((currentIndex + 1) / orderedQuestions.length) * 100);
  const globalTimerRed = globalSecondsLeft !== null && globalSecondsLeft < 120;
  const questionTimerPercent =
    currentQuestion?.timeLimitSeconds && questionSecondsLeft !== null
      ? Math.max(0, (questionSecondsLeft / currentQuestion.timeLimitSeconds) * 100)
      : null;

  const categoryColor = currentQuestion?.category.color ?? '#3b82f6';

  return (
    <>
      {pdfDrawerOpen && pdfs.length > 0 && (
        <PdfDrawer pdfs={pdfs} onClose={() => setPdfDrawerOpen(false)} />
      )}

      <div className="min-h-screen bg-gray-50 flex flex-col items-center py-6 px-4">
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-md overflow-hidden">

          {/* En-tete */}
          <div className="bg-blue-600 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-white font-semibold text-base truncate">
                  Quiz du jour — {session.title}
                </h1>
                <p className="text-blue-200 text-sm mt-0.5">
                  Tentative {attemptNumber}/{session.maxAttempts} · Question {currentIndex + 1}/{orderedQuestions.length}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {globalSecondsLeft !== null && (
                  <span
                    className={`text-sm font-mono font-semibold px-2 py-1 rounded ${
                      globalTimerRed
                        ? 'bg-red-500 text-white'
                        : 'bg-blue-500 text-white'
                    }`}
                    aria-label={`Temps restant : ${formatTimer(globalSecondsLeft)}`}
                  >
                    {formatTimer(globalSecondsLeft)}
                  </span>
                )}

                {pdfs.length > 0 && (
                  <button
                    onClick={() => setPdfDrawerOpen(true)}
                    aria-label="Ouvrir les documents PDF"
                    className="rounded bg-white/20 px-3 py-1.5 text-white text-sm hover:bg-white/30 whitespace-nowrap"
                  >
                    Docs PDF
                  </button>
                )}
              </div>
            </div>

            {/* Barre de progression globale */}
            <div className="mt-3 h-2 rounded-full bg-blue-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
                role="progressbar"
                aria-valuenow={currentIndex + 1}
                aria-valuemin={1}
                aria-valuemax={orderedQuestions.length}
              />
            </div>
          </div>

          {/* Corps de la question */}
          <div className="p-5">
            {/* Categorie + timer question */}
            <div className="flex items-center justify-between mb-4">
              <span
                className="rounded-full px-3 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: categoryColor }}
              >
                {currentQuestion?.category.name}
              </span>

              {questionTimerPercent !== null && questionSecondsLeft !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-gray-600">
                    {questionSecondsLeft}s
                  </span>
                  <div className="w-24 h-2 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-orange-400 transition-all duration-1000 linear"
                      style={{ width: `${questionTimerPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Texte de la question */}
            <p className="text-gray-800 font-medium text-base mb-5 leading-relaxed">
              {currentQuestion?.text}
            </p>

            {/* Reponses */}
            <div className="space-y-2 mb-6">
              {currentQuestion?.answers.map((answer) => {
                const selected = answers[currentQuestion.id]?.answerId === answer.id;
                return (
                  <button
                    key={answer.id}
                    onClick={() => handleSelectAnswer(currentQuestion.id, answer.id)}
                    aria-label={`Selectionner la reponse : ${answer.text}`}
                    aria-pressed={selected}
                    className={`w-full text-left rounded-lg border-2 px-4 py-3 text-sm transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                  >
                    {answer.text}
                  </button>
                );
              })}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handlePrev}
                disabled={currentIndex === 0}
                aria-label="Question precedente"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Precedent
              </button>

              <div className="flex gap-3">
                {isLastQuestion ? (
                  <button
                    onClick={() => handleSubmit(false)}
                    disabled={submitting}
                    aria-label="Soumettre le quiz"
                    className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {submitting ? 'Envoi...' : 'Soumettre le quiz'}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    disabled={currentIndex >= orderedQuestions.length - 1}
                    aria-label="Question suivante"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Suivant
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
