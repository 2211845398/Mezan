import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { MEZ_AUTH_INPUT_CLASS } from '@/lib/fieldFocus';
import { cn } from '@/lib/utils';

const PasswordInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, dir, ...props }, ref) => {
    const { t, i18n } = useTranslation('auth');
    const resolvedDir = dir ?? i18n.dir();
    const [visible, setVisible] = React.useState(false);

    const showLabel = t('password.show');
    const hideLabel = t('password.hide');

    return (
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          data-password-input=""
          dir={resolvedDir}
          className={cn(
            MEZ_AUTH_INPUT_CLASS,
            'pe-10',
            resolvedDir === 'rtl' && 'text-end',
            className,
          )}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          disabled={props.disabled}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
