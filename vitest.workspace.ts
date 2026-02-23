import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'services/scraper/vitest.config.ts',
  'packages/scoring/vitest.config.ts',
  'packages/db/vitest.config.ts',
]);
