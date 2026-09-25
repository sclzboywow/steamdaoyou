import { resolveCorsOrigin } from './origins';

export const apiCorsOptions = {
  origin: resolveCorsOrigin,
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'Idempotency-Key',
    'x-altcha-payload',
    'x-llm-api-key',
    'x-llm-model',
    'x-llm-provider',
    'x-distribution-channel',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['set-auth-token'],
  credentials: true,
  maxAge: 600,
};
