import { toast } from 'sonner';

/** Sonner is mounted in `main.tsx`. */
export const notify = {
  error: (message: string, options?: { description?: string }) => {
    toast.error(message, options);
  },
  warning: (message: string, options?: { description?: string }) => {
    toast.warning(message, options);
  },
};
