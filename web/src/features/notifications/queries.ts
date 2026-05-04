import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notifyApiError } from '@/api/errorMessages';

import {
  clearReadNotifications,
  getMyUnreadNotificationCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './api';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unreadOnly: boolean) => [...notificationKeys.all, 'list', { unreadOnly }] as const,
  unreadCount: () => [...notificationKeys.all, 'unreadCount'] as const,
};

export function useMyNotifications(options?: { unreadOnly?: boolean; enabled?: boolean }) {
  const unreadOnly = options?.unreadOnly ?? false;
  return useQuery({
    queryKey: notificationKeys.list(unreadOnly),
    queryFn: async () => (await listMyNotifications({ unreadOnly })).items,
    enabled: options?.enabled ?? true,
    refetchInterval: 60_000,
  });
}

export function useUnreadNotificationCount(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: async () => (await getMyUnreadNotificationCount()).unread_count,
    enabled: options?.enabled ?? true,
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: (error) => notifyApiError(error),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: (error) => notifyApiError(error),
  });
}

export function useClearReadNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearReadNotifications,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: (error) => notifyApiError(error),
  });
}
