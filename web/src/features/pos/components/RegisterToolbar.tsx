import { ListChecks, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { ShortcutsHelp } from './ShortcutsHelp';

export type RegisterToolbarProps = {
  onReturnOpen: () => void;
};

/** Top actions on the register route (quick nav + return + shortcuts). */
export function RegisterToolbar({ onReturnOpen }: RegisterToolbarProps) {
  const { t } = useTranslation('pos');
  const [pendingOpen, setPendingOpen] = useState(false);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{t('shell.brand')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ShortcutsHelp />
        <Button type="button" variant="outline" className="min-h-9 gap-2" onClick={() => setPendingOpen(true)}>
          <ListChecks className="size-4" aria-hidden />
          {t('pending.title')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-9 gap-2 border-orange-300 text-orange-700 hover:bg-muted hover:text-orange-800"
          onClick={() => onReturnOpen()}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t('return.title')}
        </Button>
      </div>
      <Dialog open={pendingOpen} onOpenChange={setPendingOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <DialogTitle>{t('pending.title')}</DialogTitle>
            <DialogDescription>{t('pending.description')}</DialogDescription>
          </DialogHeader>
          <div className="m-6 max-h-[calc(100dvh-14rem)] overflow-y-auto rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            {t('pending.empty')}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
