import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/shared/PageHeader';
import { BackButton } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/toast';

import {
  getCorrespondenceThread,
  patchCorrespondenceStatus,
  postCorrespondenceMessage,
} from '../api';

export default function CorrespondenceThreadPage() {
  const { id } = useParams<{ id: string }>();
  const threadId = Number(id);
  const { t } = useTranslation('correspondence');
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data, isLoading } = useQuery({
    queryKey: ['correspondence', threadId],
    queryFn: () => getCorrespondenceThread(threadId),
    enabled: Number.isFinite(threadId),
  });

  const replyMutation = useMutation({
    mutationFn: () =>
      postCorrespondenceMessage(threadId, { body: reply.trim(), is_internal_note: false }),
    onSuccess: async () => {
      setReply('');
      await qc.invalidateQueries({ queryKey: ['correspondence', threadId] });
      notify.success(t('reply_sent'));
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => patchCorrespondenceStatus(threadId, 'closed'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['correspondence', threadId] });
      notify.success(t('thread_closed'));
    },
  });

  if (!Number.isFinite(threadId)) {
    return <p className="p-4">{t('not_found')}</p>;
  }

  if (isLoading || !data) {
    return <p className="p-4 text-muted-foreground">{t('loading')}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <BackButton to="/correspondence" label={t('back_inbox')} />
      <PageHeader title={data.subject} description={t(`status.${data.status}`)} />

      <div className="space-y-3">
        {data.messages.map((msg) => {
          const isOwn = msg.sender_user_id === currentUserId;
          return (
            <Card
              key={msg.id}
              className={cn(
                'rounded-lg border shadow-sm',
                isOwn ? 'border-primary/15 bg-primary/5' : 'border-border/80 bg-muted/50',
              )}
            >
              <CardContent className="whitespace-pre-wrap py-4 text-sm">{msg.body}</CardContent>
            </Card>
          );
        })}
      </div>

      {data.status !== 'closed' ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={t('reply_placeholder')}
              rows={4}
              className="shadow-sm transition-shadow focus-visible:shadow-md focus-visible:shadow-primary/10"
            />
            <div className="flex flex-row items-center gap-3">
              <Button
                disabled={reply.trim().length < 1 || replyMutation.isPending}
                onClick={() => replyMutation.mutate()}
              >
                {t('send_reply')}
              </Button>
              <Button
                variant="outline"
                disabled={closeMutation.isPending}
                onClick={() => closeMutation.mutate()}
              >
                {t('close_thread')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">{t('thread_closed_hint')}</p>
      )}
    </div>
  );
}
