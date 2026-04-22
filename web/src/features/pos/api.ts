import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type CurrentShiftParams =
  paths['/api/v1/pos/shifts/current']['get']['parameters']['query'];
type PosShiftRead = paths['/api/v1/pos/shifts/current']['get']['responses']['200']['content']['application/json'];
/** Open shift row (API may return null when no shift is open). */
type PosShiftOpen = NonNullable<PosShiftRead>;
type OpenShiftBody =
  paths['/api/v1/pos/shifts/open']['post']['requestBody']['content']['application/json'];
type CashEventBody =
  paths['/api/v1/pos/shifts/{shift_id}/cash-events']['post']['requestBody']['content']['application/json'];
type CloseShiftBody =
  paths['/api/v1/pos/shifts/{shift_id}/close']['post']['requestBody']['content']['application/json'];

type CartRead = paths['/api/v1/pos/carts/{cart_id}']['get']['responses']['200']['content']['application/json'];
type CreateCartBody = paths['/api/v1/pos/carts']['post']['requestBody']['content']['application/json'];
type CartLineBody =
  paths['/api/v1/pos/carts/{cart_id}/lines']['post']['requestBody']['content']['application/json'];
type CartDiscountBody =
  paths['/api/v1/pos/carts/{cart_id}/discounts']['post']['requestBody']['content']['application/json'];
type CartStateBody =
  paths['/api/v1/pos/carts/{cart_id}/state']['post']['requestBody']['content']['application/json'];

type PaymentIntentBody =
  paths['/api/v1/pos/payments/intents']['post']['requestBody']['content']['application/json'];
type PaymentIntentRead =
  paths['/api/v1/pos/payments/intents']['post']['responses']['201']['content']['application/json'];
type PaymentCaptureBody =
  paths['/api/v1/pos/payments/capture']['post']['requestBody']['content']['application/json'];

type FinalizeBody =
  paths['/api/v1/pos/sales/finalize']['post']['requestBody']['content']['application/json'];
type SalesInvoiceRead =
  paths['/api/v1/pos/sales/finalize']['post']['responses']['200']['content']['application/json'];
type SalesInvoiceDetailRead =
  paths['/api/v1/sales-invoices/{invoice_id}']['get']['responses']['200']['content']['application/json'];
type SalesInvoiceListItem =
  paths['/api/v1/sales-invoices']['get']['responses']['200']['content']['application/json'][number];

type ListInvoicesParams = paths['/api/v1/sales-invoices']['get']['parameters']['query'];

type ReturnLookupParams =
  paths['/api/v1/pos/returns/invoice-lookup']['get']['parameters']['query'];
type ReturnLookupRead =
  paths['/api/v1/pos/returns/invoice-lookup']['get']['responses']['200']['content']['application/json'];

type ReturnBody = paths['/api/v1/pos/returns']['post']['requestBody']['content']['application/json'];
/** OpenAPI types this as open object; server returns a fixed shape. */
export type ReturnResponse = {
  sales_return_id: number;
  credit_note_id: number;
  credit_number: string;
  total_amount: string;
};

type TerminalRead = paths['/api/v1/terminals']['get']['responses']['200']['content']['application/json'][number];

export type {
  CartRead,
  CreateCartBody,
  FinalizeBody,
  OpenShiftBody,
  PaymentCaptureBody,
  PaymentIntentBody,
  PaymentIntentRead,
  PosShiftOpen,
  PosShiftRead,
  ReturnBody,
  ReturnLookupRead,
  SalesInvoiceDetailRead,
  SalesInvoiceListItem,
  SalesInvoiceRead,
  TerminalRead,
};

export async function getCurrentShift(
  params: CurrentShiftParams,
): Promise<PosShiftRead | null> {
  const { data } = await apiClient.get<PosShiftRead | null>('/pos/shifts/current', { params });
  return data;
}

export async function openShift(body: OpenShiftBody): Promise<NonNullable<PosShiftRead>> {
  const { data } = await apiClient.post<NonNullable<PosShiftRead>>('/pos/shifts/open', body);
  return data;
}

export async function addShiftCashEvent(
  shiftId: number,
  body: CashEventBody,
): Promise<NonNullable<PosShiftRead>> {
  const { data } = await apiClient.post<NonNullable<PosShiftRead>>(
    `/pos/shifts/${shiftId}/cash-events`,
    body,
  );
  return data;
}

export async function closeShift(
  shiftId: number,
  body: CloseShiftBody,
): Promise<NonNullable<PosShiftRead>> {
  const { data } = await apiClient.post<NonNullable<PosShiftRead>>(
    `/pos/shifts/${shiftId}/close`,
    body,
  );
  return data;
}

export async function getCart(cartId: number): Promise<CartRead> {
  const { data } = await apiClient.get<CartRead>(`/pos/carts/${cartId}`);
  return data;
}

export async function createCart(body: CreateCartBody): Promise<CartRead> {
  const { data } = await apiClient.post<CartRead>('/pos/carts', body);
  return data;
}

export async function addCartLine(cartId: number, body: CartLineBody): Promise<CartRead> {
  const { data } = await apiClient.post<CartRead>(`/pos/carts/${cartId}/lines`, body);
  return data;
}

export async function applyCartDiscount(
  cartId: number,
  body: CartDiscountBody,
): Promise<CartRead> {
  const { data } = await apiClient.post<CartRead>(`/pos/carts/${cartId}/discounts`, body);
  return data;
}

export async function changeCartState(cartId: number, body: CartStateBody): Promise<CartRead> {
  const { data } = await apiClient.post<CartRead>(`/pos/carts/${cartId}/state`, body);
  return data;
}

export async function createPaymentIntent(body: PaymentIntentBody): Promise<PaymentIntentRead> {
  const { data } = await apiClient.post<PaymentIntentRead>('/pos/payments/intents', body);
  return data;
}

export async function capturePayment(body: PaymentCaptureBody): Promise<PaymentIntentRead> {
  const { data } = await apiClient.post<PaymentIntentRead>('/pos/payments/capture', body);
  return data;
}

export async function finalizeSale(body: FinalizeBody): Promise<SalesInvoiceRead> {
  const { data } = await apiClient.post<SalesInvoiceRead>('/pos/sales/finalize', body);
  return data;
}

export async function getSalesInvoice(invoiceId: number): Promise<SalesInvoiceDetailRead> {
  const { data } = await apiClient.get<SalesInvoiceDetailRead>(`/sales-invoices/${invoiceId}`);
  return data;
}

export async function listSalesInvoices(
  params: ListInvoicesParams,
): Promise<SalesInvoiceListItem[]> {
  const { data } = await apiClient.get<SalesInvoiceListItem[]>('/sales-invoices', { params });
  return data;
}

export async function lookupReturnInvoice(
  params: ReturnLookupParams,
): Promise<ReturnLookupRead> {
  const { data } = await apiClient.get<ReturnLookupRead>('/pos/returns/invoice-lookup', {
    params,
  });
  return data;
}

export async function submitReturn(body: ReturnBody): Promise<ReturnResponse> {
  const { data } = await apiClient.post<ReturnResponse>('/pos/returns', body);
  return data as ReturnResponse;
}

export async function listTerminals(branchId: number): Promise<TerminalRead[]> {
  const { data } = await apiClient.get<TerminalRead[]>('/terminals', {
    params: { branch_id: branchId },
  });
  return data;
}
