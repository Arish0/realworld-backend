import { test as base } from '@playwright/test';
import { WalletPage } from '../pages/common/WalletPage';

type WalletFixtures = {
  walletPage: WalletPage;
};

export const test = base.extend<WalletFixtures>({
  walletPage: async ({ page }, use) => use(new WalletPage(page)),
});

export { expect } from '@playwright/test';
