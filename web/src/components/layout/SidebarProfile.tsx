import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMe } from '@/features/auth/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { resolveMediaUrl, withMediaCacheBust } from '@/lib/mediaUrl';
import { cn } from '@/lib/utils';

function initials(displayName: string | null | undefined, email: string): string {
  const n = displayName?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export type SidebarProfileProps = {
  collapsed: boolean;
};

/**
 * Bottom-of-sidebar account strip: links to `/profile`, matches shell accent styling.
 */
export function SidebarProfile({ collapsed }: SidebarProfileProps) {
  const { t } = useTranslation();
  const { data: me, isLoading } = useMe();
  const avatarCacheBust = useAuthStore((s) => s.avatarCacheBust);

  if (isLoading && !me) {
    return (
      <div
        className={cn(
          'mx-2 mb-1 rounded-lg border-2 border-secondary bg-background px-2 py-2',
          collapsed && 'mx-1 flex justify-center border-0 bg-transparent p-0',
        )}
      >
        <div className="h-10 w-full animate-pulse rounded-md bg-muted/60" />
      </div>
    );
  }

  if (!me) return null;

  const label = me.full_name?.trim() || me.email;
  const sub = me.full_name?.trim() ? me.email : null;
  const ini = initials(me.full_name, me.email);
  const baseAvatar = resolveMediaUrl(me.avatar_url?.trim());
  const avatarSrc = baseAvatar ? withMediaCacheBust(baseAvatar, avatarCacheBust) : null;

  if (collapsed) {
    return (
      <div className="flex justify-center px-1 pb-2 pt-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/profile"
              className={cn(
                'flex size-10 items-center justify-center rounded-full border-2 border-transparent bg-background text-secondary-foreground',
                'outline-none ring-offset-background transition-colors hover:border-secondary hover:bg-muted/80 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
              aria-label={t('layout.open_profile')}
            >
              <Avatar className="size-8 border border-secondary/40">
                {avatarSrc ? <AvatarImage src={avatarSrc} alt="" referrerPolicy="no-referrer" /> : null}
                <AvatarFallback className="bg-secondary/15 text-xs font-semibold text-secondary-foreground num-latin">
                  {ini}
                </AvatarFallback>
              </Avatar>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="px-2 pb-2 pt-3">
      <Link
        to="/profile"
        className={cn(
          'flex items-center gap-3 rounded-lg border-2 border-secondary bg-background px-3 py-2 shadow-sm ring-1 ring-secondary/20',
          'outline-none ring-offset-background transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <Avatar className="size-10 shrink-0 border border-secondary/60">
          {avatarSrc ? <AvatarImage src={avatarSrc} alt="" referrerPolicy="no-referrer" /> : null}
          <AvatarFallback className="bg-secondary/15 text-sm font-semibold text-secondary-foreground num-latin">
            {ini}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 text-start">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          {sub ? (
            <p className="truncate text-xs text-muted-foreground num-latin">{sub}</p>
          ) : null}
        </div>
      </Link>
    </div>
  );
}
