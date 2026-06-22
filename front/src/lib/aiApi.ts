import axios from 'axios';
import { ReplySuggestion, RewriteMode, RewriteResult, AiSummaryResult, AiQualifyResult } from '@/types/ai';

export type { ReplySuggestion, RewriteMode, AiSummaryResult, AiQualifyResult };

const base = process.env.NEXT_PUBLIC_API_URL;

function headers() {
  return { withCredentials: true };
}

export async function getAiSuggestions(chatId: string): Promise<ReplySuggestion[]> {
  const r = await axios.get<ReplySuggestion[]>(`${base}/ai/suggestions/${chatId}`, headers());
  return r.data;
}

export async function rewriteText(text: string, mode: RewriteMode): Promise<string> {
  const r = await axios.post<RewriteResult>(`${base}/ai/rewrite`, { text, mode }, headers());
  return r.data.result;
}

export async function getAiSummary(chatId: string): Promise<AiSummaryResult> {
  const r = await axios.get<AiSummaryResult>(`${base}/ai/summary/${chatId}`, headers());
  return r.data;
}

export async function qualifyConversation(chatId: string): Promise<AiQualifyResult> {
  const r = await axios.post<AiQualifyResult>(`${base}/ai/qualify/${chatId}`, {}, headers());
  return r.data;
}

export interface AiDossierResult {
  synthesis: string;
}

export async function getAiDossier(contactId: string): Promise<AiDossierResult> {
  const r = await axios.get<AiDossierResult>(`${base}/ai/dossier/${contactId}`, headers());
  return r.data;
}
