import { expect, type Page } from '@playwright/test';
import { BorrowRequestPage, type LoanRequestOptions } from '../../pages/borrower/BorrowRequestPage';
import { type WalletPage } from '../../pages/common/WalletPage';
import { expectBorrowableNft } from './BorrowerWorkflowService';
import { BorrowerDetailPage } from '../../pages/borrower/BorrowerDetailPage';

export class BorrowService {
  constructor(private readonly page: Page) {}

  async requestLoanWithRetryAndFallback(walletPage: WalletPage): Promise<{ success: boolean; name: string }> {
    const borrowRequestPage = new BorrowRequestPage(this.page);
    const borrowableNftCount = await walletPage.borrowableNftCount();
    let assetName = '';
    let loanCreated = false;

    // Set up the API response listener on this borrower page for fast fail on bad contract transactions
    let contractTransactionFailed = false;
    const responseListener = async (response: any) => {
      const status = response.status();
      if (response.url().includes('contract-transaction') && status >= 400) {
        contractTransactionFailed = true;
      }
    };
    this.page.on('response', responseListener);

    try {
      const attempt = async (assetIndex: number): Promise<{ success: boolean; name: string }> => {
        const name = await walletPage.nftName(assetIndex);
        await walletPage.requestLoanForNft(assetIndex);
        await borrowRequestPage.waitForLoanForm();

        const amountInput = this.page.locator('#prinicipal');
        await expect(amountInput).toBeVisible({ timeout: 4000 });

        let currentAmount = '';
        for (let idx = 0; idx < 10; idx++) {
          currentAmount = await amountInput.inputValue();
          if (currentAmount && currentAmount !== '0' && currentAmount !== '') {
            break;
          }
          await this.page.waitForTimeout(500);
        }

        const parsedAmt = parseFloat(currentAmount.replace(/[^0-9.]/g, '')) || 0;
        if (parsedAmt < 3000) {
          currentAmount = '3000';
        }

        await amountInput.click();
        await amountInput.press('Control+A');
        await amountInput.press('Backspace');
        await amountInput.type(currentAmount);

        await this.page.locator('select.form-select').selectOption({ label: '$RW' });

        const durationOpt = this.page.locator('xpath=//*[contains(@class,"duration-days")]//li[normalize-space()="90"]').last();
        await expect(durationOpt).toBeVisible({ timeout: 3000 });
        await durationOpt.click();

        const aprInput = this.page.locator('input.form-control.text-end.border-0');
        let currentApr = await aprInput.inputValue();
        if (!currentApr || currentApr === '0' || currentApr === '') {
          currentApr = '15';
        }
        await aprInput.click();
        await aprInput.press('Control+A');
        await aprInput.press('Backspace');
        await aprInput.type(currentApr);

        const advancedButton = this.page.locator('button.viewoption-btn').or(this.page.getByRole('button', { name: /Advanced options/i })).first();
        if (await advancedButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await advancedButton.click();
          await this.page.waitForTimeout(500);
        }

        const endOfLoanItem = this.page.locator('xpath=//li[normalize-space()="End of loan." or normalize-space()="End of loan"]').last();
        if (await endOfLoanItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await endOfLoanItem.click();
        }
        const yesItem = this.page.locator('xpath=//li[normalize-space()="Yes." or normalize-space()="Yes"]').last();
        if (await yesItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await yesItem.click();
        }

        const requestButton = this.page.getByRole('button', { name: /Request loan/i });
        await expect(requestButton).toBeEnabled({ timeout: 3000 });
        await requestButton.scrollIntoViewIfNeeded();
        await requestButton.click({ force: true });

        const confirmButton = this.page.getByRole('button', { name: /^Confirm\.?$/ });
        if (!(await confirmButton.isVisible({ timeout: 2000 }).catch(() => false))) {
          await requestButton.evaluate((button: HTMLElement) => button.click());
        }

        await confirmButton.waitFor({ state: 'visible', timeout: 4000 });
        contractTransactionFailed = false;
        await confirmButton.click();

        try {
          await this.page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 5000 });
        } catch (e) {
          if (contractTransactionFailed) {
            console.log(`Contract transaction failed immediately for ${name}. Skipping...`);
            return { success: false, name: name };
          }
          await this.page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 25000 });
        }

        const okayButton = this.page.getByRole('button', { name: 'Okay.' });
        await okayButton.waitFor({ state: 'visible', timeout: 120000 });

        const isFailed = await this.page.locator('img[alt="failed"]').isVisible().catch(() => false);
        await okayButton.click();

        if (!isFailed) {
          console.log(`Loan request successfully created for NFT: ${name}`);
          return { success: true, name: name };
        } else {
          console.log(`Loan transaction failed for NFT: ${name}.`);
          return { success: false, name: name };
        }
      };

      for (let assetIndex = 0; assetIndex < borrowableNftCount; assetIndex++) {
        try {
          console.log(`Attempting loan request for NFT at index ${assetIndex}...`);
          await walletPage.openAvailableAssets();
          const res = await attempt(assetIndex);
          if (res.success) {
            loanCreated = true;
            assetName = res.name;
            break;
          }
        } catch (err: any) {
          console.log(`Error during loan request for NFT at index ${assetIndex}: ${err.message}. Trying next NFT...`);
          const okayButton = this.page.getByRole('button', { name: 'Okay.' });
          if (await okayButton.isVisible().catch(() => false)) {
            await okayButton.click();
          }
        }

        if (assetIndex < borrowableNftCount - 1) {
          await walletPage.open();
          await walletPage.waitForAssets();
        }
      }

      if (!loanCreated) {
        console.log(`No borrowable NFTs available or all attempts failed. Freeing up the first active negotiation...`);
        await this.cancelFirstWalletLoanRequestIfPresent(walletPage);

        console.log(`Waiting 10 seconds for blockchain state to update...`);
        await this.page.waitForTimeout(10000);

        await walletPage.openAvailableAssets();
        await expectBorrowableNft(walletPage);

        console.log(`Freed up NFT. Attempting loan request...`);
        try {
          const res = await attempt(0);
          if (res.success) {
            loanCreated = true;
            assetName = res.name;
          } else {
            throw new Error('Loan request failed on freed NFT');
          }
        } catch (err: any) {
          console.log(`Error during loan request on freed NFT: ${err.message}`);
          const okayButton = this.page.getByRole('button', { name: 'Okay.' });
          if (await okayButton.isVisible().catch(() => false)) {
            await okayButton.click();
          }
          throw err;
        }
      }
    } finally {
      this.page.off('response', responseListener);
    }

    return { success: loanCreated, name: assetName };
  }

  async createBorrowRequest(amount: string, durationDays: number): Promise<void> {
    const borrowRequestPage = new BorrowRequestPage(this.page);
    await borrowRequestPage.open();
    await borrowRequestPage.createBorrowRequest(amount, durationDays);
  }

  async requestDefaultLoanFromWallet(walletPage: WalletPage, startAssetIndex = 0): Promise<void> {
    await this.requestDefaultLoanFromWalletAndReturnAssetName(walletPage, startAssetIndex);
  }

  async requestDefaultLoanFromWalletAndReturnAssetName(walletPage: WalletPage, startAssetIndex = 0): Promise<string> {
    const borrowRequestPage = new BorrowRequestPage(this.page);
    const borrowableNftCount = await walletPage.borrowableNftCount();

    for (let assetIndex = startAssetIndex; assetIndex < borrowableNftCount; assetIndex += 1) {
      const assetName = await walletPage.nftName(assetIndex);
      await walletPage.requestLoanForNft(assetIndex);
      await borrowRequestPage.waitForLoanForm();
      await borrowRequestPage.ensureDefaultRequiredTerms();
      await borrowRequestPage.submitDefaultLoanRequest();
      await borrowRequestPage.confirmLoanRequest();

      if (await borrowRequestPage.waitForLoanRequestResult()) {
        await borrowRequestPage.closeLoanRequestedSuccess();
        return assetName;
      }

      await borrowRequestPage.closeLoanRequestedSuccess();
      await walletPage.open();
      await walletPage.waitForAssets();
    }

    throw new Error(`Loan request failed for all available wallet NFTs from index ${startAssetIndex}`);
  }

  async cancelWalletLoanRequest(walletPage: WalletPage, assetName: string): Promise<void> {
    const borrowRequestPage = new BorrowRequestPage(this.page);
    const borrowerDetailPage = new BorrowerDetailPage(this.page);

    await walletPage.open();
    await walletPage.openNegotiationAssets();
    await walletPage.openNftCardByName(assetName);

    await borrowerDetailPage.waitForPageLoaded();
    await borrowRequestPage.cancelLoanRequest();
    await borrowRequestPage.waitForLoanCancelledSuccess();
    await borrowRequestPage.closeLoanCancelledSuccess();
    await expect(this.page).toHaveURL(/\/my-wallet/, { timeout: 30000 });
  }

  async cancelFirstWalletLoanRequestIfPresent(walletPage: WalletPage): Promise<boolean> {
    const borrowRequestPage = new BorrowRequestPage(this.page);
    const borrowerDetailPage = new BorrowerDetailPage(this.page);

    await walletPage.open();
    await walletPage.openNegotiationAssets();

    if ((await walletPage.nftCount()) === 0) {
      return false;
    }

    await walletPage.openNftCard(0);
    await borrowerDetailPage.waitForPageLoaded();
    await borrowRequestPage.cancelLoanRequest();
    await borrowRequestPage.waitForLoanCancelledSuccess();
    await borrowRequestPage.closeLoanCancelledSuccess();
    await expect(this.page).toHaveURL(/\/my-wallet/, { timeout: 30000 });
    return true;
  }

  async requestEditedLoanFromWallet(walletPage: WalletPage, assetName: string, options: LoanRequestOptions): Promise<void> {
    const borrowRequestPage = new BorrowRequestPage(this.page);

    await walletPage.open();
    await walletPage.requestLoanForNftByName(assetName);

    await borrowRequestPage.waitForLoanForm();
    await borrowRequestPage.applyLoanRequestOptions(options);
    await expect(this.page.locator('#prinicipal')).toHaveValue(options.loanAmount ?? '');
    await borrowRequestPage.submitDefaultLoanRequest();
    await borrowRequestPage.confirmLoanRequest();
    await borrowRequestPage.waitForLoanRequestedSuccess();
    await borrowRequestPage.closeLoanRequestedSuccess();
  }
}
