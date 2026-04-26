import { API_BASE_URL, handleResponse } from './_http';

export interface ValidationCriterion {
  id: string;
  criterion_type: string;
  label: string;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface CallEventEntry {
  id: string;
  external_id: string;
  commercial_phone: string;
  client_phone: string;
  call_status: string;
  duration_seconds: number | null;
  recording_url: string | null;
  order_id: string | null;
  event_at: string;
  chat_id: string | null;
  commercial_id: string | null;
  created_at: string;
}

export interface ConversationValidationState {
  criteria: Array<{
    type: string;
    label: string;
    required: boolean;
    validated: boolean;
    validatedAt: string | null;
  }>;
  allRequiredMet: boolean;
}

export async function getValidationCriteria(): Promise<ValidationCriterion[]> {
  return handleResponse<ValidationCriterion[]>(
    await fetch(`${API_BASE_URL}/window/criteria`, { credentials: 'include' }),
  );
}

export async function getCallEvents(limit = 50, offset = 0): Promise<{ data: CallEventEntry[]; total: number }> {
  return handleResponse<{ data: CallEventEntry[]; total: number }>(
    await fetch(`${API_BASE_URL}/window/call-events?limit=${limit}&offset=${offset}`, { credentials: 'include' }),
  );
}

export async function getConversationValidationState(chatId: string): Promise<ConversationValidationState> {
  return handleResponse<ConversationValidationState>(
    await fetch(`${API_BASE_URL}/window/validation-state?chatId=${encodeURIComponent(chatId)}`, { credentials: 'include' }),
  );
}

export interface WindowDebugConv {
  chat_id: string;
  window_slot: number | null;
  window_status: string;
  chat_status: string;
  is_locked: boolean;
  submitted: boolean;
}

export interface WindowDebugState {
  posteId: string;
  modeEnabled: boolean;
  quotaActive: number;
  quotaTotal: number;
  rotationLocked: boolean;
  rotationWouldTrigger: boolean;
  submittedCount: number;
  requiredCount: number;
  activeCount: number;
  lockedCount: number;
  conversations: WindowDebugConv[];
}

export async function getWindowDebugState(posteId: string): Promise<WindowDebugState> {
  return handleResponse<WindowDebugState>(
    await fetch(`${API_BASE_URL}/window/debug/${encodeURIComponent(posteId)}`, { credentials: 'include' }),
  );
}

export async function triggerRotationCheck(posteId: string): Promise<{ ok: boolean }> {
  return handleResponse(
    await fetch(`${API_BASE_URL}/window/rotate-check/${encodeURIComponent(posteId)}`, {
      method: 'POST',
      credentials: 'include',
    }),
  );
}

export async function forceWindowRotation(posteId: string): Promise<{ ok: boolean; releasedChatIds: string[]; promotedChatIds: string[] }> {
  return handleResponse(
    await fetch(`${API_BASE_URL}/window/rotate/${encodeURIComponent(posteId)}`, {
      method: 'POST',
      credentials: 'include',
    }),
  );
}

export async function rebuildWindow(posteId: string): Promise<{ ok: boolean; blockProgress: { validated: number; total: number } }> {
  return handleResponse(
    await fetch(`${API_BASE_URL}/window/rebuild/${encodeURIComponent(posteId)}`, {
      method: 'POST',
      credentials: 'include',
    }),
  );
}

export async function forceValidateConversation(chatId: string, posteId?: string): Promise<{ ok: boolean; allRequiredMet: boolean }> {
  return handleResponse(
    await fetch(`${API_BASE_URL}/window/force-validate/${encodeURIComponent(chatId)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posteId }),
    }),
  );
}

export async function updateValidationCriterion(
  id: string,
  updates: { is_required?: boolean; is_active?: boolean; label?: string; sort_order?: number },
): Promise<ValidationCriterion> {
  return handleResponse<ValidationCriterion>(
    await fetch(`${API_BASE_URL}/window/criteria/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }),
  );
}
