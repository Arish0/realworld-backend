import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/common/LoginPage';
import { MarketplacePage } from '../pages/common/MarketplacePage';
import { ProfilePage } from '../pages/common/ProfilePage';
import { WalletPage } from '../pages/common/WalletPage';

type AppFixtures = {
  memoryLogger: void;
  loginPage: LoginPage;
  marketplacePage: MarketplacePage;
  profilePage: ProfilePage;
  walletPage: WalletPage;
};

export const test = base.extend<AppFixtures>({
  memoryLogger: [
    async ({ page }, use) => {
      console.log('[MEMORY] test fixture start', process.memoryUsage());
      page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
      page.on('pageerror', err => console.log(`[BROWSER PAGE ERROR] ${err.message}`));
      page.on('requestfailed', request => {
        console.log(`[BROWSER REQUEST FAILED] ${request.method()} ${request.url()} -> ${request.failure()?.errorText}`);
      });
      page.on('response', async response => {
        if (response.status() < 400) {
          return;
        }

        const request = response.request();
        let body = '';
        try {
          body = await response.text();
        } catch {
          body = '<body unavailable>';
        }

        console.log(`[BROWSER HTTP ERROR] ${request.method()} ${response.url()} -> Status ${response.status()} -> Body: ${body.slice(0, 1000)}`);
      });
      await use();
      console.log('[MEMORY] test fixture end', process.memoryUsage());
    },
    { auto: true },
  ],
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  marketplacePage: async ({ page }, use) => use(new MarketplacePage(page)),
  profilePage: async ({ page }, use) => use(new ProfilePage(page)),
  walletPage: async ({ page }, use) => use(new WalletPage(page)),
});

export { expect } from '@playwright/test';
