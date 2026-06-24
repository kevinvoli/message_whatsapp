// front/src/lib/definitions.ts

export interface QuizTodayStatus {
  sessionActive: boolean;
  isExempt: boolean;
  attemptCompleted: boolean;
  /** true dès que l'obligation du jour est remplie */
  alreadySubmittedToday: boolean;
  /** ID de la session du jour, null si aucune session active */
  sessionId: string | null;
  /** true = le commercial doit atteindre le score de passage pour débloquer l'accès */
  requirePass: boolean;
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
