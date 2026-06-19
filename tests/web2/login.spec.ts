import { test, expect } from '../../fixtures/testFixture';

const email = process.env.REALWORLD_WEB2_EMAIL ?? 'brooklyn@yopmail.com';
const password = process.env.REALWORLD_WEB2_PASSWORD ?? 'Test@1233333';

test.describe('Web2 login', () => {
  test('logs in with Brooklyn email account', async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.login(email, password);

    await expect(page).toHaveURL(/\/(dashboard|my-wallet)/, { timeout: 30000 });
  });
});

