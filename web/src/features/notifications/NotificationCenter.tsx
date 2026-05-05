import { Bell } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatIso } from '@/lib/date';
import { notify } from '@/lib/toast';

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMyNotifications,
  useUnreadNotificationCount,
} from './queries';

export function NotificationCenter() {
  const { t, i18n } = useTranslation('common');
  const navigate = useNavigate();
  const shownToastIds = useRef<Set<number>>(new Set());
  const { data: unread = [] } = useMyNotifications({ unreadOnly: true });
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    for (const item of unread) {
      if (shownToastIds.current.has(item.id)) continue;
      shownToastIds.current.add(item.id);
      notify.info(item.title, {
        description: item.body,
        id: `notification-${item.id}`,
        durationMs: 7000,
      });
    }
  }, [unread]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`relative transition-colors hover:bg-muted/80 hover:text-primary ${
            unreadCount > 0 ? 'text-primary' : 'text-muted-foreground'
          }`}
          aria-label={t('notifications.open')}
        >
          <Bell className="size-5" strokeWidth={unreadCount > 0 ? 2.25 : 2} />
          {unreadCount > 0 ? (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir={i18n.dir()}
        align="end"
        className="z-[70] w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <div className="min-w-0">
            <h2 className="font-semibold">{t('notifications.title')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('notifications.unread_count', { count: unreadCount })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => navigate('/notifications')}>
              {t('notifications.view_inbox_page')}
            </Button>
            {unread.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
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
            ) : null}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {unread.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t('notifications.empty')}</p>
          ) : (
            unread.map((item) => (
              <div key={item.id} className="border-b p-3 last:border-b-0">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatIso(item.created_at, 'yyyy-MM-dd HH:mm')}
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        markRead.mutate(item.id, {
                          onSuccess: () => notify.success(t('toasts.marked_read')),
                        })
                      }
                      disabled={markRead.isPending}
                    >
                      {t('notifications.mark_read')}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationCenter;
