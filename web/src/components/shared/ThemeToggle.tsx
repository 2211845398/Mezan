import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/*
 * Topbar theme selector. Uses `next-themes` with three choices — light,
 * dark, and "system" — so operators keep the OS preference when they want
 * it. The trigger icon tracks the currently-resolved theme so a user on
 * `system` sees the effective icon.
 */

export function ThemeToggle() {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const Icon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={t('layout.toggle_theme')}>
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="me-2 size-4" aria-hidden="true" />
          {t('theme.light')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="me-2 size-4" aria-hidden="true" />
          {t('theme.dark')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="me-2 size-4" aria-hidden="true" />
          {t('theme.system')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThemeToggle;
