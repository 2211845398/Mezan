import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { BranchPicker } from '../../components/BranchPicker';
import { computeEffectivePermissionKeys } from '../../lib/effectivePermissions';
import {
  useDeleteOverride,
  usePermissionOverrides,
  usePermissions,
  useRoles,
  useUpsertOverride,
  useUserRoles,
} from '../../queries';
import type { PermKey, UserPermissionOverrideRead } from '../../types';

type Props = {
  userId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

export function PermissionOverridesDrawer({ userId, open, onOpenChange }: Props) {
  const { t } = useTranslation('admin');
  const { data: permissions = [] } = usePermissions({ enabled: open });
  const { data: roles = [] } = useRoles({ enabled: open });
  const { data: userRoles = [], refetch: refetchUserRoles } = useUserRoles(userId, { enabled: open });
  const { data: overrides = [], refetch: refetchOverrides } = usePermissionOverrides(userId, {
    enabled: open,
  });
  const upsert = useUpsertOverride(userId);
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

  const effective = useMemo(
    () => computeEffectivePermissionKeys(rolePermissionSets, permissionById, overrides),
    [rolePermissionSets, permissionById, overrides],
  );

  const [permId, setPermId] = useState<string>('');
  const [ovBranchId, setOvBranchId] = useState<number | null>(null);
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow');
  const [reason, setReason] = useState('');

  async function handleAdd() {
    if (!permId) return;
    await upsert.mutateAsync({
      permission_id: Number(permId),
      branch_id: ovBranchId,
      effect,
      reason: reason || null,
    });
    setPermId('');
    setOvBranchId(null);
    setReason('');
    await refetchOverrides();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('users.perm_overrides_title')}</SheetTitle>
        </SheetHeader>

        <div>
          <p className="text-muted-foreground mb-1 text-sm">{t('users.effective_permissions')}</p>
          <ul className="max-h-32 overflow-y-auto rounded-md border p-2 text-xs">
            {sortedKeys(effective).map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium">{t('users.override_rows')}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.col.permission')}</TableHead>
                <TableHead>{t('users.col.effect')}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((o) => (
                <OverrideRow
                  key={o.id}
                  row={o}
                  permissionById={permissionById}
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

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{t('users.add_override')}</p>
          <div className="grid gap-2">
            <div>
              <Label>{t('users.col.permission')}</Label>
              <Select value={permId} onValueChange={setPermId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('users.pick_permission')} />
                </SelectTrigger>
                <SelectContent>
                  {permissions.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.resource}:{p.action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <BranchPicker
              label={t('users.override_branch')}
              value={ovBranchId}
              onChange={(b) => setOvBranchId(b)}
              allowClear
              includeArchived
            />
            <div>
              <Label>{t('users.col.effect')}</Label>
              <Select
                value={effect}
                onValueChange={(v) => setEffect(v as 'allow' | 'deny')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">{t('users.effect.allow')}</SelectItem>
                  <SelectItem value="deny">{t('users.effect.deny')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('users.reason')}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!permId || upsert.isPending}
            >
              {t('actions.save')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function sortedKeys(s: Set<PermKey>) {
  return [...s].sort();
}

function OverrideRow({
  row,
  permissionById,
  onRemove,
}: {
  row: UserPermissionOverrideRead;
  permissionById: Map<number, { resource: string; action: string }>;
  onRemove: () => void;
}) {
  const { t } = useTranslation('admin');
  const p = permissionById.get(row.permission_id);
  const label = p ? `${p.resource}:${p.action}` : String(row.permission_id);
  return (
    <TableRow>
      <TableCell>
        {label}
        {row.branch_id != null ? ` @ branch ${row.branch_id}` : ''}
      </TableCell>
      <TableCell>{row.effect}</TableCell>
      <TableCell>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          {t('actions.remove')}
        </Button>
      </TableCell>
    </TableRow>
  );
}
