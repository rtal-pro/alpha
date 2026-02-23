// ---------------------------------------------------------------------------
// Vitest global setup — MSW server lifecycle
// ---------------------------------------------------------------------------

import { beforeAll, afterAll, afterEach } from 'vitest';
import { server } from './mocks/handlers.js';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
