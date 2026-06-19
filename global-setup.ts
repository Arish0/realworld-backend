import { type FullConfig } from '@playwright/test';
import { logger } from './utils/logger';

async function globalSetup(_config: FullConfig): Promise<void> {
  logger.info('Starting global setup');
}

export default globalSetup;

