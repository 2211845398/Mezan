import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumber } from '@/lib/format';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function Pagination({
  page,
  pageSize,
  totalRows,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const isRtl = i18n.language === 'ar';

  // In RTL the chevrons should visually reverse: "next" points to the start
  // of the viewport when reading RTL. We pick the correct glyph statically
  // based on language instead of relying on CSS transforms.
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;
  const FirstIcon = isRtl ? ChevronsRight : ChevronsLeft;
  const LastIcon = isRtl ? ChevronsLeft : ChevronsRight;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{t('table.rows_per_page')}</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-20" aria-label={t('table.rows_per_page')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={String(opt)}>
                {formatNumber(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4 text-muted-foreground">
        <span>
          {t('table.page_x_of_y', {
            page: formatNumber(clamped),
            total: formatNumber(totalPages),
          })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(1)}
            disabled={clamped <= 1}
            aria-label={t('table.first_page')}
          >
            <FirstIcon className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(clamped - 1)}
            disabled={clamped <= 1}
            aria-label={t('table.prev_page')}
          >
            <PrevIcon className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(clamped + 1)}
            disabled={clamped >= totalPages}
            aria-label={t('table.next_page')}
          >
            <NextIcon className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(totalPages)}
            disabled={clamped >= totalPages}
            aria-label={t('table.last_page')}
          >
            <LastIcon className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
