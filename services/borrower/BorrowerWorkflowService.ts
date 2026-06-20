import { expect, type Page } from '@playwright/test';
import { borrowerEmail, borrowerPassword } from '../../config/testData/borrowerData';
import { type LoginPage } from '../../pages/common/LoginPage';
import { type WalletPage } from '../../pages/common/WalletPage';

export async function loginAndOpenWallet(loginPage: LoginPage, walletPage: WalletPage, page: Page): Promise<void> {
  await loginPage.open();
  await loginPage.login(borrowerEmail(), borrowerPassword());
  await expect(page).toHaveURL(/\/(dashboard|my-wallet)/, { timeout: 30000 });

  await walletPage.open();
}

export async function expectBorrowableNft(walletPage: WalletPage): Promise<void> {
  await expect.poll(() => walletPage.borrowableNftCount(), {
    message: 'Expected at least one NFT with a borrow action in my wallet',
  }).toBeGreaterThan(0);
}
