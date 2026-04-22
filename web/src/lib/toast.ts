import { toast } from 'sonner';

/**
 * Single entry point for user-facing notifications. Sonner is mounted once
 * in `main.tsx`; every interceptor and feature routes its user-visible
 * messages through this facade so the UI surface can be swapped later
 * without touching call sites.
 */

export type ToastOptions = { description?: string; durationMs?: number; id?: string | number };

function build(options?: ToastOptions) {
  if (!options) return undefined;
  const payload: { description?: string; duration?: number; id?: string | number } = {};
  if (options.description !== undefined) payload.description = options.description;
  if (options.durationMs !== undefined) payload.duration = options.durationMs;
  if (options.id !== undefined) payload.id = options.id;
  return payload;
}

export const notify = {
  default: (message: string, options?: ToastOptions) => {
    toast(message, build(options));
  },
  success: (message: string, options?: ToastOptions) => {
    toast.success(message, build(options));
  },
  error: (message: string, options?: ToastOptions) => {
    toast.error(message, build(options));
  },
  warning: (message: string, options?: ToastOptions) => {
    toast.warning(message, build(options));
  },
  info: (message: string, options?: ToastOptions) => {
    toast.info(message, build(options));
  },
};
