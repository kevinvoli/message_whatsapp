const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Erreur ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface QuizTodayStatus {
  sessionActive: boolean;
  isExempt: boolean;
  attemptCompleted: boolean;
  session: {
    id: string;
    title: string;
    totalTimeMinutes: number | null;
    passingScore: number | null;
    maxAttempts: number;
    questions: {
      id: string;
      text: string;
      timeLimitSeconds: number | null;
      category: { name: string; color: string | null };
      answers: { id: string; text: string }[];
    }[];
  } | null;
  currentAttempt: {
    attemptId: string;
    attemptNumber: number;
    expiresAt: string | null;
  } | null;
  attemptsCount: number;
  bestScore: number | null;
}

export interface QuizStartResult {
  attemptId: string;
  attemptNumber: number;
  expiresAt: string | null;
  questionOrder: string[];
}

export interface QuizSubmitResult {
  score: number;
  maxScore: number;
  isPassed: boolean | null;
  attemptNumber: number;
}

export interface QuizAttemptResult {
  score: number;
  maxScore: number;
  isPassed: boolean | null;
  timedOut: boolean;
  attemptNumber: number;
  questions: {
    questionText: string;
    categoryName: string;
    pointsEarned: number;
    isCorrect: boolean;
    timedOut: boolean;
    selectedAnswer: { text: string } | null;
    correctAnswer: { text: string };
  }[];
}

export interface QuizPdf {
  id: string;
  originalName: string;
  fileSize: number;
  allowInlineView: boolean;
  isPermanent: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  uploadedAt: string;
}

export async function getQuizToday(): Promise<QuizTodayStatus> {
  const response = await fetch(`${API_BASE_URL}/quiz/today`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<QuizTodayStatus>(response);
}

export async function startQuizAttempt(sessionId: string): Promise<QuizStartResult> {
  const response = await fetch(`${API_BASE_URL}/quiz/today/start`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  return handleResponse<QuizStartResult>(response);
}

export async function submitQuizAttempt(
  attemptId: string,
  answers: { questionId: string; answerId: string | null; timedOut: boolean }[],
  timedOut: boolean,
): Promise<QuizSubmitResult> {
  const response = await fetch(`${API_BASE_URL}/quiz/today/submit`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attemptId, answers, timedOut }),
  });
  return handleResponse<QuizSubmitResult>(response);
}

export async function getQuizAttemptResult(attemptId: string): Promise<QuizAttemptResult> {
  const response = await fetch(`${API_BASE_URL}/quiz/today/result/${attemptId}`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<QuizAttemptResult>(response);
}

export async function getQuizPdfs(): Promise<QuizPdf[]> {
  const response = await fetch(`${API_BASE_URL}/quiz/pdfs`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<QuizPdf[]>(response);
}
