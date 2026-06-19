import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/common/LoginPage';
import { MarketplacePage } from '../pages/common/MarketplacePage';
import { ProfilePage } from '../pages/common/ProfilePage';
import { WalletPage } from '../pages/common/WalletPage';

type AppFixtures = {
  loginPage: LoginPage;
  marketplacePage: MarketplacePage;
  profilePage: ProfilePage;
  walletPage: WalletPage;
};

export const test = base.extend<AppFixtures>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  marketplacePage: async ({ page }, use) => use(new MarketplacePage(page)),
  profilePage: async ({ page }, use) => use(new ProfilePage(page)),
  walletPage: async ({ page }, use) => use(new WalletPage(page)),
});

export { expect } from '@playwright/test';
