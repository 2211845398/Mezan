import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFilteredNavigation } from '@/config/navigationFilter';
import { flattenNavLeaves } from '@/config/navigationLeaves';

/**
 * Non-executive home: shortcuts derived from the same RBAC-trimmed nav tree
 * as the sidebar (no extra API).
 */
export default function DashboardHomeFallback() {
  const { t } = useTranslation('bi');
  const { t: tCommon } = useTranslation('common');
  const visible = useFilteredNavigation();
  const leaves = useMemo(() => flattenNavLeaves(visible), [visible]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('home.welcome_title')}</CardTitle>
          <CardDescription>{t('home.welcome_subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">{t('home.shortcuts_hint')}</p>
          {leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('home.no_shortcuts')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {leaves.map((leaf) => (
                <li key={leaf.href}>
                  <Button variant="secondary" className="h-auto w-full justify-start py-3" asChild>
                    <Link to={leaf.href}>{tCommon(leaf.labelKey)}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
