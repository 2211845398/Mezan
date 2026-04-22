import { forwardRef } from 'react';

import { ThermalReceiptInner } from './ThermalReceiptInner';
import type { ThermalReceiptModel } from './types';

/** Credit note uses same thermal layout with `isReturn` / `creditNumber` on the model. */
export const CreditNoteReceipt = forwardRef<HTMLDivElement, { model: ThermalReceiptModel }>(
  function CreditNoteReceipt({ model }, ref) {
    return (
      <div ref={ref} className="w-[80mm] bg-white p-3 text-foreground print:w-[80mm]">
        <ThermalReceiptInner model={{ ...model, isReturn: true }} />
      </div>
    );
  },
);
