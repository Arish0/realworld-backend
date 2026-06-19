import { test } from '../../fixtures/borrowerFixture';

test.describe('Redeem request', () => {
  test.skip('creates a redeem request', async ({ redeemService }) => {
    await redeemService.redeem();
  });
});

