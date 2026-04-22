import { forwardRef } from 'react';

import { ThermalReceiptInner } from './ThermalReceiptInner';
import type { ThermalReceiptModel } from './types';

export const ThermalReceipt58 = forwardRef<HTMLDivElement, { model: ThermalReceiptModel }>(
  function ThermalReceipt58({ model }, ref) {
    return (
      <div ref={ref} className="w-[58mm] bg-white p-2 text-foreground print:w-[58mm]">
        <ThermalReceiptInner model={model} />
      </div>
    );
  },
);
