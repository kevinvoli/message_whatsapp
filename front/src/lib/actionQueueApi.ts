import axios from 'axios';

const base = process.env.NEXT_PUBLIC_API_URL;
const cfg  = { withCredentials: true };

export type ActionTaskSource =
  | 'missed_call'
  | 'unanswered_message'
  | 'prospect_no_order'
  | 'cancelled_order'
  | 'inactive_client'
  | 'order_error';

export type ActionTaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped' | 'rescheduled';

export interface ActionTaskItem {
  taskId:        string | null;
  source:        ActionTaskSource;
  priority:      number;
  entityId:      string;
  contactName:   string | null;
  contactPhone:  string | null;
  status:        ActionTaskStatus;
  dueAt:         string | null;
  attemptCount:  number;
  lastAttemptAt: string | null;
  nextAction:    string | null;
  formData:      Record<string, unknown> | null;
  notes:         string | null;
  context:       Record<string, unknown>;
}

export interface PostCallFormData {
  contactName?:        string;
  ville?:              string;
  commune?:            string;
  quartier?:           string;
  productCategory?:    string;
  otherPhones?:        string[];
  followUpAt?:         string;
  clientNeed?:         string;
  interestScore?:      number;
  isMaleNotInterested?: boolean;
  audioUrl?:           string;
  notes?:              string;
  nextAction?:         string;
  outcome?:            string;
}

export async function getMyActionQueue(): Promise<ActionTaskItem[]> {
  const r = await axios.get(`${base}/action-queue/mine`, cfg);
  return r.data;
}

export async function getMissedCalls(): Promise<ActionTaskItem[]> {
  const r = await axios.get(`${base}/action-queue/missed-calls`, cfg);
  return r.data;
}

export async function getUnanswered(): Promise<ActionTaskItem[]> {
  const r = await axios.get(`${base}/action-queue/unanswered`, cfg);
  return r.data;
}

export async function saveTaskResult(
  entityId: string,
  source: ActionTaskSource,
  data: {
    status:       ActionTaskStatus;
    nextAction?:  string;
    dueAt?:       string;
    formData?:    PostCallFormData;
    notes?:       string;
    audioUrl?:    string;
  },
): Promise<void> {
  await axios.post(`${base}/action-queue/${entityId}/${source}`, data, cfg);
}
