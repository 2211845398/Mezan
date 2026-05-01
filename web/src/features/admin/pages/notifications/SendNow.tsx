import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from '@/components/shared/FloatingFormDialog';
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
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import { BranchIdsMultiPicker } from '../../components/BranchIdsMultiPicker';
import { RoleCodesMultiPicker } from '../../components/RoleCodesMultiPicker';
import { useBroadcastNotification } from '../../queries';

type TargetType = 'all' | 'role';

export default function SendNow() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const canSend = usePermission('notifications', 'update');
  const broadcast = useBroadcastNotification();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<number[]>([]);

  const disabled =
    !canSend ||
    broadcast.isPending ||
    title.trim().length === 0 ||
    body.trim().length === 0 ||
    (targetType === 'role' && roleCodes.length === 0);

  async function handleSend() {
    const tid = toast.loading(t('notifications.sending'));
    try {
      const result = await broadcast.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        target_type: targetType,
        role_codes: targetType === 'role' ? roleCodes : null,
        branch_ids: branchIds.length > 0 ? branchIds : null,
        data: { source: 'admin_manual_broadcast' },
      });
      toast.dismiss(tid);
      notify.success(t('notifications.send_success'), {
        description: t('notifications.send_success_desc', {
          count: result.deliveries_created,
          sent: result.deliveries_sent,
          skipped: result.deliveries_skipped,
          failed: result.deliveries_failed,
        }),
      });
      setTitle('');
      setBody('');
      setRoleCodes([]);
      setBranchIds([]);
    } catch {
      toast.dismiss(tid);
      /* 4xx/5xx toasts are emitted by the Axios envelope interceptor */
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-semibold">{t('notifications.send_now_title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('notifications.send_now_lead')}</p>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="notification-title">{t('notifications.message_title')}</Label>
            <Input
              id="notification-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('notifications.message_title_placeholder')}
              disabled={!canSend}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notification-body">{t('notifications.message_body')}</Label>
            <Textarea
              id="notification-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('notifications.message_body_placeholder')}
              className="min-h-28"
              disabled={!canSend}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('notifications.audience')}</Label>
              <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('notifications.audience_all')}</SelectItem>
                  <SelectItem value="role">{t('notifications.audience_roles_union')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <BranchIdsMultiPicker
              label={t('notifications.branch_filter_multi')}
              value={branchIds}
              onChange={setBranchIds}
              disabled={!canSend}
            />
          </div>

          {targetType === 'role' ? (
            <RoleCodesMultiPicker
              label={t('notifications.target_roles')}
              value={roleCodes}
              onChange={setRoleCodes}
              disabled={!canSend}
            />
          ) : null}

          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-sm font-medium">{t('notifications.preview')}</p>
            <p className="mt-2 font-semibold">{title || t('notifications.message_title_placeholder')}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {body || t('notifications.message_body_placeholder')}
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className={floatingFormCloseButtonClassName}
              onClick={() => {
                setTitle('');
                setBody('');
                setRoleCodes([]);
                setBranchIds([]);
              }}
              disabled={broadcast.isPending}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              className={floatingFormApproveButtonClassName}
              onClick={() => void handleSend()}
              disabled={disabled}
            >
              {broadcast.isPending ? (
                <>
                  <Loader2 className="me-2 size-4 animate-spin rtl:me-0 rtl:ms-2" />
                  {tc('notifications.sending_short')}
                </>
              ) : (
                t('notifications.send_now')
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
