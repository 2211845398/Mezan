import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

import { ShortcutsHelp } from './ShortcutsHelp';

export type RegisterToolbarProps = {
  onReturnOpen: () => void;
};

/** Top actions on the register route (quick nav + return + shortcuts). */
export function RegisterToolbar({ onReturnOpen }: RegisterToolbarProps) {
  const { t } = useTranslation('pos');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="default" className="min-h-11">
          <Link to="/pos">{t('shell.nav_gate')}</Link>
        </Button>
        <Button asChild variant="outline" size="default" className="min-h-11">
          <Link to="/pos/invoices">{t('shell.nav_invoices')}</Link>
        </Button>
        <Button asChild variant="outline" size="default" className="min-h-11">
          <Link to="/pos/close">{t('shell.nav_close')}</Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ShortcutsHelp />
        <Button type="button" variant="secondary" className="min-h-11" onClick={() => onReturnOpen()}>
          {t('return.title')}
        </Button>
      </div>
    </div>
  );
}
