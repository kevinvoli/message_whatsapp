import axios from 'axios';
import { FollowUp, FollowUpStatus } from '@/types/chat';

const base = process.env.NEXT_PUBLIC_API_URL;

function headers() {
  return { withCredentials: true };
}

export async function getMyFollowUps(status?: FollowUpStatus): Promise<{ data: FollowUp[]; total: number }> {
  const params = status ? `?status=${status}` : '';
  const r = await axios.get(`${base}/follow-ups/mine${params}`, headers());
  return r.data;
}

export async function getDueToday(): Promise<FollowUp[]> {
  const r = await axios.get(`${base}/follow-ups/due-today`, headers());
  return r.data;
}

export async function getFollowUpsByContact(contactId: string): Promise<FollowUp[]> {
  const r = await axios.get(`${base}/follow-ups/by-contact/${contactId}`, headers());
  return r.data;
}

export async function completeFollowUp(
  id: string,
  data: { result?: string; notes?: string },
): Promise<FollowUp> {
  const r = await axios.patch(`${base}/follow-ups/${id}/complete`, data, headers());
  return r.data;
}

export async function cancelFollowUp(id: string, reason?: string): Promise<FollowUp> {
  const r = await axios.patch(`${base}/follow-ups/${id}/cancel`, reason ? { reason } : {}, headers());
  return r.data;
}

export interface CreateFollowUpData {
  contact_id?: string;
  conversation_id?: string;
  type: string;
  scheduled_at: string;
  notes?: string;
}

export async function createFollowUp(data: CreateFollowUpData): Promise<FollowUp> {
  const r = await axios.post(`${base}/follow-ups`, data, headers());
  return r.data;
}

export async function rescheduleFollowUp(id: string, scheduled_at: string): Promise<FollowUp> {
  const r = await axios.patch(`${base}/follow-ups/${id}/reschedule`, { scheduled_at }, headers());
  return r.data;
}
