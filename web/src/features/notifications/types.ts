export type NotificationDelivery = {
  id: number;
  schedule_id: number | null;
  user_id: number;
  template_kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: string;
  provider: string;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  read_at: string | null;
};

export type NotificationDeliveryListResponse = {
  items: NotificationDelivery[];
};

export type NotificationUnreadCountResponse = {
  unread_count: number;
};

export type NotificationMarkReadResponse = {
  updated: number;
};
