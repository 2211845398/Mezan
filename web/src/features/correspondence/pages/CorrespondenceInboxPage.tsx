import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { listCorrespondenceInbox } from '../api';

function statusBadgeVariant(status: string): 'default' | 'successSoft' | 'outline' {
  if (status === 'open') return 'default';
  if (status === 'answered') return 'successSoft';
  return 'outline';
}

export default function CorrespondenceInboxPage() {
  const { t } = useTranslation('correspondence');
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['correspondence', 'inbox'],
    queryFn: listCorrespondenceInbox,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <PageHeader
        title={t('inbox_title')}
        description={t('inbox_subtitle')}
        actions={
          <Button asChild>
            <Link to="/correspondence/compose">{t('compose')}</Link>
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t('empty_inbox')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((thread) => (
            <Link
              key={thread.id}
              to={`/correspondence/${thread.id}`}
              className="group block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Card className="transition-colors group-hover:border-muted-foreground/25 group-hover:bg-muted/45 group-hover:shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                  <CardTitle className="text-base">{thread.subject}</CardTitle>
                  <Badge variant={statusBadgeVariant(thread.status)}>
                    {t(`status.${thread.status}`)}
                  </Badge>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t(`request_type.${thread.request_type}`)} · {thread.target_role_code}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Button variant="outline" onClick={() => void refetch()}>
        {t('refresh')}
      </Button>
    </div>
  );
}
