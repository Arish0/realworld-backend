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
  async open(): Promise<void> {
    await this.goto(ROUTES.borrower.borrow);
  }

  async createBorrowRequest(amount: string, durationDays: number): Promise<void> {
    await this.fill(borrowLocators.amountInput, amount);
    await this.fill(borrowLocators.durationInput, String(durationDays));
    await this.click(borrowLocators.submitButton);
  }

  async waitForLoanForm(): Promise<void> {
    await this.expectVisible(borrowLocators.amountInput);
    await this.expectVisible(borrowLocators.submitButton);
  }

  async applyLoanRequestOptions(options: LoanRequestOptions): Promise<void> {
    if (options.currency) {
      await this.page.locator(borrowLocators.currencySelect).selectOption({ label: options.currency });
    }

    if (options.durationDays !== undefined) {
      await this.click(borrowLocators.durationOption(options.durationDays));
    }

    if (options.apr !== undefined) {
      await this.fill(borrowLocators.aprInput, options.apr);
    }

    if (options.interestRepayment || options.allowEarlyRepayment) {
      await this.showAdvancedOptions();
    }

    if (options.interestRepayment) {
      await this.click(borrowLocators.interestRepaymentOption(options.interestRepayment));
    }

    if (options.allowEarlyRepayment) {
      await this.click(borrowLocators.earlyRepaymentOption(options.allowEarlyRepayment));
    }

    if (options.loanAmount !== undefined) {
      await this.setLoanAmount(options.loanAmount);
    }
  }

  async setLoanAmount(amount: string): Promise<void> {
    const amountInput = this.page.locator(borrowLocators.amountInput);
    await amountInput.click();
    await amountInput.press('Control+A');
    await amountInput.press('Backspace');
    await amountInput.type(amount);
  }

  async setApr(apr: string): Promise<void> {
    const aprInput = this.page.locator(borrowLocators.aprInput);
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
    const requestButton = this.page.getByRole('button', { name: /Request loan/i });
    await expect(requestButton).toBeEnabled();
    await requestButton.scrollIntoViewIfNeeded();
    await requestButton.click({ force: true });
    await this.page.waitForTimeout(3000);

    const confirmButton = this.page.getByRole('button', { name: /^Confirm\.?$/ });
    if (!(await confirmButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      await requestButton.evaluate((button: HTMLElement) => button.click());
    }
  }

  async ensureDefaultRequiredTerms(): Promise<void> {
    const currentAmount = await this.page.locator(borrowLocators.amountInput).inputValue();
    const currentApr = await this.page.locator(borrowLocators.aprInput).inputValue();

    await this.setLoanAmount(currentAmount);
    await this.page.locator(borrowLocators.currencySelect).selectOption({ label: '$RW' });
    await this.page.locator(borrowLocators.durationOption(90)).last().click();
    await this.setApr(currentApr || '15');
    await this.showAdvancedOptions();
    await this.clickListItemIfVisible('End of loan.');
    await this.clickListItemIfVisible('Yes.');
  }

  async confirmLoanRequest(): Promise<void> {
    const confirmButton = this.page.getByRole('button', { name: /^Confirm\.?$/ });
    await confirmButton.waitFor({ state: 'visible', timeout: 30000 });
    await confirmButton.click();
  }

  async waitForLoanRequestedSuccess(): Promise<void> {
    const success = await this.waitForLoanRequestResult();
    expect(success, 'Expected loan request to finish successfully').toBeTruthy();
  }

  async waitForLoanRequestResult(): Promise<boolean> {
    await this.page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 30000 });
    await this.page.getByRole('button', { name: 'Okay.' }).waitFor({ state: 'visible', timeout: 120000 });
    return !(await this.page.locator('img[alt="failed"]').isVisible().catch(() => false));
  }

  async closeLoanRequestedSuccess(): Promise<void> {
    const okayButton = this.page.getByRole('button', { name: 'Okay.' });
    if (await okayButton.isVisible().catch(() => false)) {
      await okayButton.click();
    }
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
    if (!(await firstLoan.isVisible({ timeout: 5000 }).catch(() => false))) {
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
    await this.page.getByRole('button', { name: 'Okay.' }).click();
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
    if (await element.isVisible({ timeout: 3000 }).catch(() => false)) {
      await element.click();
    }
  }

  private async clickListItemIfVisible(name: string): Promise<void> {
    const element = this.page.getByRole('listitem', { name, exact: true }).last();
    if (await element.isVisible({ timeout: 3000 }).catch(() => false)) {
      await element.click();
    }
  }
}
