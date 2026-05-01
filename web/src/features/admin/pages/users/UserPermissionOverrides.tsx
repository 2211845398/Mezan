import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
  floatingFormDangerButtonSmClassName,
} from '@/components/shared/FloatingFormDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermission } from '@/hooks/usePermission';
import RouteLoader from '@/routes/RouteLoader';

import { deletePermissionOverride, upsertPermissionOverride } from '../../api';
import { getBranchLabel } from '../../lib/branchLabels';
import { computeEffectivePermissionKeys } from '../../lib/effectivePermissions';
import {
  adminKeys,
  useBranches,
  useDeleteOverride,
  usePermissionOverrides,
  usePermissions,
  useRoles,
  useUser,
  useUserRoles,
} from '../../queries';
import type { BranchRead, PermissionRead, PermKey, UserPermissionOverrideRead } from '../../types';

type OverrideMode = 'none' | 'allow' | 'deny';

/** Row order for known actions; any other catalog action is appended alphabetically. */
const ACTION_ORDER = [
  'read',
  'list',
  'create',
  'update',
  'delete',
  'run',
  'discount',
  'approve',
  'export',
  'import',
] as const;

function sortActionsForResource(actions: string[]): string[] {
  const uniq = [...new Set(actions)];
  const ordered: string[] = [];
  for (const a of ACTION_ORDER) {
    if (uniq.includes(a)) ordered.push(a);
  }
  const rest = uniq.filter((a) => !ordered.includes(a)).sort((x, y) => x.localeCompare(y));
  return [...ordered, ...rest];
}

function permissionFromRoles(permissionId: number, rolePermissionSets: number[][]): boolean {
  for (const ids of rolePermissionSets) {
    if (ids.includes(permissionId)) return true;
  }
  return false;
}

function buildMergedOverridesForPreview(
  serverOverrides: UserPermissionOverrideRead[],
  rowState: Record<number, OverrideMode>,
): UserPermissionOverrideRead[] {
  const branch = serverOverrides.filter((o) => o.branch_id != null);
  const byPid = new Map<number, UserPermissionOverrideRead>();
  for (const o of serverOverrides) {
    if (o.branch_id == null) byPid.set(o.permission_id, o);
  }
  for (const [pidStr, mode] of Object.entries(rowState)) {
    const pid = Number(pidStr);
    if (mode === 'none') {
      byPid.delete(pid);
    } else {
      const prev = byPid.get(pid);
      byPid.set(pid, {
        id: prev?.id ?? 0,
        user_id: prev?.user_id ?? 0,
        permission_id: pid,
        branch_id: null,
        effect: mode,
        reason: prev?.reason ?? null,
        created_by_user_id: prev?.created_by_user_id ?? null,
        created_at: prev?.created_at ?? '',
      } as UserPermissionOverrideRead);
    }
  }
  return [...branch, ...byPid.values()];
}

export default function UserPermissionOverrides() {
  const { t, i18n } = useTranslation('admin');
  const { id } = useParams();
  const userId = Number(id);
  const qc = useQueryClient();
  const canUpdate = usePermission('users', 'update');

  const { data: user, isLoading: userLoading, isError: userError } = useUser(userId, {
    enabled: Number.isFinite(userId),
  });
  const { data: permissions = [], isLoading: permLoading } = usePermissions({
    enabled: Number.isFinite(userId),
  });
  const { data: roles = [] } = useRoles({ enabled: Number.isFinite(userId) });
  const { data: userRoles = [], refetch: refetchUserRoles } = useUserRoles(userId, {
    enabled: Number.isFinite(userId),
  });
  const { data: overrides = [], isLoading: ovLoading, refetch: refetchOverrides } =
    usePermissionOverrides(userId, {
      enabled: Number.isFinite(userId),
    });
  const { data: branches = [] } = useBranches(true);
  const del = useDeleteOverride(userId);

  const permissionById = useMemo(
    () => new Map(permissions.map((p) => [p.id, p] as const)),
    [permissions],
  );

  const rolePermissionSets = useMemo(() => {
    const out: number[][] = [];
    for (const ur of userRoles) {
      const r = roles.find((x) => x.id === ur.role_id);
      if (r) out.push(r.permission_ids);
    }
    return out;
  }, [userRoles, roles]);

  const globalOverrides = useMemo(
    () => overrides.filter((o) => o.branch_id == null),
    [overrides],
  );

  const branchOverrides = useMemo(
    () => overrides.filter((o) => o.branch_id != null),
    [overrides],
  );

  const [rowState, setRowState] = useState<Record<number, OverrideMode>>({});

  useEffect(() => {
    if (!permissions.length) return;
    const next: Record<number, OverrideMode> = {};
    for (const p of permissions) {
      const g = globalOverrides.find((o) => o.permission_id === p.id);
      next[p.id] = g ? g.effect : 'none';
    }
    setRowState(next);
  }, [permissions, globalOverrides]);

  const mergedPreviewOverrides = useMemo(
    () => buildMergedOverridesForPreview(overrides, rowState),
    [overrides, rowState],
  );

  const previewEffective = useMemo(
    () =>
      computeEffectivePermissionKeys(rolePermissionSets, permissionById, mergedPreviewOverrides),
    [rolePermissionSets, permissionById, mergedPreviewOverrides],
  );

  const byResource = useMemo(() => {
    const m = new Map<string, PermissionRead[]>();
    for (const p of permissions) {
      const g = m.get(p.resource) ?? [];
      g.push(p);
      m.set(p.resource, g);
    }
    for (const g of m.values()) g.sort((a, b) => a.action.localeCompare(b.action));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      for (const p of permissions) {
        const desired = rowState[p.id] ?? 'none';
        const existing = globalOverrides.find((o) => o.permission_id === p.id);
        if (desired === 'none') {
          if (existing) await deletePermissionOverride(userId, existing.id);
        } else if (!existing || existing.effect !== desired) {
          await upsertPermissionOverride(userId, {
            permission_id: p.id,
            branch_id: null,
            effect: desired,
            reason: null,
          });
        }
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.userOverrides(userId) });
      await qc.invalidateQueries({ queryKey: adminKeys.userRoles(userId) });
      await refetchOverrides();
      await refetchUserRoles();
    },
  });

  function handleToggle(p: PermissionRead) {
    const key = `${p.resource}:${p.action}` as PermKey;
    const effBefore = previewEffective.has(key);
    const fromRole = permissionFromRoles(p.id, rolePermissionSets);

    setRowState((prev) => {
      const next = { ...prev };
      if (!effBefore) {
        if (next[p.id] === 'deny') {
          next[p.id] = 'none';
        } else if (!fromRole) {
          next[p.id] = 'allow';
        }
      } else if (fromRole) {
        next[p.id] = 'deny';
      } else {
        next[p.id] = 'none';
      }
      return next;
    });
  }

  if (!Number.isFinite(userId) || userError) {
    return <p className="p-4 text-destructive">{t('users.not_found')}</p>;
  }
  if (userLoading || !user || permLoading || ovLoading) {
    return <RouteLoader />;
  }

  const busy = del.isPending || syncMutation.isPending;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('users.perm_overrides_title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {user.email} · #{user.id}
          </p>
        </div>
        <Button variant="outline" className={floatingFormCloseButtonClassName} asChild>
          <Link to={`/admin/users/${userId}`}>{t('actions.back')}</Link>
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">{t('users.override_matrix_heading')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('users.override_matrix_lead_simple')}</p>
        </div>

        <div className="max-h-[min(72vh,620px)] space-y-6 overflow-y-auto pe-1 ps-1">
          {byResource.map(([resource, perms]) => {
            const actions = sortActionsForResource(perms.map((p) => p.action));
            const permByAction = new Map(perms.map((p) => [p.action, p]));

            return (
              <div key={resource} className="space-y-2">
                <p className="text-muted-foreground border-border border-b pb-2 ps-1 text-sm font-medium">{resource}</p>
                <div className="overflow-x-auto rounded-md border">
                  <Table dir={i18n.dir()}>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="bg-muted/40 min-w-[160px] whitespace-nowrap px-4 text-start">
                          {t('users.perm_module')}
                        </TableHead>
                        {actions.map((action) => (
                          <TableHead key={action} className="bg-muted/40 min-w-[84px] text-center font-mono text-xs">
                            {action}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="px-4 align-middle font-medium text-start">{resource}</TableCell>
                        {actions.map((action) => {
                          const perm = permByAction.get(action);
                          if (!perm) {
                            return (
                              <TableCell key={action} className="text-center text-muted-foreground">
                                —
                              </TableCell>
                            );
                          }
                          const key = `${perm.resource}:${perm.action}` as PermKey;
                          const checked = previewEffective.has(key);
                          return (
                            <TableCell key={action} className="text-center">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={checked}
                                  disabled={!canUpdate || busy}
                                  onCheckedChange={() => handleToggle(perm)}
                                  aria-label={`${resource}:${action}`}
                                />
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </div>

        {canUpdate ? (
          <div className="pt-2">
            <Button
              type="button"
              className={floatingFormApproveButtonClassName}
              disabled={busy}
              onClick={() => syncMutation.mutate()}
            >
              {t('actions.save')}
            </Button>
          </div>
        ) : null}
      </div>

      {branchOverrides.length ? (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">{t('users.branch_overrides_section')}</h2>
          <Table dir={i18n.dir()}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.col.permission')}</TableHead>
                <TableHead>{t('users.col.effect')}</TableHead>
                <TableHead>{t('users.col.branch')}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {branchOverrides.map((o) => (
                <BranchOverrideRow
                  key={o.id}
                  row={o}
                  permissionById={permissionById}
                  branches={branches}
                  canUpdate={canUpdate}
                  busy={busy}
                  onRemove={async () => {
                    await del.mutateAsync(o.id);
                    await refetchOverrides();
                    await refetchUserRoles();
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function BranchOverrideRow({
  row,
  permissionById,
  branches,
  canUpdate,
  busy,
  onRemove,
}: {
  row: UserPermissionOverrideRead;
  permissionById: Map<number, { resource: string; action: string }>;
  branches: BranchRead[];
  canUpdate: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation('admin');
  const p = permissionById.get(row.permission_id);
  const label = p ? `${p.resource}:${p.action}` : String(row.permission_id);
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{label}</TableCell>
      <TableCell>{row.effect}</TableCell>
      <TableCell>
        {row.branch_id != null ? getBranchLabel(branches, row.branch_id) : '—'}
      </TableCell>
      <TableCell>
        {canUpdate ? (
          <Button
            type="button"
            size="sm"
            className={floatingFormDangerButtonSmClassName}
            disabled={busy}
            onClick={() => void onRemove()}
          >
            {t('actions.remove')}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
