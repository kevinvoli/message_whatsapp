import {
  CommercialGroup,
  CommercialPlanningEntry,
  PlanningAuditEntry,
  AbsenceSummaryItem,
  ScheduleConfigDto,
  GenerateScheduleResult,
  GenerateAllResult,
  GroupScheduleDayItem,
  CalendarHealthItem,
  TimeSlot,
  CommercialSubGroup,
  SubGroupBreakSchedule,
  BreakExclusion,
  BreakSupervisionRow,
  DisconnectAlert,
  PresenceHistoryResponse,
  SessionsResponse,
  DisconnectHistoryResponse,
} from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getGroups(): Promise<CommercialGroup[]> {
  return handleResponse<CommercialGroup[]>(
    await fetch(`${API_BASE_URL}/commercial-groups`, { credentials: 'include' }),
  );
}

export async function getGroup(id: string): Promise<CommercialGroup> {
  return handleResponse<CommercialGroup>(
    await fetch(`${API_BASE_URL}/commercial-groups/${id}`, { credentials: 'include' }),
  );
}

export async function createGroup(payload: { name: string; description?: string }): Promise<CommercialGroup> {
  return handleResponse<CommercialGroup>(
    await fetch(`${API_BASE_URL}/commercial-groups`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateGroup(
  id: string,
  payload: { name?: string; description?: string; isActive?: boolean },
): Promise<CommercialGroup> {
  return handleResponse<CommercialGroup>(
    await fetch(`${API_BASE_URL}/commercial-groups/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteGroup(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/commercial-groups/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json() as { message?: string };
      message = body.message ?? message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
}

export async function addMember(groupId: string, commercialId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/commercial-groups/${groupId}/members`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commercialId }),
  });
}

export async function removeMember(groupId: string, commercialId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/commercial-groups/${groupId}/members/${commercialId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export async function setGroupScheduleConfig(id: string, dto: ScheduleConfigDto): Promise<CommercialGroup> {
  return handleResponse<CommercialGroup>(
    await fetch(`${API_BASE_URL}/commercial-groups/${id}/schedule-config`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),
  );
}

export async function generateGroupSchedule(id: string, months?: number): Promise<GenerateScheduleResult> {
  return handleResponse<GenerateScheduleResult>(
    await fetch(`${API_BASE_URL}/commercial-groups/${id}/schedule/generate`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ months }),
    }),
  );
}

export async function generateAllGroupSchedules(): Promise<GenerateAllResult[]> {
  return handleResponse<GenerateAllResult[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/schedule/generate-all`, {
      method: 'POST',
      credentials: 'include',
    }),
  );
}

export async function getGroupSchedule(
  id: string,
  from?: string,
  to?: string,
): Promise<GroupScheduleDayItem[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString() ? `?${params.toString()}` : '';
  return handleResponse<GroupScheduleDayItem[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/${id}/schedule${query}`, {
      credentials: 'include',
    }),
  );
}

// ─── Planning — Gestion des imprévus ────────────────────────────────────────

export async function getPlanningByDate(date: string): Promise<CommercialPlanningEntry[]> {
  return handleResponse<CommercialPlanningEntry[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/planning?date=${encodeURIComponent(date)}`, {
      credentials: 'include',
    }),
  );
}

export async function createAbsence(data: {
  commercialId: string;
  date: string;
  reason?: string;
}): Promise<CommercialPlanningEntry> {
  return handleResponse<CommercialPlanningEntry>(
    await fetch(`${API_BASE_URL}/commercial-groups/planning`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, type: 'absence' }),
    }),
  );
}

export async function createExceptional(data: {
  commercialId: string;
  date: string;
  reason?: string;
}): Promise<CommercialPlanningEntry> {
  return handleResponse<CommercialPlanningEntry>(
    await fetch(`${API_BASE_URL}/commercial-groups/planning`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, type: 'exceptional' }),
    }),
  );
}

export async function createReplacement(data: {
  replacedId: string;
  replacerId: string;
  date: string;
  reason?: string;
}): Promise<{ absence: CommercialPlanningEntry; exceptional: CommercialPlanningEntry }> {
  return handleResponse<{ absence: CommercialPlanningEntry; exceptional: CommercialPlanningEntry }>(
    await fetch(`${API_BASE_URL}/commercial-groups/planning/replacement`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  );
}

export async function createAbsenceRange(data: {
  commercialId: string;
  dateStart: string;
  dateEnd: string;
  reason?: string;
  timeSlot?: TimeSlot;
}): Promise<{ created: number; skipped: number }> {
  return handleResponse<{ created: number; skipped: number }>(
    await fetch(`${API_BASE_URL}/commercial-groups/planning/absence-range`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, type: 'absence' }),
    }),
  );
}

export async function getPlanningMonth(
  year: number,
  month: number,
): Promise<CommercialPlanningEntry[]> {
  return handleResponse<CommercialPlanningEntry[]>(
    await fetch(
      `${API_BASE_URL}/commercial-groups/planning/month/${year}/${month}`,
      { credentials: 'include' },
    ),
  );
}

export async function getAbsenceSummary(year: number, month: number): Promise<AbsenceSummaryItem[]> {
  return handleResponse<AbsenceSummaryItem[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/planning/summary/${year}/${month}`, {
      credentials: 'include',
    }),
  );
}

export async function getPlanningAudit(params?: {
  commercialId?: string;
  from?: string;
  to?: string;
}): Promise<PlanningAuditEntry[]> {
  const q = new URLSearchParams();
  if (params?.commercialId) q.set('commercialId', params.commercialId);
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  const qs = q.toString() ? `?${q.toString()}` : '';
  return handleResponse<PlanningAuditEntry[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/planning/audit${qs}`, { credentials: 'include' }),
  );
}

export async function getCalendarHealth(): Promise<CalendarHealthItem[]> {
  return handleResponse<CalendarHealthItem[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/planning/calendar-health`, {
      credentials: 'include',
    }),
  );
}

export async function deletePlanning(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/commercial-groups/planning/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok && response.status !== 204) {
    let errorMessage: string;
    try {
      const errorData = await response.json() as { message?: string };
      errorMessage = errorData.message ?? response.statusText;
    } catch {
      errorMessage = response.statusText;
    }
    throw new Error(errorMessage);
  }
}

// ─── Sous-groupes ────────────────────────────────────────────────────────────

export async function getSubGroup(subGroupId: string): Promise<CommercialSubGroup> {
  return handleResponse<CommercialSubGroup>(
    await fetch(`${API_BASE_URL}/commercial-groups/sub-groups/${subGroupId}`, {
      credentials: 'include',
    }),
  );
}

export async function getSubGroups(groupId: string): Promise<CommercialSubGroup[]> {
  return handleResponse<CommercialSubGroup[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/${groupId}/sub-groups`, {
      credentials: 'include',
    }),
  );
}

export async function createSubGroup(dto: {
  parentGroupId: string;
  name: string;
  description?: string;
}): Promise<CommercialSubGroup> {
  return handleResponse<CommercialSubGroup>(
    await fetch(`${API_BASE_URL}/commercial-groups/sub-groups`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),
  );
}

export async function updateSubGroup(
  subId: string,
  dto: { name?: string; description?: string; isActive?: boolean },
): Promise<CommercialSubGroup> {
  return handleResponse<CommercialSubGroup>(
    await fetch(`${API_BASE_URL}/commercial-groups/sub-groups/${subId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),
  );
}

export async function deleteSubGroup(subId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/commercial-groups/sub-groups/${subId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export async function addSubGroupMember(subId: string, commercialId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/commercial-groups/sub-groups/${subId}/members`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commercialId }),
  });
}

export async function removeSubGroupMember(subId: string, commercialId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/commercial-groups/sub-groups/${subId}/members/${commercialId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

// ─── Plages de pauses ────────────────────────────────────────────────────────

export async function getBreakSchedules(subId: string): Promise<SubGroupBreakSchedule[]> {
  return handleResponse<SubGroupBreakSchedule[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/sub-groups/${subId}/break-schedule`, {
      credentials: 'include',
    }),
  );
}

export async function upsertBreakSchedule(
  subId: string,
  dto: {
    startTime: string;
    endTime: string;
    reminderIntervalMinutes: number;
    popupMessageText?: string | null;
    popupAudioAssetId?: string | null;
    maxDurationMinutes: number;
  },
): Promise<SubGroupBreakSchedule> {
  return handleResponse<SubGroupBreakSchedule>(
    await fetch(`${API_BASE_URL}/commercial-groups/sub-groups/${subId}/break-schedule`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),
  );
}

export async function deleteBreakSchedule(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/commercial-groups/break-schedule/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

// ─── Exclusions ───────────────────────────────────────────────────────────────

export async function getExclusions(subId: string): Promise<BreakExclusion[]> {
  return handleResponse<BreakExclusion[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/sub-groups/${subId}/exclusions`, {
      credentials: 'include',
    }),
  );
}

export async function createExclusion(dto: {
  subGroupId: string;
  scope: 'poste' | 'commercial';
  posteId?: string | null;
  commercialId?: string | null;
}): Promise<BreakExclusion> {
  return handleResponse<BreakExclusion>(
    await fetch(`${API_BASE_URL}/commercial-groups/sub-groups/${dto.subGroupId}/exclusions`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),
  );
}

export async function deleteExclusion(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/commercial-groups/exclusions/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

// ─── Supervision pauses ───────────────────────────────────────────────────────

export async function getBreakSupervision(from?: string, to?: string): Promise<BreakSupervisionRow[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString() ? `?${params.toString()}` : '';
  return handleResponse<BreakSupervisionRow[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/break-supervision${query}`, {
      credentials: 'include',
    }),
  );
}

export async function getDisconnectAlerts(): Promise<DisconnectAlert[]> {
  return handleResponse<DisconnectAlert[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/disconnect-alerts`, {
      credentials: 'include',
    }),
  );
}

export async function getPresenceHistory(date?: string): Promise<PresenceHistoryResponse> {
  const params = date ? `?date=${encodeURIComponent(date)}` : '';
  return handleResponse<PresenceHistoryResponse>(
    await fetch(`${API_BASE_URL}/commercial-groups/presence-history${params}`, {
      credentials: 'include',
    }),
  );
}

export async function getSessions(params?: {
  date?: string;
  commercialId?: string;
  status?: 'active' | 'closed' | 'all';
  page?: number;
  limit?: number;
}): Promise<SessionsResponse> {
  const q = new URLSearchParams();
  if (params?.date) q.set('date', params.date);
  if (params?.commercialId) q.set('commercialId', params.commercialId);
  if (params?.status) q.set('status', params.status);
  if (params?.page !== undefined) q.set('page', String(params.page));
  if (params?.limit !== undefined) q.set('limit', String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : '';
  return handleResponse<SessionsResponse>(
    await fetch(`${API_BASE_URL}/commercial-groups/sessions${qs}`, { credentials: 'include' }),
  );
}

export async function getDisconnectHistory(params?: {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<DisconnectHistoryResponse> {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.page !== undefined) q.set('page', String(params.page));
  if (params?.limit !== undefined) q.set('limit', String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : '';
  return handleResponse<DisconnectHistoryResponse>(
    await fetch(`${API_BASE_URL}/commercial-groups/disconnect-history${qs}`, { credentials: 'include' }),
  );
}

export async function getDisconnectHistoryByCommercial(
  commercialId: string,
  params?: { page?: number; limit?: number },
): Promise<DisconnectHistoryResponse> {
  const q = new URLSearchParams();
  if (params?.page !== undefined) q.set('page', String(params.page));
  if (params?.limit !== undefined) q.set('limit', String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : '';
  return handleResponse<DisconnectHistoryResponse>(
    await fetch(`${API_BASE_URL}/commercial-groups/disconnect-history/${commercialId}${qs}`, { credentials: 'include' }),
  );
}

export async function patchDisconnectReason(
  logId: string,
  reason: string,
): Promise<{ success: true }> {
  return handleResponse<{ success: true }>(
    await fetch(`${API_BASE_URL}/commercial-groups/disconnect-history/${logId}/reason`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
  );
}
