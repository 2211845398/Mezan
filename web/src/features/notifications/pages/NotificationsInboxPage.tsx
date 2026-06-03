import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { formatIso } from '@/lib/date';
import { notify } from '@/lib/toast';

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMyNotifications,
  useUnreadNotificationCount,
} from '../queries';

type Tab = 'all' | 'unread';

export default function NotificationsInboxPage() {
  const { t, i18n } = useTranslation('common');
  const { t: ta } = useTranslation('admin');
  const [tab, setTab] = useState<Tab>('all');
  const unreadOnly = tab === 'unread';
  const { data: items = [], isLoading } = useMyNotifications({ unreadOnly });
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [items],
  );

  const scrollAreaClassName =
    'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

  return (
    <div className="mx-auto flex h-[calc(100dvh-9.5rem)] max-w-3xl flex-col gap-4 p-4 md:h-[calc(100dvh-10.25rem)] md:p-6 lg:h-[calc(100dvh-10.5rem)]">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold">{t('notifications.inbox_title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('notifications.inbox_lead')}</p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-lg border bg-muted/40 p-1"
          role="tablist"
          dir={i18n.dir()}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'all' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => setTab('all')}
          >
            {t('notifications.tab_all')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'unread'}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'unread' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => setTab('unread')}
          >
            {t('notifications.tab_unread')}
            {unreadCount > 0 ? (
              <span className="ms-1 rounded-full bg-primary/15 px-1.5 text-xs text-primary">{unreadCount}</span>
            ) : null}
          </button>
        </div>
        {unreadCount > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void markAllRead.mutateAsync(undefined, {
                  onSuccess: () => notify.success(t('toasts.marked_read')),
                })
              }
              disabled={markAllRead.isPending}
            >
              {t('notifications.mark_all_read')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">{ta('loading')}</p>
        ) : sorted.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {tab === 'unread' ? t('notifications.empty') : t('notifications.inbox_empty')}
          </p>
        ) : (
          <div className={scrollAreaClassName}>
            <ul className="divide-y">
              {sorted.map((item) => {
                const isUnread = item.read_at == null;
                return (
                  <li key={item.id} className="px-5 py-6 md:px-6 md:py-7">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatIso(item.created_at, 'yyyy-MM-dd HH:mm')}
                        </p>
                      </div>
                      {isUnread ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() =>
                            markRead.mutate(item.id, {
                              onSuccess: () => notify.success(t('toasts.marked_read')),
                            })
                          }
                          disabled={markRead.isPending}
                        >
                          {t('notifications.mark_read')}
                        </Button>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">{t('notifications.read_badge')}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
