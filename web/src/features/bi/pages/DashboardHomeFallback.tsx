import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFilteredNavigation } from '@/config/navigationFilter';
import { actionableNavLeaves } from '@/config/navigationLeaves';

import { NoModuleAccessCard } from '../components/NoModuleAccessCard';

/**
 * Non-executive home: shortcuts derived from the same RBAC-trimmed nav tree
 * as the sidebar (no extra API).
 */
export default function DashboardHomeFallback() {
  const { t } = useTranslation('bi');
  const { t: tCommon } = useTranslation('common');
  const visible = useFilteredNavigation();
  const leaves = useMemo(() => actionableNavLeaves(visible), [visible]);

  if (leaves.length === 0) {
    return (
      <div className="flex min-h-[min(28rem,calc(100dvh-12rem))] flex-col items-center justify-center py-8">
        <NoModuleAccessCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('home.welcome_title')} subtitle={t('home.welcome_subtitle')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('home.shortcuts_title')}</CardTitle>
          <CardDescription>{t('home.shortcuts_hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {leaves.map((leaf) => (
              <li key={leaf.href}>
                <Button variant="secondary" className="h-auto w-full justify-start py-3" asChild>
                  <Link to={leaf.href}>{tCommon(leaf.labelKey)}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
