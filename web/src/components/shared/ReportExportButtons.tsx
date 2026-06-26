import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ReportExportButtonsProps = {
  onExportPdf: () => void | Promise<void>;
  onExportExcel: () => void | Promise<void>;
  pdfPending?: boolean;
  excelPending?: boolean;
  disabled?: boolean;
  className?: string;
  size?: 'default' | 'sm' | 'lg';
};

/** Standardized PDF + Excel export action group for report dashboards. */
export function ReportExportButtons({
  onExportPdf,
  onExportExcel,
  pdfPending = false,
  excelPending = false,
  disabled = false,
  className,
  size = 'sm',
}: ReportExportButtonsProps) {
  const { t } = useTranslation('common');

  return (
    <div className={cn('flex flex-nowrap items-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        size={size}
        className="shrink-0 whitespace-nowrap"
        disabled={disabled || pdfPending}
        onClick={() => void onExportPdf()}
        aria-label={t('export.export_pdf')}
      >
        <FileDown className="me-2 size-4" aria-hidden />
        {t('export.export_pdf')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size={size}
        className="shrink-0 whitespace-nowrap"
        disabled={disabled || excelPending}
        onClick={() => void onExportExcel()}
        aria-label={t('export.export_excel')}
      >
        <FileSpreadsheet className="me-2 size-4" aria-hidden />
        {t('export.export_excel')}
      </Button>
    </div>
  );
}
