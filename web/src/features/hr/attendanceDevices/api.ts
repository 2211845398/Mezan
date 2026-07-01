import { apiClient } from '@/api/client';

export type AttendanceDeviceRead = {
  id: number;
  branch_id: number;
  user_id: number | null;
  name: string;
  device_code: string;
  is_active: boolean;
  qr_token_version: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  branch_name?: string | null;
  user_email?: string | null;
};

export type KioskUserCandidateRead = {
  id: number;
  email: string;
  first_name: string | null;
  family_name: string | null;
  branch_id: number | null;
};

export type AttendanceDeviceCreate = {
  branch_id: number;
  name: string;
  device_code?: string | null;
  user_id?: number | null;
  kiosk_password?: string | null;
  kiosk_email?: string | null;
  kiosk_first_name?: string | null;
  kiosk_family_name?: string | null;
};

export type AttendanceDeviceUpdate = {
  name?: string;
  branch_id?: number;
  user_id?: number | null;
  is_active?: boolean;
  kiosk_password?: string | null;
  kiosk_email?: string | null;
  kiosk_first_name?: string | null;
  kiosk_family_name?: string | null;
};

export type AttendanceQrPayloadRead = {
  qr_payload: string;
  expires_in_seconds: number;
  branch_id: number;
  device_id: number;
};

export async function listAttendanceDevices(branchId?: number): Promise<AttendanceDeviceRead[]> {
  const { data } = await apiClient.get<AttendanceDeviceRead[]>('/attendance-devices', {
    params: branchId ? { branch_id: branchId } : undefined,
  });
  return data;
}

export async function listKioskUserCandidates(
  branchId: number,
  excludeDeviceId?: number,
): Promise<KioskUserCandidateRead[]> {
  const { data } = await apiClient.get<KioskUserCandidateRead[]>(
    '/attendance-devices/kiosk-user-candidates',
    {
      params: {
        branch_id: branchId,
        ...(excludeDeviceId != null ? { exclude_device_id: excludeDeviceId } : {}),
      },
    },
  );
  return data;
}

export async function createAttendanceDevice(
  body: AttendanceDeviceCreate,
): Promise<AttendanceDeviceRead> {
  const { data } = await apiClient.post<AttendanceDeviceRead>('/attendance-devices', body);
  return data;
}

export async function updateAttendanceDevice(
  id: number,
  body: AttendanceDeviceUpdate,
): Promise<AttendanceDeviceRead> {
  const { data } = await apiClient.patch<AttendanceDeviceRead>(`/attendance-devices/${id}`, body);
  return data;
}

/**
 * Rotates and returns a fresh single-use attendance QR for the currently
 * authenticated kiosk user. Resolution of the kiosk's own device happens
 * server-side from the auth token, so no locally cached `deviceId` is
 * required (mirrors the mobile kiosk's `POST /me/qr/generate` flow).
 */
export async function getAttendanceKioskQr(): Promise<AttendanceQrPayloadRead> {
  const { data } = await apiClient.post<AttendanceQrPayloadRead>(
    '/attendance-devices/me/qr/generate',
  );
  return data;
}
