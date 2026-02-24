import axios from 'axios';
import { CallStatus } from '@/types/chat';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

export async function updateContactCallStatus(
  contactId: string,
  callStatus: CallStatus,
  notes?: string,
  outcome?: string,
  durationSec?: number,
) {
  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }

  const response = await axios.patch(
    `${apiBaseUrl}/contact/${contactId}/call-status`,
    {
      call_status:  callStatus,
      call_notes:   notes,
      outcome:      outcome,
      duration_sec: durationSec,
    },
    {
      withCredentials: true,
    },
  );

  return response.data;
}
