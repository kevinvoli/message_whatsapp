import { API_BASE_URL, handleResponse } from './_http';

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface BreakSlot {
  start: string;
  end:   string;
}

export interface WorkSchedule {
  id:           string;
  commercialId: string | null;
  groupId:      string | null;
  groupName:    string | null;
  dayOfWeek:    DayOfWeek;
  startTime:    string;
  endTime:      string;
  breakSlots:   BreakSlot[] | null;
  isActive:     boolean;
  createdAt:    string;
  updatedAt:    string;
}

export interface CreateSchedulePayload {
  commercialId?: string | null;
  groupId?:      string | null;
  groupName?:    string | null;
  dayOfWeek:     DayOfWeek;
  startTime:     string;
  endTime:       string;
  breakSlots?:   BreakSlot[] | null;
  isActive?:     boolean;
}

export async function getAllSchedules(): Promise<WorkSchedule[]> {
  return handleResponse<WorkSchedule[]>(
    await fetch(`${API_BASE_URL}/work-schedule`, { credentials: 'include' }),
  );
}

export async function getSchedulesByCommercial(commercialId: string): Promise<WorkSchedule[]> {
  return handleResponse<WorkSchedule[]>(
    await fetch(`${API_BASE_URL}/work-schedule/commercial/${commercialId}`, { credentials: 'include' }),
  );
}

export async function getSchedulesByGroup(groupId: string): Promise<WorkSchedule[]> {
  return handleResponse<WorkSchedule[]>(
    await fetch(`${API_BASE_URL}/work-schedule/group/${groupId}`, { credentials: 'include' }),
  );
}

export async function createSchedule(payload: CreateSchedulePayload): Promise<WorkSchedule> {
  return handleResponse<WorkSchedule>(
    await fetch(`${API_BASE_URL}/work-schedule`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateSchedule(id: string, payload: Partial<CreateSchedulePayload>): Promise<WorkSchedule> {
  return handleResponse<WorkSchedule>(
    await fetch(`${API_BASE_URL}/work-schedule/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteSchedule(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/work-schedule/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}
