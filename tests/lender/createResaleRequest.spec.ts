import { test } from '../../fixtures/lenderFixture';

test.describe('Resale request', () => {
  test.skip('creates a resale request', async ({ resaleService }) => {
    await resaleService.createResaleRequest('1100');
  });
});

