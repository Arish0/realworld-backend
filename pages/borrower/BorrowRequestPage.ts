import { expect } from '@playwright/test';
import { ROUTES } from '../../config/constants';
import { borrowLocators } from '../../locators/borrower/borrow.locator';
import { BasePage } from '../common/BasePage';

export type LoanRequestOptions = {
  loanAmount?: string;
  currency?: string;
  durationDays?: number;
  apr?: string;
  interestRepayment?: 'End of loan' | 'Monthly';
  allowEarlyRepayment?: 'Yes' | 'No';
};

export class BorrowRequestPage extends BasePage {
  private amountInput() {
    return this.page.locator(borrowLocators.amountInput)
      .or(this.page.getByRole('textbox').first())
      .filter({ visible: true })
      .first();
  }

  private aprInput() {
    return this.page.locator(borrowLocators.aprInput)
      .or(this.page.getByRole('textbox').nth(1))
      .filter({ visible: true })
      .first();
  }

  private durationOption(days: number) {
    return this.page.locator(borrowLocators.durationOption(days))
      .or(this.page.getByRole('listitem', { name: String(days), exact: true }))
      .filter({ visible: true })
      .last();
  }

  private async selectCurrency(label: string): Promise<void> {
    const comboboxes = this.page.getByRole('combobox').filter({ visible: true });
    const count = await comboboxes.count();

    for (let index = 0; index < count; index += 1) {
      const combobox = comboboxes.nth(index);
      try {
        await combobox.selectOption({ label });
        return;
      } catch (err) {
        // Keep scanning; NFT detail pages also contain storage-fee comboboxes and custom selects.
      }
    }

    console.log(`[BorrowRequest] Currency ${label} was not changed; continuing with the visible default currency.`);
  }

  async open(): Promise<void> {
    await this.goto(ROUTES.borrower.borrow);
  }

  async createBorrowRequest(amount: string, durationDays: number): Promise<void> {
    await this.fill(borrowLocators.amountInput, amount);
    await this.fill(borrowLocators.durationInput, String(durationDays));
    await this.click(borrowLocators.submitButton);
  }

  async waitForLoanForm(): Promise<void> {
    await expect(this.amountInput(), 'Expected loan amount input to be visible').toBeVisible({ timeout: 30000 });
    await expect(
      this.page.getByRole('button', { name: /Request loan/i }).filter({ visible: true }).first(),
      'Expected Request loan button to be visible',
    ).toBeVisible({ timeout: 30000 });
  }

  async applyLoanRequestOptions(options: LoanRequestOptions): Promise<void> {
    console.log('[BorrowRequest] Applying loan attributes', options);

    if (options.currency) {
      console.log(`[BorrowRequest] Setting currency: ${options.currency}`);
      await this.selectCurrency(options.currency);
    }

    if (options.durationDays !== undefined) {
      console.log(`[BorrowRequest] Setting duration days: ${options.durationDays}`);
      await this.durationOption(options.durationDays).click();
    }

    if (options.apr !== undefined) {
      console.log(`[BorrowRequest] Setting APR: ${options.apr}`);
      await this.setApr(options.apr);
    }

    if (options.interestRepayment || options.allowEarlyRepayment) {
      await this.showAdvancedOptions();
    }

    if (options.interestRepayment) {
      console.log(`[BorrowRequest] Setting interest repayment: ${options.interestRepayment}`);
      await this.click(borrowLocators.interestRepaymentOption(options.interestRepayment));
    }

    if (options.allowEarlyRepayment) {
      console.log(`[BorrowRequest] Setting early repayment: ${options.allowEarlyRepayment}`);
      await this.click(borrowLocators.earlyRepaymentOption(options.allowEarlyRepayment));
    }

    if (options.loanAmount !== undefined) {
      console.log(`[BorrowRequest] Setting loan amount: ${options.loanAmount}`);
      await this.setLoanAmount(options.loanAmount);
    }
  }
  async setLoanAmount(amount: string): Promise<void> {
    const amountInput = this.amountInput();
    await amountInput.click();
    await amountInput.press('Control+A');
    await amountInput.press('Backspace');
    await amountInput.type(amount);
  }

  async setApr(apr: string): Promise<void> {
    const aprInput = this.aprInput();
    await aprInput.click();
    await aprInput.press('Control+A');
    await aprInput.press('Backspace');
    await aprInput.type(apr);
  }

  async showAdvancedOptions(): Promise<void> {
    const advancedButton = this.page.getByRole('button', { name: /Advanced options/i });
    if (await advancedButton.isVisible().catch(() => false)) {
      await advancedButton.click();
    }
  }

  async expectSubmitEnabled(enabled: boolean): Promise<void> {
    const submitButton = this.page.getByRole('button', { name: /Request loan/i });
    if (enabled) {
      await expect(submitButton).toBeEnabled();
      return;
    }

    await expect(submitButton).toBeDisabled();
  }

  async submitDefaultLoanRequest(): Promise<void> {
    console.log('[BorrowRequest] Clicking Request Loan button.');
    const requestButton = this.page.getByRole('button', { name: /Request loan/i }).filter({ visible: true }).last();
    await expect(requestButton, 'Expected visible Request Loan button before confirmation modal').toBeEnabled({ timeout: 30000 });
    await requestButton.scrollIntoViewIfNeeded();
    await requestButton.click({ force: true });
    await this.page.waitForTimeout(3000);

    const confirmButton = this.page.getByRole('button', { name: /^Confirm\.?$/ }).filter({ visible: true }).last();
    const isConfirmVisible = await confirmButton.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
    if (!isConfirmVisible) {
      await requestButton.evaluate((button: HTMLElement) => button.click());
    }
  }

  async ensureDefaultRequiredTerms(): Promise<void> {
    const currentAmount = await this.amountInput().inputValue();
    const currentApr = await this.aprInput().inputValue();

    await this.setLoanAmount(currentAmount);
    await this.page.locator(borrowLocators.currencySelect).selectOption({ label: '$RW' });
    await this.durationOption(90).click();
    await this.setApr(currentApr || '15');
    await this.showAdvancedOptions();
    await this.clickListItemIfVisible('End of loan.');
    await this.clickListItemIfVisible('Yes.');
  }

  async confirmLoanRequest(): Promise<void> {
    const confirmButton = this.page.getByRole('button', { name: /^Confirm\.?$/ })
      .or(this.page.locator('button:has-text("Confirm")'))
      .filter({ visible: true })
      .last();

    await expect(confirmButton, 'Expected visible Confirm button in loan request preview modal').toBeEnabled({
      timeout: 30000,
    });
    await confirmButton.scrollIntoViewIfNeeded();
    await confirmButton.click({ force: true });
  }

  async waitForLoanRequestedSuccess(): Promise<void> {
    const success = await this.waitForLoanRequestResult();
    expect(success, 'Expected loan request to finish successfully').toBeTruthy();
  }

  async waitForLoanRequestResult(): Promise<boolean> {
    await this.page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
      console.log('[BorrowRequest] Processing state did not appear; waiting for final result modal.');
    });
    await this.page.getByRole('button', { name: 'Okay.' }).waitFor({ state: 'visible', timeout: 120000 });
    return !(await this.page.locator('img[alt="failed"]').isVisible().catch(() => false));
  }

  async closeLoanRequestedSuccess(): Promise<void> {
    const okayButton = this.page.getByRole('button', { name: 'Okay.' }).filter({ visible: true }).first();
    if (await okayButton.isVisible().catch(() => false)) {
      await okayButton.click();
    }
    await this.page.locator('.modal').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await this.page.locator('.modal-backdrop').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async openLiveBorrowing(): Promise<void> {
    await this.goto(ROUTES.borrower.borrow);
    await this.expectVisible('text=Live borrowing.');
  }

  async openLiveBorrowingLoan(assetName: string): Promise<void> {
    await this.page.locator(borrowLocators.liveBorrowingLoanCards).filter({ hasText: assetName }).first().click();
    await expect(this.page.getByText('Collateral', { exact: true })).toBeVisible();
  }

  async openFirstLiveBorrowingLoan(): Promise<boolean> {
    await this.openLiveBorrowing();
    const firstLoan = this.page.locator(borrowLocators.liveBorrowingLoanCards).first();
    const isFirstLoanVisible = await firstLoan.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    if (!isFirstLoanVisible) {
      return false;
    }

    await firstLoan.click();
    await expect(this.page.getByText('Collateral', { exact: true })).toBeVisible();
    return true;
  }

  async cancelLoanRequest(): Promise<void> {
    await this.click(borrowLocators.cancelLoanButton);
    await this.expectVisible(borrowLocators.cancelPreviewHeading);
    await this.page.getByRole('button', { name: /^Confirm\.?$/i }).click();
  }

  async waitForLoanCancelledSuccess(): Promise<void> {
    const success = await this.waitForLoanCancellationResult();
    expect(success, 'Expected loan cancellation to finish successfully').toBeTruthy();
  }

  async closeLoanCancelledSuccess(): Promise<void> {
    const okayButton = this.page.getByRole('button', { name: 'Okay.' }).filter({ visible: true }).first();
    if (await okayButton.isVisible().catch(() => false)) {
      await okayButton.click();
    }
    await this.page.locator('.modal').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await this.page.locator('.modal-backdrop').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async waitForLoanCancellationResult(): Promise<boolean> {
    await this.page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 30000 });
    await this.page.getByRole('button', { name: 'Okay.' }).waitFor({ state: 'visible', timeout: 120000 });

    return !(await this.page.locator('img[alt="failed"]').isVisible().catch(() => false));
  }

  async cancelFirstLiveBorrowingLoanIfPresent(): Promise<boolean> {
    if (!(await this.openFirstLiveBorrowingLoan())) {
      return false;
    }

    await this.cancelLoanRequest();
    await this.waitForLoanCancelledSuccess();
    await this.closeLoanCancelledSuccess();
    return true;
  }

  private async clickIfVisible(locator: string): Promise<void> {
    const element = this.page.locator(locator).first();
    const visible = await element.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
    if (visible) {
      await element.click();
    }
  }

  private async clickListItemIfVisible(name: string): Promise<void> {
    const element = this.page.getByRole('listitem', { name, exact: true }).last();
    const visible = await element.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
    if (visible) {
      await element.click();
    }
  }
}










