// front/src/lib/api.ts
import { CommercialStatsDto, RestrictionConfig } from '@/types/chat';
import { PanelMediaResponse } from '@/types/media-panel';
import type { QuizTodayStatus, QuizStartResult, QuizSubmitResult, QuizAttemptResult, QuizPdf, QuizHistoryEntry, CommercialPlanningEntry } from '@/lib/definitions';

export interface MessageRestrictionConfig {
  enabled: boolean;
  maxWordLength: number;
  maxRepeatedChars: number;
  minAudioDurationSeconds: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.replace('/login');
    }
    let errorMessage: string;
    try {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json') && response.status !== 204) {
        const errorData = await response.json();
        errorMessage = errorData.message || JSON.stringify(errorData);
      } else {
        errorMessage = response.statusText || `Erreur inconnue (${response.status})`;
      }
    } catch {
      errorMessage = response.statusText || `Erreur inconnue (${response.status})`;
    }
    throw new Error(errorMessage);
  }
  return response.json() as Promise<T>;
}

/** Récupère la configuration de restriction du contenu des messages commerciaux. */
export async function getMessageRestrictionConfig(): Promise<MessageRestrictionConfig | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/message-restrictions/config`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) return null;
    return response.json() as Promise<MessageRestrictionConfig>;
  } catch {
    return null;
  }
}

/** Récupère la configuration de restriction de lecture des conversations. */
export async function getRestrictionConfig(): Promise<RestrictionConfig | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/system-config/restriction`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) return null;
    return response.json() as Promise<RestrictionConfig>;
  } catch {
    return null;
  }
}

/** Récupère les stats d'activité du commercial connecté. */
export async function getCommercialStats(
  commercialId: string,
  periode = 'today',
): Promise<CommercialStatsDto> {
  const params = new URLSearchParams({ periode });
  const response = await fetch(`${API_BASE_URL}/auth/me/stats?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<CommercialStatsDto>(response);
}

/** Recupere les medias du panneau pour le commercial connecte. */
export async function getPanelMedia(page = 1, limit = 30): Promise<PanelMediaResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const response = await fetch(`${API_BASE_URL}/poste/poste-panel/media?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<PanelMediaResponse>(response);
}

/** @deprecated Utiliser QuizTodayStatus depuis definitions.ts */
export type TodaySessionResponse = QuizTodayStatus;

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

export async function getQuizHistory(): Promise<QuizHistoryEntry[]> {
  const response = await fetch(`${API_BASE_URL}/quiz/history`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<QuizHistoryEntry[]>(response);
}

export async function takeBreak(breakScheduleId: string): Promise<{ ok: true }> {
  const response = await fetch(`${API_BASE_URL}/commercial/break/take`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ breakScheduleId }),
  });
  return handleResponse<{ ok: true }>(response);
}

export async function getPlanningToday(): Promise<CommercialPlanningEntry | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/planning/self/today`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) return null;
    return response.json() as Promise<CommercialPlanningEntry>;
  } catch {
    return null;
  }
}

export async function getPlanningByDate(date: string): Promise<CommercialPlanningEntry | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/planning/self/date/${date}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) return null;
    return response.json() as Promise<CommercialPlanningEntry>;
  } catch {
    return null;
  }
}

export async function getPlanningMonth(
  year: number,
  month: number,
): Promise<CommercialPlanningEntry[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/planning/self/month/${year}/${month}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) return [];
    return response.json() as Promise<CommercialPlanningEntry[]>;
  } catch {
    return [];
  }
}
