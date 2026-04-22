import { http, HttpResponse } from 'msw';

import type { UserRead } from '@/api/types';

import { DEFAULT_USER } from './auth';

const BASE = '/api/v1';

export const adminHandlers = [
  http.get(`${BASE}/users`, () => HttpResponse.json([DEFAULT_USER] satisfies UserRead[])),
  http.get(`${BASE}/config`, () => HttpResponse.json([])),
];
