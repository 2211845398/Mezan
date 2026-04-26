import type { Permission } from './navigation';

/**
 * Registry of dashboard blocks (permission-gated). The shell loads only blocks
 * the user is allowed to see; ordering can later incorporate role presets
 * (`roleDashboardPresets.ts`).
 */
export type DashboardWidgetId = 'executive_bi';

export type DashboardWidgetMeta = {
  id: DashboardWidgetId;
  permission: Permission;
};

export const dashboardWidgets: readonly DashboardWidgetMeta[] = [
  { id: 'executive_bi', permission: { resource: 'analytics', action: 'read' } },
];
