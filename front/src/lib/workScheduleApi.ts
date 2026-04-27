import axios from 'axios';

const base = process.env.NEXT_PUBLIC_API_URL;
const cfg  = { withCredentials: true };

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface BreakSlot {
  start: string;
  end:   string;
}

export interface WorkScheduleDay {
  dayOfWeek:  DayOfWeek;
  startTime:  string;
  endTime:    string;
  breakSlots: BreakSlot[];
  isActive:   boolean;
  source:     'individual' | 'group';
  scheduleId: string;
}

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday:    'Lundi',
  tuesday:   'Mardi',
  wednesday: 'Mercredi',
  thursday:  'Jeudi',
  friday:    'Vendredi',
  saturday:  'Samedi',
  sunday:    'Dimanche',
};

export async function getMySchedule(): Promise<WorkScheduleDay[]> {
  const r = await axios.get(`${base}/work-schedule/mine`, cfg);
  return r.data;
}

export async function getTodaySchedule(): Promise<WorkScheduleDay | null> {
  const r = await axios.get(`${base}/work-schedule/today`, cfg);
  return r.data ?? null;
}
