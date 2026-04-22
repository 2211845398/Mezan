import { setupWorker } from 'msw/browser';

import { handlers } from '@/test/msw/handlers';

export const worker = setupWorker(...handlers);
