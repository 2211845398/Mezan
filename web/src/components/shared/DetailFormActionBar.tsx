import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  preventEditGhostClick,
  useDeferredEditSaveActions,
} from '@/lib/useEditableFormMode';
import { cn } from '@/lib/utils';

import { detailHeaderDangerOutlineButtonClassName } from './FloatingFormDialog';

export type DetailFormSecondaryAction = {
  id: string;
  label: string;
  onClick: () => void;
  variant?: 'outline' | 'destructive';
  disabled?: boolean;
};

export type DetailFormActionBarProps = {
  isEditing: boolean;
  isCreate?: boolean;
  canEdit?: boolean;
  isSubmitting?: boolean;
  saveDisabled?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  /** When set, renders a submit button tied to this form id. */
  formId?: string;
  onSave?: () => void;
  /** Archive / delete / unarchive — shown only in view mode. */
  secondaryActions?: DetailFormSecondaryAction[];
  extraViewActions?: ReactNode;
  className?: string;
};

/**
 * Standard detail-page action bar: Edit in view mode; Save + Cancel in edit mode.
 * DOM order: Cancel then Save (Cancel appears to the right of Save in RTL).
 */
export function DetailFormActionBar({
  isEditing,
  isCreate = false,
  canEdit = true,
  isSubmitting = false,
  saveDisabled = false,
  onStartEdit,
  onCancelEdit,
  formId,
  onSave,
  secondaryActions = [],
  extraViewActions,
  className,
}: DetailFormActionBarProps) {
  const { t } = useTranslation('common');
  const saveActionsReady = useDeferredEditSaveActions(isEditing && !isCreate);

  const handleSaveClick = () => {
    if (onSave) {
      onSave();
      return;
    }
    if (formId) {
      document.getElementById(formId)?.requestSubmit();
    }
  };

  if (isCreate) {
    return (
      <div className={cn('flex flex-wrap items-center justify-end gap-[5px]', className)}>
        {extraViewActions}
        <Button
          type={formId ? 'submit' : 'button'}
          form={formId}
          disabled={isSubmitting || saveDisabled}
          {...(formId ? {} : { onClick: onSave })}
        >
          {t('actions.save')}
        </Button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className={cn('flex flex-wrap items-center justify-end gap-[5px]', className)}>
        <Button
          type="button"
          variant="outline"
          onClick={onCancelEdit}
          disabled={isSubmitting}
        >
          {t('actions.cancel')}
        </Button>
        {saveActionsReady ? (
          <Button
            type="button"
            disabled={isSubmitting || saveDisabled}
            onClick={handleSaveClick}
          >
            {t('actions.save')}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-[5px]', className)}>
      {extraViewActions}
      {secondaryActions.map((action) => (
        <Button
          key={action.id}
          type="button"
          variant="outline"
          className={
            action.variant === 'destructive' ? detailHeaderDangerOutlineButtonClassName : undefined
          }
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </Button>
      ))}
      {canEdit ? (
        <Button
          type="button"
          onPointerDown={preventEditGhostClick}
          onClick={onStartEdit}
        >
          {t('actions.edit')}
        </Button>
      ) : null}
    </div>
  );
}
