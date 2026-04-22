import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router-dom';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/*
 * Navigation blocker for dirty forms. Mount inside any form whose dirty
 * state should cost the user a confirmation before leaving the route:
 *
 *   <UnsavedChangesPrompt when={form.formState.isDirty} />
 *
 * Uses React Router v7's `useBlocker` to intercept history transitions;
 * the consumer can pass a localised title/description to override the
 * defaults.
 */

export function UnsavedChangesPrompt({
  when,
  title,
  description,
}: {
  when: boolean;
  title?: string;
  description?: string;
}) {
  const { t } = useTranslation();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!when) return false;
    return currentLocation.pathname !== nextLocation.pathname;
  });

  React.useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!when) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);

  const isOpen = blocker.state === 'blocked';

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? t('form.unsaved_title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? t('form.unsaved_body')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.state === 'blocked' && blocker.reset()}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => blocker.state === 'blocked' && blocker.proceed()}>
            {t('form.discard')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
