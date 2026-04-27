import { API_BASE_URL, handleResponse } from './_http';

export type AttendanceEventType = 'arrivee' | 'depart_pause' | 'retour_pause' | 'depart_maison';
export type AttendanceStatus    = 'not_clocked_in' | 'working' | 'on_break' | 'done';

export interface TodayAttendanceSummary {
  commercialId:  string;
  status:        AttendanceStatus;
  minutesWorked: number;
}

export interface MonthlyAttendanceEntry {
  workDate:      string;
  status:        AttendanceStatus;
  minutesWorked: number;
  firstEvent:    string | null;
  lastEvent:     string | null;
}

export async function getTodayForAll(): Promise<TodayAttendanceSummary[]> {
  return handleResponse<TodayAttendanceSummary[]>(
    await fetch(`${API_BASE_URL}/work-attendance/admin/today`, { credentials: 'include' }),
  );
}

export async function getHistoryForCommercial(
  commercialId: string,
  year: number,
  month: number,
): Promise<MonthlyAttendanceEntry[]> {
  return handleResponse<MonthlyAttendanceEntry[]>(
    await fetch(
      `${API_BASE_URL}/work-attendance/admin/${commercialId}/history?year=${year}&month=${month}`,
      { credentials: 'include' },
    ),
  );
}

export async function logEventForCommercial(
  commercialId: string,
  eventType: AttendanceEventType,
  note?: string,
  eventAt?: string,
): Promise<void> {
  await fetch(`${API_BASE_URL}/work-attendance/admin/${commercialId}/event`, {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ eventType, note, eventAt }),
  });
}
