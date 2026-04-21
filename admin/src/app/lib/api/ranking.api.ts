import { API_BASE_URL } from './_http';

export interface CommercialRankingEntry {
  rank: number;
  commercial_id: string;
  commercial_name: string;
  commercial_email: string;
  conversations: number;
  messages_sent: number;
  calls: number;
  follow_ups: number;
  orders: number;
  score: number;
}

export type RankingPeriod = 'today' | 'week' | 'month';

export async function getRanking(period: RankingPeriod = 'month'): Promise<CommercialRankingEntry[]> {
  const res = await fetch(`${API_BASE_URL}/targets/ranking?period=${period}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Erreur chargement ranking');
  return res.json() as Promise<CommercialRankingEntry[]>;
}
