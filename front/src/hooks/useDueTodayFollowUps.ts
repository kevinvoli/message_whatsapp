import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { getDueToday } from '@/lib/followUpApi';
import { FollowUp } from '@/types/chat';

export const dueTodayFollowUpsKey = ['follow-ups', 'due-today'] as const;

export function useDueTodayFollowUps(): UseQueryResult<FollowUp[], Error> {
  return useQuery({
    queryKey: dueTodayFollowUpsKey,
    queryFn: getDueToday,
  });
}
