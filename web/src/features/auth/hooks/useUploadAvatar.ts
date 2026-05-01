import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { UserRead } from '@/api/types';

import { uploadMyAvatar } from '../api';
import { authKeys } from '../queries';
import type { AuthUser } from '../stores/authStore';
import { useAuthStore } from '../stores/authStore';

export function useUploadAvatar() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (file: File) => uploadMyAvatar(file),
    onSuccess: (next: UserRead) => {
      qc.setQueryData(authKeys.me(), next);
      setUser(next as AuthUser);
    },
  });
}
