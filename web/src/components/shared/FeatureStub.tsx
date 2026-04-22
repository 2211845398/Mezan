import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Placeholder used by every W-5 feature route until its real page lands.
 * Accepts a `labelKey` pointing at `nav.*` so the heading matches the
 * sidebar entry the user clicked, and an `epic` label so reviewers can see
 * which backlog ticket owns the gap.
 */
export default function FeatureStub({
  labelKey,
  epic,
}: {
  labelKey: string;
  epic: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-md border border-dashed border-border p-8 text-center">
      <Construction className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold">{t(labelKey)}</h1>
      <p className="text-sm text-muted-foreground">
        {t('auth:stub.body', { epic })}
      </p>
    </div>
  );
}
