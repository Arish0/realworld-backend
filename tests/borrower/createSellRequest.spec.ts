import { test } from '../../fixtures/borrowerFixture';

test.describe('Sell request', () => {
  test.skip('creates a sell request', async ({ sellService }) => {
    await sellService.createSellRequest('1200');
  });
});

