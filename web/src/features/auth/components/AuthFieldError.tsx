import { cn } from '@/lib/utils';

export type AuthFieldErrorProps = {
  message?: string;
  visible?: boolean;
  className?: string;
  id?: string;
};

/** Visible inline validation message for auth forms (RTL-safe). */
export function AuthFieldError({ message, visible = true, className, id }: AuthFieldErrorProps) {
  if (!visible || !message) {
    return null;
  }

  return (
    <p
      id={id}
      role="alert"
      className={cn(
        'text-sm text-destructive transition-all duration-300 ease-in-out',
        className,
      )}
    >
      {message}
    </p>
  );
}

export default AuthFieldError;
