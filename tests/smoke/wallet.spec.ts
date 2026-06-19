import { test, expect } from '../../fixtures/testFixture';

test.describe('Wallet smoke tests', () => {
  test('opens wallet page', async ({ walletPage, page }) => {
    await walletPage.open();
    await expect(page).toHaveURL(/wallet/);
  });
});

