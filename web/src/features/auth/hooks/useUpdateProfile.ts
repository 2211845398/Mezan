import { createOptimisticMutation } from '@/api/mutations';
import type { ProfileUpdate, UserRead } from '@/api/types';

import { updateMe } from '../api';
import { authKeys } from '../queries';

function profilePatchForCache(body: ProfileUpdate): Partial<UserRead> {
  const { current_password, new_password, ...rest } = body;
  void current_password;
  void new_password;
  return rest as Partial<UserRead>;
}

export const useUpdateProfile = createOptimisticMutation<
  UserRead,
  ProfileUpdate,
  UserRead | undefined
>(
  {
    mutationFn: (body, idempotencyKey) => updateMe(body, idempotencyKey),
    getSnapshot: (qc) => qc.getQueryData<UserRead>(authKeys.me()),
    applyOptimistic: (qc, body) => {
      const prev = qc.getQueryData<UserRead>(authKeys.me());
      if (!prev) return;
      qc.setQueryData(authKeys.me(), { ...prev, ...profilePatchForCache(body) });
    },
    rollback: (qc, snapshot) => {
      if (snapshot !== undefined) {
        qc.setQueryData(authKeys.me(), snapshot);
      }
    },
    invalidate: (qc) => {
      void qc.invalidateQueries({ queryKey: authKeys.me() });
    },
  },
);
