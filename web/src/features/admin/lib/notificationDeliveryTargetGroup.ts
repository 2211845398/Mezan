import type { TFunction } from 'i18next';

import type { NotificationDeliveryRead } from '../types';
import { roleCodeLabel } from './roleLabels';

type Jsonish = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x)).filter((s): s is string => Boolean(s && s.length));
}

function asNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    if (typeof x === 'number' && Number.isFinite(x)) out.push(x);
    else if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) out.push(Number(x));
  }
  return out;
}

function joinRoleLabels(codes: string[], t: TFunction<'admin'>): string {
  const uniq = [...new Set(codes.map((c) => c.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
  const labels = uniq.map((c) => roleCodeLabel(t, c));
  return labels.join(t('notifications.target_group.joiner'));
}

/** Human-readable audience for admin sent-notification history. */
export function formatNotificationDeliveryTargetGroup(
  row: NotificationDeliveryRead,
  t: TFunction<'admin'>,
): string {
  const data = (row.data ?? {}) as Jsonish;
  const kind = row.template_kind;

  if (kind === 'manual') {
    const targetType = asString(data.target_type);
    const roleCodes = asStringArray(data.role_codes);
    const branchIds = asNumberArray(data.branch_ids);
    if (targetType === 'all') {
      if (branchIds.length === 0) return t('notifications.target_group.all_active_users');
      if (branchIds.length === 1) {
        return t('notifications.target_group.all_active_users_one_branch', { id: branchIds[0] });
      }
      return t('notifications.target_group.all_active_users_n_branches', { count: branchIds.length });
    }
    if (targetType === 'role' && roleCodes.length > 0) {
      const roles = joinRoleLabels(roleCodes, t);
      if (branchIds.length === 0) return roles;
      if (branchIds.length === 1) {
        return t('notifications.target_group.roles_one_branch', { roles, id: branchIds[0] });
      }
      return t('notifications.target_group.roles_n_branches', {
        roles,
        count: branchIds.length,
      });
    }
  }

  if (kind === 'manual_broadcast') {
    const trc = asString(data.target_role_code);
    const bidRaw = data.branch_id;
    const bid =
      typeof bidRaw === 'number' && Number.isFinite(bidRaw)
        ? bidRaw
        : typeof bidRaw === 'string' && bidRaw.trim() !== '' && Number.isFinite(Number(bidRaw))
          ? Number(bidRaw)
          : undefined;
    if (trc) {
      const role = roleCodeLabel(t, trc);
      if (bid != null) return t('notifications.target_group.role_at_branch', { role, id: bid });
      return role;
    }
    if (bid != null) return t('notifications.target_group.all_active_one_branch', { id: bid });
    return t('notifications.target_group.all_active_users');
  }

  switch (kind) {
    case 'low_stock':
    case 'expiring_inventory':
      return t('notifications.target_group_kind.warehouse_and_floor');
    case 'payroll_approval_pending':
      return t('notifications.target_group_kind.payroll_approvers');
    case 'backup_failure':
      return t('notifications.target_group_kind.it_and_admin');
    case 'shift_close_reminder':
      return t('notifications.target_group_kind.shift_operator');
    default:
      return t('notifications.target_group.fallback');
  }
}
