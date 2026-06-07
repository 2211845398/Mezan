import { apiClient } from '@/api/client';

export type CorrespondenceThread = {
  id: number;
  subject: string;
  request_type: string;
  initiator_user_id: number;
  target_role_code: string;
  target_user_id: number | null;
  branch_id: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CorrespondenceMessage = {
  id: number;
  thread_id: number;
  sender_user_id: number;
  body: string;
  is_internal_note: boolean;
  created_at: string;
};

export type CorrespondenceThreadDetail = CorrespondenceThread & {
  messages: CorrespondenceMessage[];
};

export async function listCorrespondenceInbox(): Promise<CorrespondenceThread[]> {
  const { data } = await apiClient.get<CorrespondenceThread[]>('/correspondence/threads/inbox');
  return data;
}

export async function listMyCorrespondence(): Promise<CorrespondenceThread[]> {
  const { data } = await apiClient.get<CorrespondenceThread[]>('/correspondence/threads/me');
  return data;
}

export async function getCorrespondenceThread(id: number): Promise<CorrespondenceThreadDetail> {
  const { data } = await apiClient.get<CorrespondenceThreadDetail>(`/correspondence/threads/${id}`);
  return data;
}

export async function createCorrespondenceThread(body: {
  subject: string;
  request_type: string;
  target_role_code?: string | null;
  target_user_id?: number | null;
  body: string;
}): Promise<CorrespondenceThread> {
  const { data } = await apiClient.post<CorrespondenceThread>('/correspondence/threads', body);
  return data;
}

export async function postCorrespondenceMessage(
  threadId: number,
  body: { body: string; is_internal_note?: boolean },
): Promise<CorrespondenceMessage> {
  const { data } = await apiClient.post<CorrespondenceMessage>(
    `/correspondence/threads/${threadId}/messages`,
    body,
  );
  return data;
}

export async function patchCorrespondenceStatus(
  threadId: number,
  status: 'open' | 'answered' | 'closed',
): Promise<CorrespondenceThread> {
  const { data } = await apiClient.patch<CorrespondenceThread>(
    `/correspondence/threads/${threadId}/status`,
    { status },
  );
  return data;
}
