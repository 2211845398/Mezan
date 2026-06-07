import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/lib/toast';

import { createCorrespondenceThread } from '../api';

const ROLE_OPTIONS = [
  'HR_MANAGER',
  'IT_ADMIN',
  'OWNER',
  'MARKETING_MANAGER',
  'ACCOUNTANT',
] as const;

export default function CorrespondenceComposePage() {
  const { t } = useTranslation('correspondence');
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [requestType, setRequestType] = useState('general');
  const [targetRole, setTargetRole] = useState<string>('HR_MANAGER');
  const [body, setBody] = useState('');

  const create = useMutation({
    mutationFn: () =>
      createCorrespondenceThread({
        subject: subject.trim(),
        request_type: requestType,
        target_role_code: targetRole,
        body: body.trim(),
      }),
    onSuccess: (thread) => {
      notify.success(t('created'));
      navigate(`/correspondence/${thread.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <PageHeader title={t('compose_title')} description={t('compose_subtitle')} />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="corr-subject">{t('subject')}</Label>
          <Input id="corr-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>{t('request_type_label')}</Label>
          <Select value={requestType} onValueChange={setRequestType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['general', 'administrative', 'hr', 'it', 'finance'].map((rt) => (
                <SelectItem key={rt} value={rt}>
                  {t(`request_type.${rt}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('target_role')}</Label>
          <Select value={targetRole} onValueChange={setTargetRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((code) => (
                <SelectItem key={code} value={code}>
                  {t(`roles.${code}`, { defaultValue: code })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="corr-body">{t('message')}</Label>
          <Textarea
            id="corr-body"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <Button
          disabled={
            create.isPending || subject.trim().length < 2 || body.trim().length < 3
          }
          onClick={() => create.mutate()}
        >
          {t('send')}
        </Button>
      </div>
    </div>
  );
}
