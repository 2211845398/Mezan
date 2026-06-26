const KEY = 'mezan.attendance.kiosk_device_id';

export const DEV_DEFAULT_DEVICE_ID = 1;

export function getCachedKioskDeviceId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const id = Number.parseInt(raw, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/** Cached kiosk device id, or dev default `1` when unset in development. */
export function resolveKioskDeviceId(isDev: boolean): number {
  const cached = getCachedKioskDeviceId();
  if (cached != null) return cached;
  if (isDev) return DEV_DEFAULT_DEVICE_ID;
  throw new Error('Attendance kiosk device is not configured');
}

export function setCachedKioskDeviceId(id: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, String(id));
  } catch {
    // private mode / quota
  }
}

export function clearCachedKioskDeviceId(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // private mode / quota
  }
}
