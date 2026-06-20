import { type FullConfig } from '@playwright/test';
import { logger } from './utils/logger';

async function globalTeardown(_config: FullConfig): Promise<void> {
  logger.info('Starting global teardown');
  console.log('[MEMORY] global teardown', process.memoryUsage());
}

export default globalTeardown;
