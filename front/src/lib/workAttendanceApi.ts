import axios from 'axios';

const base = process.env.NEXT_PUBLIC_API_URL;
const cfg  = { withCredentials: true };

export type AttendanceEventType = 'arrivee' | 'depart_pause' | 'retour_pause' | 'depart_maison';
export type AttendanceStatus    = 'not_clocked_in' | 'working' | 'on_break' | 'done';

export interface AttendanceEvent {
  id:        string;
  eventType: AttendanceEventType;
  eventAt:   string;
  note:      string | null;
}

export interface DailyAttendanceSummary {
  workDate:       string;
  events:         AttendanceEvent[];
  status:         AttendanceStatus;
  minutesWorked:  number;
  minutesOnBreak: number;
}

export interface MonthlyAttendanceEntry {
  workDate:      string;
  status:        AttendanceStatus;
  minutesWorked: number;
  firstEvent:    string | null;
  lastEvent:     string | null;
}

export async function getToday(): Promise<DailyAttendanceSummary> {
  const r = await axios.get(`${base}/work-attendance/today`, cfg);
  return r.data;
}

export async function logEvent(eventType: AttendanceEventType, note?: string): Promise<void> {
  await axios.post(`${base}/work-attendance/event`, { eventType, note }, cfg);
}

export async function getHistory(year: number, month: number): Promise<MonthlyAttendanceEntry[]> {
  const r = await axios.get(`${base}/work-attendance/history`, { ...cfg, params: { year, month } });
  return r.data;
}

export const EVENT_LABELS: Record<AttendanceEventType, string> = {
  arrivee:      'Arrivée',
  depart_pause: 'Départ pause',
  retour_pause: 'Retour pause',
  depart_maison: 'Départ maison',
};

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  not_clocked_in: 'Non pointé',
  working:        'En service',
  on_break:       'En pause',
  done:           'Parti',
};
