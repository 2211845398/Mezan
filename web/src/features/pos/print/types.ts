export type ThermalLine = {
  name: string;
  qty: number;
  unitPrice: string;
  lineTotal: string;
  taxAmount: string;
};

export type ThermalReceiptModel = {
  branchLabel: string;
  /** Fiscal number when synced; omit or empty when provisional */
  invoiceNumber: string | null;
  /** First 8 chars of client uuid — `TMP-xxxxxxxx` */
  provisionalWatermark?: string;
  isReturn?: boolean;
  creditNumber?: string | null;
  currency: string;
  lines: ThermalLine[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  tendered?: string | null;
  changeDue?: string | null;
  paymentMethod?: string | null;
  createdAtLabel: string;
};
