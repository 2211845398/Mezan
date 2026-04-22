import { forwardRef } from 'react';

import { ThermalReceiptInner } from './ThermalReceiptInner';
import type { ThermalReceiptModel } from './types';

export const ThermalReceipt80 = forwardRef<HTMLDivElement, { model: ThermalReceiptModel }>(
  function ThermalReceipt80({ model }, ref) {
    return (
      <div ref={ref} className="w-[80mm] bg-white p-3 text-foreground print:w-[80mm]">
        <ThermalReceiptInner model={model} />
      </div>
    );
  },
);
