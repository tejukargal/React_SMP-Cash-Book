import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '../services/database';
import type { EntryType, EntryFormData, CashEntry } from '../types';

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
 * Create entry mutation with optimistic updates for instant feedback
 */
export function useCreateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, formData }: { type: EntryType; formData: EntryFormData }) =>
      db.createEntry(type, formData),

    onMutate: async ({ type, formData }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['entries'] });
      await queryClient.cancelQueries({ queryKey: ['dashboard'] });

      // Snapshot the previous values
      const previousEntries = queryClient.getQueriesData({ queryKey: ['entries'] });
      const previousDashboard = queryClient.getQueriesData({ queryKey: ['dashboard'] });

      // Create a temporary entry with optimistic data
      const tempEntry = {
        id: `temp-${Date.now()}`,
        date: formData.date,
        type,
        cheque_no: formData.cheque_no || null,
        amount: parseFloat(formData.amount),
        head_of_accounts: formData.head_of_accounts,
        notes: formData.notes || null,
        cb_type: formData.cb_type,
        financial_year: '', // Will be calculated by backend
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Optimistically update all entries caches
      queryClient.setQueriesData({ queryKey: ['entries'] }, (old: any) => {
        if (Array.isArray(old)) {
          return [...old, tempEntry];
        }
        if (old?.entries && Array.isArray(old.entries)) {
          return { ...old, entries: [...old.entries, tempEntry] };
        }
        return old;
      });

      // Return context with previous data for rollback
      return { previousEntries, previousDashboard, tempId: tempEntry.id };
    },

    onSuccess: (newEntry, _variables, context) => {
      // Replace temporary entry with actual server response
      if (newEntry && context?.tempId) {
        queryClient.setQueriesData({ queryKey: ['entries'] }, (old: any) => {
          if (Array.isArray(old)) {
            return old.map((entry: CashEntry) =>
              entry.id === context.tempId ? newEntry : entry
            );
          }
          if (old?.entries && Array.isArray(old.entries)) {
            return {
              ...old,
              entries: old.entries.map((entry: CashEntry) =>
                entry.id === context.tempId ? newEntry : entry
              ),
            };
          }
          return old;
        });
      }

      // Invalidate dashboard for summary updates
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },

    onError: (_error, _variables, context) => {
      // Rollback to previous state on error
      if (context?.previousEntries) {
        context.previousEntries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousDashboard) {
        context.previousDashboard.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      console.error('Failed to create entry:', _error);
      alert('Failed to create entry. Please try again.');
    },
  });
}

/**
 * Update entry mutation with optimistic updates for instant feedback
 */
export function useUpdateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: EntryFormData }) =>
      db.updateEntry(id, formData),

    onMutate: async ({ id, formData }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['entries'] });
      await queryClient.cancelQueries({ queryKey: ['dashboard'] });

      // Snapshot the previous values
      const previousEntries = queryClient.getQueriesData({ queryKey: ['entries'] });
      const previousDashboard = queryClient.getQueriesData({ queryKey: ['dashboard'] });

      // Optimistically update all entries caches
      queryClient.setQueriesData({ queryKey: ['entries'] }, (old: any) => {
        if (Array.isArray(old)) {
          return old.map((entry: CashEntry) =>
            entry.id === id
              ? {
                  ...entry,
                  date: formData.date,
                  cheque_no: formData.cheque_no || null,
                  amount: parseFloat(formData.amount),
                  head_of_accounts: formData.head_of_accounts,
                  notes: formData.notes || null,
                  cb_type: formData.cb_type,
                  updated_at: new Date().toISOString(),
                }
              : entry
          );
        }
        if (old?.entries && Array.isArray(old.entries)) {
          return {
            ...old,
            entries: old.entries.map((entry: CashEntry) =>
              entry.id === id
                ? {
                    ...entry,
                    date: formData.date,
                    cheque_no: formData.cheque_no || null,
                    amount: parseFloat(formData.amount),
                    head_of_accounts: formData.head_of_accounts,
                    notes: formData.notes || null,
                    cb_type: formData.cb_type,
                    updated_at: new Date().toISOString(),
                  }
                : entry
            ),
          };
        }
        return old;
      });

      return { previousEntries, previousDashboard };
    },

    onSuccess: (updatedEntry, { id }) => {
      // Update cache with actual server response (no refetch needed)
      if (updatedEntry) {
        queryClient.setQueriesData({ queryKey: ['entries'] }, (old: any) => {
          if (Array.isArray(old)) {
            return old.map((entry: CashEntry) =>
              entry.id === id ? updatedEntry : entry
            );
          }
          if (old?.entries && Array.isArray(old.entries)) {
            return {
              ...old,
              entries: old.entries.map((entry: CashEntry) =>
                entry.id === id ? updatedEntry : entry
              ),
            };
          }
          return old;
        });
      }

      // Invalidate dashboard for summary updates
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },

    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        context.previousEntries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousDashboard) {
        context.previousDashboard.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      console.error('Failed to update entry:', _error);
      alert('Failed to update entry. Please try again.');
    },
  });
}

/**
 * Delete entry mutation with optimistic updates for instant feedback
 */
export function useDeleteEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => db.deleteEntry(id),

    onMutate: async (id: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['entries'] });
      await queryClient.cancelQueries({ queryKey: ['dashboard'] });

      // Snapshot the previous values
      const previousEntries = queryClient.getQueriesData({ queryKey: ['entries'] });
      const previousDashboard = queryClient.getQueriesData({ queryKey: ['dashboard'] });

      // Optimistically remove entry from all caches
      queryClient.setQueriesData({ queryKey: ['entries'] }, (old: any) => {
        if (Array.isArray(old)) {
          return old.filter((entry: CashEntry) => entry.id !== id);
        }
        if (old?.entries && Array.isArray(old.entries)) {
          return {
            ...old,
            entries: old.entries.filter((entry: CashEntry) => entry.id !== id),
          };
        }
        return old;
      });

      return { previousEntries, previousDashboard };
    },

    onSuccess: () => {
      // Entry already removed optimistically, just invalidate dashboard
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },

    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        context.previousEntries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousDashboard) {
        context.previousDashboard.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      console.error('Failed to delete entry:', _error);
      alert('Failed to delete entry. Please try again.');
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
