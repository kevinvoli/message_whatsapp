import axios from 'axios';
import { FollowUp, FollowUpStatus, FollowUpType } from '@/types/chat';

const base = process.env.NEXT_PUBLIC_API_URL;

function headers() {
  return { withCredentials: true };
}

export async function createFollowUp(data: {
  contact_id?: string;
  conversation_id?: string;
  type: FollowUpType;
  scheduled_at: string;
  notes?: string;
}): Promise<FollowUp> {
  const r = await axios.post(`${base}/follow-ups`, data, headers());
  return r.data;
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

export async function cancelFollowUp(id: string): Promise<FollowUp> {
  const r = await axios.patch(`${base}/follow-ups/${id}/cancel`, {}, headers());
  return r.data;
}

export async function setConversationOutcome(
  conversationId: string,
  result: string,
): Promise<void> {
  await axios.patch(`${base}/chats/${conversationId}/outcome`, { result }, headers());
}
