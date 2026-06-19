import { test, expect } from '../../fixtures/testFixture';

test.describe('Login smoke tests', () => {
  test('opens login page', async ({ loginPage, page }) => {
    await loginPage.open();
    await expect(page).toHaveURL(/sign-in/);
  });
});
