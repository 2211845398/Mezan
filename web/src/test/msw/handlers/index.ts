import { adminHandlers } from './admin';
import { authHandlers } from './auth';
import { biHandlers } from './bi';
import { catalogHandlers } from './catalog';
import { posHandlers } from './pos';
import { productHandlers } from './products';
import { purchaseOrderHandlers } from './purchaseOrders';

export const handlers = [
  ...authHandlers,
  ...adminHandlers,
  ...productHandlers,
  ...biHandlers,
  ...catalogHandlers,
  ...purchaseOrderHandlers,
  ...posHandlers,
];
