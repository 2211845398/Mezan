import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

type Step = {
  key: string;
  label: string;
  sublabel?: string | undefined;
};

type Props = {
  steps: Step[];
  current: string;
  className?: string;
};

function getPhase(steps: Step[], current: string, stepKey: string): 'done' | 'active' | 'future' {
  const currentIdx = steps.findIndex((s) => s.key === current);
  const stepIdx = steps.findIndex((s) => s.key === stepKey);
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'active';
  return 'future';
}

export function StatusStepper({ steps, current, className }: Props) {
  return (
    <div className={cn('flex items-start', className)}>
      {steps.map((step, i) => {
        const phase = getPhase(steps, current, step.key);
        const isLast = i === steps.length - 1;
        return (
          <div key={step.key} className="flex flex-1 items-start last:flex-none">
            <div className="flex flex-col items-center">
              {/* Circle */}
              <div
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                  phase === 'done' &&
                    'border-emerald-500 bg-emerald-500 text-white',
                  phase === 'active' &&
                    'border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30',
                  phase === 'future' &&
                    'border-border bg-background text-muted-foreground',
                )}
              >
                {phase === 'done' ? <Check className="size-4" /> : <span>{i + 1}</span>}
              </div>
              {/* Label */}
              <div className="mt-1.5 max-w-[7rem] text-center">
                <p
                  className={cn(
                    'text-xs font-medium leading-tight',
                    phase === 'active' && 'text-primary',
                    phase === 'done' && 'text-emerald-700 dark:text-emerald-400',
                    phase === 'future' && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </p>
                {step.sublabel ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{step.sublabel}</p>
                ) : null}
              </div>
            </div>
            {/* Connector line */}
            {!isLast ? (
              <div className="mx-1 mt-4 h-0.5 flex-1 shrink">
                <div
                  className={cn(
                    'h-full rounded-full transition-colors',
                    phase === 'done' ? 'bg-emerald-500' : 'bg-border',
                  )}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
