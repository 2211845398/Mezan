import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './api';

export const attendanceDeviceKeys = {
  root: ['attendance-devices'] as const,
  list: (branchId?: number) => [...attendanceDeviceKeys.root, 'list', branchId ?? 'all'] as const,
  candidates: (branchId: number, excludeDeviceId?: number) =>
    [...attendanceDeviceKeys.root, 'candidates', branchId, excludeDeviceId ?? 'none'] as const,
  myQr: () => [...attendanceDeviceKeys.root, 'my-qr'] as const,
};

export function attendanceDevicesQueryOptions(branchId?: number) {
  return queryOptions({
    queryKey: attendanceDeviceKeys.list(branchId),
    queryFn: () => api.listAttendanceDevices(branchId),
  });
}

export function useAttendanceDevices(branchId?: number) {
  return useQuery(attendanceDevicesQueryOptions(branchId));
}

export function useKioskUserCandidates(branchId: number | null, excludeDeviceId?: number) {
  return useQuery({
    queryKey: attendanceDeviceKeys.candidates(branchId ?? 0, excludeDeviceId),
    queryFn: () => api.listKioskUserCandidates(branchId!, excludeDeviceId),
    enabled: branchId != null && branchId > 0,
  });
}

/**
 * Polls the single-use kiosk QR endpoint, rotating the token each time it
 * refetches. The refetch cadence tracks the server-provided TTL
 * (`expires_in_seconds`) so the on-screen code never sits expired waiting
 * for a fixed timer, falling back to a conservative default before the
 * first response arrives.
 */
export function useMyAttendanceKioskQr(enabled: boolean) {
  return useQuery({
    queryKey: attendanceDeviceKeys.myQr(),
    queryFn: () => api.getAttendanceKioskQr(),
    enabled,
    refetchInterval: (query) => {
      const ttlSeconds = query.state.data?.expires_in_seconds;
      const safeSeconds = ttlSeconds && ttlSeconds > 5 ? ttlSeconds - 5 : 60;
      return safeSeconds * 1000;
    },
  });
}

export function useCreateAttendanceDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createAttendanceDevice,
    onSuccess: () => void qc.invalidateQueries({ queryKey: attendanceDeviceKeys.root }),
  });
}

export function useUpdateAttendanceDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: api.AttendanceDeviceUpdate }) =>
      api.updateAttendanceDevice(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: attendanceDeviceKeys.root }),
  });
}
