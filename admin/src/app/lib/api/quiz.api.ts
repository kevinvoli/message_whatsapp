import { QuizCategory, QuizQuestion, QuizSession, QuizExemption, QuizSessionResult, QuizPdf } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getQuizCategories(): Promise<QuizCategory[]> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/categories`, { credentials: 'include' });
    return handleResponse<QuizCategory[]>(res);
}

export async function createQuizCategory(dto: { name: string; color?: string }): Promise<QuizCategory> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dto),
    });
    return handleResponse<QuizCategory>(res);
}

export async function updateQuizCategory(id: string, dto: Partial<{ name: string; color: string }>): Promise<QuizCategory> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dto),
    });
    return handleResponse<QuizCategory>(res);
}

export async function deleteQuizCategory(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/categories/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    await handleResponse<void>(res);
}

export async function getQuizQuestions(filters?: {
    categoryId?: string;
    search?: string;
    activeOnly?: boolean;
}): Promise<QuizQuestion[]> {
    const params = new URLSearchParams();
    if (filters?.categoryId) params.set('categoryId', filters.categoryId);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.activeOnly) params.set('activeOnly', 'true');
    const qs = params.toString();
    const res = await fetch(`${API_BASE_URL}/quiz/admin/questions${qs ? `?${qs}` : ''}`, { credentials: 'include' });
    return handleResponse<QuizQuestion[]>(res);
}

export async function createQuizQuestion(dto: {
    categoryId: string;
    text: string;
    points?: number;
    timeLimitSeconds?: number;
    answers: { text: string; isCorrect: boolean; position?: number }[];
}): Promise<QuizQuestion> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dto),
    });
    return handleResponse<QuizQuestion>(res);
}

export async function archiveQuizQuestion(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/questions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    await handleResponse<void>(res);
}

export async function getQuizSessions(): Promise<QuizSession[]> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/sessions`, { credentials: 'include' });
    return handleResponse<QuizSession[]>(res);
}

export async function createQuizSession(dto: {
    title: string;
    sessionDate: string;
    isActive?: boolean;
    passingScore?: number;
    maxAttempts?: number;
    totalTimeMinutes?: number;
    questionIds: string[];
}): Promise<QuizSession> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dto),
    });
    return handleResponse<QuizSession>(res);
}

export async function updateQuizSession(
    id: string,
    dto: Partial<{
        title: string;
        sessionDate: string;
        isActive: boolean;
        passingScore: number;
        maxAttempts: number;
        totalTimeMinutes: number;
        questionIds: string[];
    }>,
): Promise<QuizSession> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dto),
    });
    return handleResponse<QuizSession>(res);
}

export async function deleteQuizSession(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/sessions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    await handleResponse<void>(res);
}

export async function duplicateQuizSession(
    id: string,
    targetDates: string[],
): Promise<{ created: string[]; skipped: string[] }> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/sessions/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetDates }),
    });
    return handleResponse<{ created: string[]; skipped: string[] }>(res);
}

export async function getQuizExemptions(): Promise<QuizExemption[]> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/exemptions`, { credentials: 'include' });
    return handleResponse<QuizExemption[]>(res);
}

export async function createQuizExemption(dto: {
    scope: 'commercial' | 'poste';
    commercialId?: string;
    posteId?: string;
    reason?: string;
}): Promise<QuizExemption> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/exemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dto),
    });
    return handleResponse<QuizExemption>(res);
}

export async function deleteQuizExemption(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/exemptions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    await handleResponse<void>(res);
}

export async function getQuizSessionResults(sessionId: string): Promise<QuizSessionResult[]> {
    const res = await fetch(
        `${API_BASE_URL}/quiz/admin/sessions/${encodeURIComponent(sessionId)}/results`,
        { credentials: 'include' },
    );
    return handleResponse<QuizSessionResult[]>(res);
}

export async function getQuizPdfs(): Promise<QuizPdf[]> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/pdfs`, { credentials: 'include' });
    return handleResponse<QuizPdf[]>(res);
}

export async function uploadQuizPdf(formData: FormData): Promise<QuizPdf> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/pdfs`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
    });
    return handleResponse<QuizPdf>(res);
}

export async function uploadSessionPdf(sessionId: string, formData: FormData): Promise<QuizPdf> {
    const res = await fetch(
        `${API_BASE_URL}/quiz/admin/sessions/${encodeURIComponent(sessionId)}/pdf`,
        {
            method: 'POST',
            credentials: 'include',
            body: formData,
        },
    );
    return handleResponse<QuizPdf>(res);
}

export async function updateQuizPdf(
    id: string,
    data: Partial<Pick<QuizPdf, 'allowInlineView' | 'isPermanent' | 'availableFrom' | 'availableUntil'>>,
): Promise<QuizPdf> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/pdfs/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
    });
    return handleResponse<QuizPdf>(res);
}

export async function deleteQuizPdf(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/quiz/admin/pdfs/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    await handleResponse<void>(res);
}
