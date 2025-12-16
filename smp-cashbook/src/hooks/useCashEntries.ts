import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '../services/database';
import type { EntryType, EntryFormData } from '../types';

// Query Keys
export const queryKeys = {
  entries: (fy?: string, cbType?: string) => ['entries', fy, cbType] as const,
  paginatedEntries: (fy?: string, cbType?: string, limit?: number, offset?: number) =>
    ['entries', 'paginated', fy, cbType, limit, offset] as const,
  recentEntries: (fy?: string, cbType?: string, limit?: number) =>
    ['entries', 'recent', fy, cbType, limit] as const,
  dashboardSummary: (fy?: string, cbType?: string) =>
    ['dashboard', 'summary', fy, cbType] as const,
  recentDate: () => ['entries', 'recent-date'] as const,
};

// ===== QUERIES =====

/**
 * Get dashboard summary with caching
 */
export function useDashboardSummary(financialYear?: string, cbType?: 'aided' | 'unaided' | 'both') {
  return useQuery({
    queryKey: queryKeys.dashboardSummary(financialYear, cbType),
    queryFn: () => db.getDashboardSummary(financialYear, cbType),
    staleTime: 1000 * 30, // Consider fresh for 30 seconds
  });
}

/**
 * Get all entries (for backwards compatibility, but prefer paginated/recent versions)
 */
export function useAllEntries(financialYear?: string, cbType?: 'aided' | 'unaided' | 'both') {
  return useQuery({
    queryKey: queryKeys.entries(financialYear, cbType),
    queryFn: () => db.getAllEntries(financialYear, cbType),
    staleTime: 1000 * 60, // Consider fresh for 1 minute
  });
}

/**
 * Get paginated entries (optimized for large datasets)
 */
export function usePaginatedEntries(
  financialYear?: string,
  cbType?: 'aided' | 'unaided' | 'both',
  limit?: number,
  offset?: number
) {
  return useQuery({
    queryKey: queryKeys.paginatedEntries(financialYear, cbType, limit, offset),
    queryFn: () => db.getPaginatedEntries(financialYear, cbType, limit, offset),
    staleTime: 1000 * 60, // Consider fresh for 1 minute
    enabled: limit !== undefined && offset !== undefined, // Only run if pagination params provided
  });
}

/**
 * Get recent entries (optimized for Entry page)
 */
export function useRecentEntries(
  financialYear?: string,
  cbType?: 'aided' | 'unaided' | 'both',
  limit: number = 5
) {
  return useQuery({
    queryKey: queryKeys.recentEntries(financialYear, cbType, limit),
    queryFn: () => db.getRecentEntries(financialYear, cbType, limit),
    staleTime: 1000 * 30, // Consider fresh for 30 seconds
  });
}

/**
 * Get most recent entry date
 */
export function useRecentDate() {
  return useQuery({
    queryKey: queryKeys.recentDate(),
    queryFn: () => db.getMostRecentDate(),
    staleTime: 1000 * 60, // Consider fresh for 1 minute
  });
}

// ===== MUTATIONS =====

/**
 * Create entry mutation with cache invalidation
 */
export function useCreateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, formData }: { type: EntryType; formData: EntryFormData }) =>
      db.createEntry(type, formData),

    onSuccess: () => {
      // Invalidate and refetch all related queries
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },

    onError: (error) => {
      console.error('Failed to create entry:', error);
    },
  });
}

/**
 * Update entry mutation with cache invalidation
 */
export function useUpdateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: EntryFormData }) =>
      db.updateEntry(id, formData),

    onSuccess: () => {
      // Invalidate and refetch all related queries
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },

    onError: (_error) => {
      console.error('Failed to update entry:', _error);
    },
  });
}

/**
 * Delete entry mutation with cache invalidation
 */
export function useDeleteEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => db.deleteEntry(id),

    onSuccess: () => {
      // Invalidate and refetch all related queries
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },

    onError: (_error) => {
      console.error('Failed to delete entry:', _error);
    },
  });
}

/**
 * Delete all entries mutation
 */
export function useDeleteAllEntries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cbType, financialYear }: { cbType?: 'aided' | 'unaided' | 'both'; financialYear?: string }) =>
      db.deleteAllEntries(cbType, financialYear),

    onSuccess: () => {
      // Invalidate all queries since we deleted entries
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * Bulk import entries mutation
 */
export function useBulkImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entries: Array<{
      date: string;
      type: EntryType;
      cheque_no: string;
      amount: number;
      head_of_accounts: string;
      notes: string;
      cb_type?: 'aided' | 'unaided';
    }>) => db.bulkImport(entries),

    onSuccess: () => {
      // Invalidate all queries since we added many entries
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
