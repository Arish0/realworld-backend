import { type Page } from '@playwright/test';
import { walletLocators } from '../locators/common/wallet.locator';

export async function connectWallet(page: Page): Promise<void> {
  await page.locator(walletLocators.connectButton).click();
}

