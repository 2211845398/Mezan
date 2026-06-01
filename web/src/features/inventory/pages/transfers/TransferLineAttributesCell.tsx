import type { DraftTransferLine } from './transferDraft';

type TransferLineAttributesCellProps = {
  line: DraftTransferLine;
  lineIndex: number;
  onPatchLine: (index: number, patch: Partial<DraftTransferLine>) => void;
};

export function TransferLineAttributesCell({ line }: TransferLineAttributesCellProps) {
  return (
    <span className="text-sm text-muted-foreground">
      {line.variant_name?.trim() ? line.variant_name : '—'}
    </span>
  );
}
