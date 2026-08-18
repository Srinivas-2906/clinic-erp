import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchToday } from '../lib/api';
import { resolveTenantSlug } from '../lib/tenant';
import { filterTodayByDoctor } from '../lib/todayStats';
import type { TodayStats } from '../types';

function todayKey() {
  return ['today', resolveTenantSlug()] as const;
}

export function useTodayQuery() {
  const tenant = resolveTenantSlug();
  return useQuery({
    queryKey: todayKey(),
    queryFn: fetchToday,
    enabled: !!tenant,
    staleTime: 10_000,
  });
}

export function useTodayData(doctorId?: string | null) {
  const query = useTodayQuery();

  const today = useMemo(
    () => (query.data ? filterTodayByDoctor(query.data, doctorId) : null),
    [query.data, doctorId],
  );

  return {
    today,
    rawToday: (query.data ?? null) as TodayStats | null,
    refetch: query.refetch,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}
