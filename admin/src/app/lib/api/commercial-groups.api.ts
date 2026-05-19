import {
  CommercialGroup,
  CommercialPlanningEntry,
  ScheduleConfigDto,
  GenerateScheduleResult,
  GenerateAllResult,
  GroupScheduleDayItem,
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
  await fetch(`${API_BASE_URL}/commercial-groups/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
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
