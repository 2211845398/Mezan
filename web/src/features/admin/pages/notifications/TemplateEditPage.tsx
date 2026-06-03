import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate,useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';

import { TemplateEdit } from './TemplateEdit';

export default function TemplateEditPage() {
  const { kind = '' } = useParams();
  const decoded = kind ? decodeURIComponent(kind) : '';
  const { t } = useTranslation('admin');
  const nav = useNavigate();
  const [open, setOpen] = useState(true);
  return (
    <div>
      <Button asChild variant="link" className="mb-2">
        <Link to="/admin/notifications/templates">{t('actions.back')}</Link>
      </Button>
      <TemplateEdit
        kind={decoded || null}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) nav('/admin/notifications/templates');
        }}
      />
    </div>
  );
}
