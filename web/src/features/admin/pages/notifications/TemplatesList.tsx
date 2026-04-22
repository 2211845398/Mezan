import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermission } from '@/hooks/usePermission';

import { useNotificationTemplates } from '../../queries';
import { TemplateEdit } from './TemplateEdit';

export default function TemplatesList() {
  const { t } = useTranslation('admin');
  const { data: rows = [], isLoading, refetch } = useNotificationTemplates();
  const canUpdate = usePermission('config', 'update');
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{t('notifications.templates_lead')}</p>
        {canUpdate ? (
          <Button
            onClick={() => {
              setEditing('__new__');
            }}
          >
            {t('notifications.new_template')}
          </Button>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>kind</TableHead>
            <TableHead>{t('notifications.col.title_tpl')}</TableHead>
            <TableHead>{t('notifications.col.active')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={4}>{t('loading')}</TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.kind}</TableCell>
                <TableCell className="max-w-md truncate text-xs">{r.title_template}</TableCell>
                <TableCell>{r.is_active ? t('yes') : t('no')}</TableCell>
                <TableCell>
                  {canUpdate ? (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(r.kind)}>
                        {t('actions.edit')}
                      </Button>
                      <Button type="button" size="sm" variant="link" asChild>
                        <Link to={`/admin/notifications/templates/${encodeURIComponent(r.kind)}`}>
                          {t('notifications.open_dedicated')}
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {editing ? (
        <TemplateEdit
          kind={editing === '__new__' ? null : editing}
          open={!!editing}
          onOpenChange={(o) => {
            if (!o) {
              setEditing(null);
              void refetch();
            }
          }}
        />
      ) : null}
    </div>
  );
}
