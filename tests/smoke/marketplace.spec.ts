import { test, expect } from '../../fixtures/testFixture';

test.describe('Marketplace smoke tests', () => {
  test('opens marketplace page', async ({ marketplacePage, page }) => {
    await marketplacePage.open();
    await expect(page).toHaveURL(/marketplace/);
  });
});

