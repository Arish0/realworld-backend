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
    async ({}, use) => {
      console.log('[MEMORY] test fixture start', process.memoryUsage());
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
