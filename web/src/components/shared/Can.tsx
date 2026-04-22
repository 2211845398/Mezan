import type { ReactNode } from 'react';

import { usePermission } from '@/hooks/usePermission';

/*
 * Inline permission gate. Renders `children` only when the current user has
 * the given (resource, action). The optional `fallback` renders when the
 * permission is missing — useful when we need to show a disabled hint
 * instead of just hiding the button.
 *
 * Server-side enforcement still authoritatively guards the mutation; this
 * component is purely a UX affordance (Plan §4.3).
 */

export type CanProps = {
  resource: string;
  action: string;
  fallback?: ReactNode;
  children: ReactNode;
};

export function Can({ resource, action, fallback = null, children }: CanProps) {
  const allowed = usePermission(resource, action);
  return <>{allowed ? children : fallback}</>;
}

export default Can;
