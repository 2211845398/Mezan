import { apiClient } from '@/api/client';

import type {
  NotificationDelivery,
  NotificationDeliveryListResponse,
  NotificationMarkReadResponse,
  NotificationUnreadCountResponse,
} from './types';

export async function listMyNotifications(params?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationDeliveryListResponse> {
  const { data } = await apiClient.get<NotificationDeliveryListResponse>(
    '/notifications/deliveries/me',
    {
      params: {
        limit: params?.limit ?? 20,
        unread_only: params?.unreadOnly ?? false,
      },
    },
  );
  return data;
}

export async function getMyUnreadNotificationCount(): Promise<NotificationUnreadCountResponse> {
  const { data } = await apiClient.get<NotificationUnreadCountResponse>(
    '/notifications/deliveries/me/unread-count',
  );
  return data;
}

export async function markNotificationRead(deliveryId: number): Promise<NotificationDelivery> {
  const { data } = await apiClient.patch<NotificationDelivery>(
    `/notifications/deliveries/${deliveryId}/read`,
  );
  return data;
}

export async function markAllNotificationsRead(): Promise<NotificationMarkReadResponse> {
  const { data } = await apiClient.post<NotificationMarkReadResponse>(
    '/notifications/deliveries/me/read-all',
  );
  return data;
}

export async function clearReadNotifications(): Promise<void> {
  await apiClient.delete('/notifications/deliveries/me/read');
}
