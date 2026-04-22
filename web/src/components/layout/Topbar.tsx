import { Languages, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

export function Topbar() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();

  function toggleLang() {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    void i18n.changeLanguage(next);
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="text-lg font-semibold">{t('layout.app_name')}</div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleLang}
          aria-label={t('layout.toggle_language')}
        >
          <Languages className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          aria-label={t('layout.toggle_theme')}
        >
          {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}

export default Topbar;
